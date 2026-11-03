// Synchronous, durable JSON store. Wispbyte must preserve ASTRA_DATA_DIR
// (or ./data) across deployments; a wiped container cannot be repaired by
// any local-only database. For multi-node hosting migrate to external Postgres.
const fs=require('fs');
const path=require('path');
const cloud=require('./cloudStore');

const DATA_DIR=process.env.ASTRA_DATA_DIR
    ?path.resolve(process.env.ASTRA_DATA_DIR)
    :path.join(__dirname,'..','data');
fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
const cache=new Map();
let bootstrapped=!cloud.enabled();
async function bootstrap(){
    if(bootstrapped)return{enabled:cloud.enabled(),alreadyReady:true};
    const result=await cloud.bootstrap(DATA_DIR);
    bootstrapped=true;
    return result;
}
function ensureReady(){
    if(!bootstrapped)throw Error('[store] Supabase is configured but the cloud snapshots have not been restored.');
}
const validStoreName=name=>{
    if(!/^[a-zA-Z0-9_-]+$/.test(String(name)))throw Error('Invalid store name');
    return String(name);
};
function filePath(name){return path.join(DATA_DIR,validStoreName(name)+'.json');}

function load(name){
    name=validStoreName(name);
    ensureReady();
    if(cache.has(name))return cache.get(name);
    const fp=filePath(name),backup=fp+'.bak';
    let data={};
    if(fs.existsSync(fp)){
        try{
            const raw=fs.readFileSync(fp,'utf8').trim();
            if(!raw)throw Error('Empty data file');
            data=JSON.parse(raw);
        }catch(error){
            if(!fs.existsSync(backup)){
                // Never replace an unreadable orders/payment/ticket file with
                // an empty object; that would permanently destroy records.
                throw new Error('[store] '+name+' is corrupted and has no usable backup. Original file preserved. '+error.message);
            }
            try{
                data=JSON.parse(fs.readFileSync(backup,'utf8'));
                console.error('[store] Restored '+name+' from last valid backup in memory. Original corrupted file preserved until next save.');
            }catch(backupError){
                throw new Error('[store] Both '+name+' and backup are unreadable. No data was reset: '+backupError.message);
            }
        }
    }else if(fs.existsSync(backup)){
        // Recover interrupted file renames or single-file loss.
        data=JSON.parse(fs.readFileSync(backup,'utf8'));
        console.warn('[store] Primary '+name+' file was missing, recovered its backup.');
    }
    if(!data || typeof data!=='object' || Array.isArray(data))
        throw Error('[store] Invalid document root for '+name);
    cache.set(name,data);
    return data;
}
function save(name){
    name=validStoreName(name);
    const fp=filePath(name),bak=fp+'.bak';
    const temp=fp+'.'+process.pid+'.'+Date.now().toString(36)+'.tmp';
    const serialized=JSON.stringify(cache.get(name)??{},null,2);
    ensureReady();
    const token=cloud.enabled()?cloud.stage(DATA_DIR,name):null;
    // An fs.rename on the same filesystem makes each save atomic.
    try{
        fs.writeFileSync(temp,serialized,{encoding:'utf8',mode:0o600});
        if(fs.existsSync(fp)){
            // Do not overwrite a good backup with an invalid primary.
            try{
                JSON.parse(fs.readFileSync(fp,'utf8'));
                fs.copyFileSync(fp,bak);
            }catch(error){
                console.warn('[store] Existing '+name+' primary is unreadable; keeping previous backup.');
            }
        }
        fs.renameSync(temp,fp);
        if(!fs.existsSync(bak))fs.copyFileSync(fp,bak);
        if(cloud.enabled())cloud.enqueue(name,cache.get(name)??{},DATA_DIR,token);
    }finally{
        if(fs.existsSync(temp))fs.unlinkSync(temp);
    }
}
function all(name){return load(name);}
function get(name,guildId,fallback){
    const data=load(name);
    if(!(guildId in data)){
        data[guildId]=fallback;
        save(name);
    }
    return data[guildId];
}
function set(name,guildId,value){
    const data=load(name);
    data[guildId]=value;
    save(name);
    return value;
}
function update(name,guildId,fallback,mutator){
    const data=load(name);
    if(!(guildId in data))data[guildId]=fallback;
    const result=mutator(data[guildId]);
    if(result!==undefined)data[guildId]=result;
    save(name);
    return data[guildId];
}
function diagnostics(){
    const files=fs.readdirSync(DATA_DIR).filter(x=>x.endsWith('.json'));
    fs.accessSync(DATA_DIR,fs.constants.R_OK|fs.constants.W_OK);
    return{directory:DATA_DIR,storeFiles:files.length,
        hasTickets:files.includes('tickets.json'),
        hasOrders:files.includes('orders.json')};
}
module.exports={all,get,set,update,save,load,diagnostics,DATA_DIR,bootstrap,cloudStatus:cloud.status,flushCloud:cloud.flush};
