// Server-only Supabase REST replication for the legacy synchronous JSON store.
// One bot instance only. Local files stay as an emergency backup; the cloud
// snapshot is authoritative whenever cloud sync is enabled.
const fs=require('fs');
const path=require('path');
const TABLE='astra_store_snapshots';
const HTTP_TIMEOUT_MS=12_000;
const MAX_ATTEMPTS=4;
const BASE_DELAY_MS=500;
let queue=Promise.resolve();
let queued=0;
let pending=0;
let ready=false;
let healthy=true;
let lastError=null;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function enabled(){return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);}
function settings(){
    const url=String(process.env.SUPABASE_URL||'').trim();
    const key=String(process.env.SUPABASE_SECRET_KEY||'').trim();
    if(!url || !key)throw Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY');
    const parsed=new URL(url);
    if(parsed.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) ||
        parsed.pathname!=='/' || parsed.search || parsed.hash || parsed.username || parsed.password)
        throw Error('SUPABASE_URL must be a clean HTTPS Supabase project URL');
    if(key.startsWith('sb_publishable_') || key.startsWith('eyJ') && !/^eyJ[A-Za-z0-9._-]+$/.test(key))
        throw Error('Provide the server-only Supabase secret key, never the publishable key');
    if(!key.startsWith('sb_secret_') && !key.startsWith('eyJ'))
        throw Error('SUPABASE_SECRET_KEY must be a server-only sb_secret_ or legacy service_role key');
    return{base:parsed.origin+'/rest/v1/'+TABLE,key};
}
async function request(method,query='',data=undefined){
    const {base,key}=settings();
    let last;
    for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),HTTP_TIMEOUT_MS);
        try{
            const response=await fetch(base+query,{
                method,
                headers:{
                    apikey:key,
                    ...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),
                    'Content-Type':'application/json',
                    Prefer:method==='POST'?'resolution=merge-duplicates,return=minimal':'return=representation'
                },
                body:data===undefined?undefined:JSON.stringify(data),
                signal:controller.signal
            });
            if(!response.ok){
                const body=(await response.text()).slice(0,200);
                const err=new Error('Supabase '+method+' failed (HTTP '+response.status+'): '+body);
                if(![408,429,500,502,503,504].includes(response.status))throw Object.assign(err,{permanent:true});
                last=err;
            }else{
                return method==='GET'?response.json():null;
            }
        }catch(error){
            last=error;
            if(error.permanent)throw error;
        }finally{clearTimeout(timeout);}
        if(attempt<MAX_ATTEMPTS)await delay(BASE_DELAY_MS*(2**(attempt-1)));
    }
    throw last||Error('Supabase request failed');
}
function readLocal(dir,name){
    const file=path.join(dir,name+'.json');
    if(!fs.existsSync(file))return null;
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid local JSON root '+name);
    return data;
}
function dirtyPath(dir,name){return path.join(dir,name+'.pending');}
function stage(dir,name){
    if(!enabled())return null;
    if(!ready)throw Error('Cloud storage not bootstrapped');
    const token=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const fp=dirtyPath(dir,name),temp=fp+'.tmp';
    fs.writeFileSync(temp,token,{mode:0o600});
    fs.renameSync(temp,fp);
    return token;
}
function clearDirty(dir,name,token){
    const file=dirtyPath(dir,name);
    if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===token)fs.unlinkSync(file);
}
function persistLocal(dir,name,payload){
    const file=path.join(dir,name+'.json');
    const temp=file+'.cloud-'+process.pid+'.tmp';
    try{
        fs.writeFileSync(temp,JSON.stringify(payload,null,2),{mode:0o600});
        fs.renameSync(temp,file);
    }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
async function bootstrap(dir){
    if(!enabled())return{enabled:false,remote:0,uploaded:0};
    if(ready)return{enabled:true,alreadyReady:true};
    if((process.env.SUPABASE_URL && !process.env.SUPABASE_SECRET_KEY) ||
       (!process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY))
        throw Error('Both Supabase environment variables are required');
    settings();
    const data=await request('GET','?select=store_name,payload&limit=1000');
    if(!Array.isArray(data))throw Error('Supabase returned an invalid snapshot listing');
    const names=new Set();
    for(const row of data){
        if(!/^[a-zA-Z0-9_-]+$/.test(String(row.store_name)) ||
           !row.payload || typeof row.payload!=='object' || Array.isArray(row.payload))
           throw Error('Invalid remote snapshot payload; refusing to overwrite local data');
        names.add(row.store_name);
    }
    // The remote snapshots are authoritative for previously synced stores.
    // For any store not yet in Supabase, migrate the existing local JSON.
    const localFiles=fs.readdirSync(dir).filter(f=>/^[a-zA-Z0-9_-]+\.json$/.test(f));
    let uploaded=0;
    const wasUploaded=new Set();
    for(const filename of localFiles){
        const name=filename.slice(0,-5);
        if(names.has(name) && !fs.existsSync(dirtyPath(dir,name)))continue;
        const local=readLocal(dir,name);
        await request('POST','?on_conflict=store_name',[{store_name:name,payload:local}]);
        clearDirty(dir,name,fs.existsSync(dirtyPath(dir,name))
            ?fs.readFileSync(dirtyPath(dir,name),'utf8'):null);
        names.add(name);
        wasUploaded.add(name);
        uploaded++;
    }
    // Do not touch the JSON files unless every remote fetch and initial
    // upload succeeded. Use the cloud copy for all previously synced stores.
    for(const row of data){
        // A locally pending write is newer than the last acknowledged cloud
        // snapshot and was just uploaded in the loop above.
        if(fs.existsSync(dirtyPath(dir,row.store_name)))continue;
        if(localFiles.includes(row.store_name+'.json') && uploaded>0 &&
           !fs.existsSync(dirtyPath(dir,row.store_name)) &&
           // A store migrated from dirty local data should not be reverted.
           wasUploaded.has(row.store_name))continue;
        persistLocal(dir,row.store_name,row.payload);
    }
    ready=true;healthy=true;lastError=null;
    console.log('[cloudStore] Cloud storage ready: '+data.length+' restored snapshots; '+uploaded+' local stores uploaded.');
    return{enabled:true,remote:data.length,uploaded};
}
function enqueue(name,payload,dir,token){
    if(!enabled())return;
    if(!ready)throw Error('Cloud storage not bootstrapped; refusing unsynced writes');
    const snapshot=structuredClone(payload);
    pending++;
    queue=queue.catch(()=>{}).then(async()=>{
        try{
            await request('POST','?on_conflict=store_name',[{store_name:name,payload:snapshot}]);
            queued++;healthy=true;lastError=null;
            if(dir&&token)clearDirty(dir,name,token);
        }catch(error){
            healthy=false;lastError=String(error.message||error);
            // The local file still exists, but it MUST NOT be treated as synced.
            console.error('[cloudStore] Failed to sync '+name+' to Supabase: '+lastError);
            throw error;
        }finally{pending--;}
    });
    // Never emit an unhandled rejection. A failed flush will be retried from
    // local disk at the next startup. Dashboard diagnostics show unhealthy.
    queue.catch(()=>{});
}
async function flush(){await queue;}
function status(){return{enabled:enabled(),ready,healthy,pending,queued,lastError};}
module.exports={enabled,bootstrap,stage,enqueue,flush,status,settings};
