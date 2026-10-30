const axios=require('axios');

// These are read-only GET requests. Never log or return secrets, headers,
// cookies, raw upstream error bodies, or private user profile information.
// A configured key is not proof that the upstream service accepts it.
const DISCORD_ID=/^\d{17,22}$/;
const ROBLOX_ID=/^\d{1,20}$/;
const WAIT_MS=60_000;
const lastCheck=new Map();
function enabled(value){return typeof value==='string' && !!value.trim();}
function result(state,detail){return{state,detail};}
function httpOutcome(provider,status,{unlinked404=false}={}){
    if(status===401)return result('rejected',provider+' rejected the credential (HTTP 401). Check or rotate it.');
    if(status===403)return result('denied',provider+' denied access (HTTP 403). Check API permissions and server access.');
    if(status===429)return result('rate_limited',provider+' rate limited this check (HTTP 429). Try later.');
    if(status===404 && unlinked404)return result('unlinked',provider+' responded, but your Discord account is not linked (HTTP 404).');
    if(status===404)return result('unavailable',provider+' lookup returned HTTP 404. Check its API setup.');
    if(status>=500)return result('unavailable',provider+' is temporarily unavailable (HTTP '+status+').');
    return result('unavailable',provider+' returned HTTP '+status+'; credential could not be confirmed.');
}
async function safeGet(get,url,options,provider){
    try{return await get(url,{...options,timeout:6000,maxRedirects:0,
        validateStatus:status=>status>=200&&status<600});}
    catch(error){
        const status=Number(error?.response?.status);
        if(status>=400&&status<600)return{status,data:null};
        // Never reflect request or response bodies, which could include secrets.
        return{status:0,data:null};
    }
}

async function checkRobloxCookie({get=axios.get,env=process.env}={}){
    const cookie=String(env.ROBLOX_COOKIE||'').trim().replace(/^\.ROBLOSECURITY=/,'');
    if(!cookie)return result('missing','ROBLOX_COOKIE is not configured.');
    const response=await safeGet(get,'https://users.roblox.com/v1/users/authenticated',{
        headers:{Cookie:'.ROBLOSECURITY='+cookie,Accept:'application/json'}},'Roblox');
    if(response.status!==200)return httpOutcome('Roblox',response.status);
    if(!ROBLOX_ID.test(String(response.data?.id||'')))
        return result('unavailable','Roblox responded but did not provide a valid authenticated user ID.');
    return result('working','Roblox cookie accepted: an account is authenticated. Group finance permissions are not tested.');
}

async function checkBloxlink(guildId,discordId,{get=axios.get,env=process.env}={}){
    const key=String(env.BLOXLINK_API_KEY||'').trim();
    if(!key)return result('missing','BLOXLINK_API_KEY is not configured.');
    if(!DISCORD_ID.test(String(guildId))||!DISCORD_ID.test(String(discordId)))
        return result('unavailable','A valid server and Discord user ID are required.');
    const url='https://api.blox.link/v4/public/guilds/'+encodeURIComponent(guildId)+
        '/discord-to-roblox/'+encodeURIComponent(discordId);
    const response=await safeGet(get,url,{headers:{Authorization:key,Accept:'application/json'}},'Bloxlink');
    if(response.status!==200)return httpOutcome('Bloxlink',response.status,{unlinked404:true});
    if(!ROBLOX_ID.test(String(response.data?.robloxID??response.data?.robloxId??'')))
        return result('unlinked','Bloxlink responded, but no verified Roblox ID was returned for your account.');
    return result('working','Bloxlink returned your verified Roblox account successfully.');
}

async function checkRogoid(guildId,discordId,{get=axios.get,env=process.env}={}){
    const key=String(env.ROGOID_API_KEY||'').trim();
    if(!key)return result('missing','ROGOID_API_KEY is not configured.');
    if(!DISCORD_ID.test(String(guildId))||!DISCORD_ID.test(String(discordId)))
        return result('unavailable','A valid server and Discord user ID are required.');
    if(env.GUILD_ID && String(env.GUILD_ID)!==String(guildId))
        return result('denied','RoGoid key is restricted to the configured Astra Customs server.');
    const response=await safeGet(get,'https://api.rogoid.xyz/v1/verifications/'+encodeURIComponent(discordId),{
        headers:{Authorization:'Bearer '+key,Accept:'application/json'}},'RoGoid');
    if(response.status!==200)return httpOutcome('RoGoid',response.status,{unlinked404:true});
    if(String(response.data?.discordId)!==String(discordId) ||
        !ROBLOX_ID.test(String(response.data?.robloxId||'')))
        return result('unavailable','RoGoid returned an unexpected verification response; no account match can be trusted.');
    return result('working','RoGoid returned your verified Roblox account successfully.');
}
function acquireCheck(guildId,now=Date.now()){
    const previous=lastCheck.get(String(guildId))||0;
    if(previous && now-previous<WAIT_MS)
        return Math.ceil((WAIT_MS-(now-previous))/1000);
    lastCheck.set(String(guildId),now);
    return 0;
}
async function runAll(guildId,discordId,options={}){
    const env=options.env||process.env;
    const get=options.get||axios.get;
    const [roblox,bloxlink,rogoid]=await Promise.all([
        checkRobloxCookie({env,get}),
        checkBloxlink(env.BLOXLINK_GUILD_ID||guildId,discordId,{env,get}),
        checkRogoid(guildId,discordId,{env,get})
    ]);
    return{roblox,bloxlink,rogoid};
}
module.exports={checkRobloxCookie,checkBloxlink,checkRogoid,acquireCheck,runAll};
