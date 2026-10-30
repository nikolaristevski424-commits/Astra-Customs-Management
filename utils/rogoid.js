const axios=require('axios');

// RoGoid publishes a read-only verification API, but its endpoint paths
// are intentionally not guessed here: configure URLs from its documentation.
// Example URL template syntax: https://<actual-rogoid-host>/<documented-path>/{guildId}/{robloxId}
// Never put your API key in the URL or in Discord messages.
const SNOWFLAKE=/^\d{17,22}$/;
const ROBLOX_ID=/^\d{1,20}$/;
const warned=new Set();
function noteOnce(code,message){
  if(warned.has(code))return;
  warned.add(code);
  console.warn('[rogoid] '+message);
}
function endpoint(template,params){
  if(!template)return null;
  let url;
  try{
    let raw=String(template);
    for(const [name,value] of Object.entries(params))
      raw=raw.replaceAll('{'+name+'}',encodeURIComponent(String(value)));
    url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.hash||
        !(url.hostname==='rogoid.xyz'||url.hostname.endsWith('.rogoid.xyz')))
      return null;
    if([...url.searchParams.keys()].some(k=>/token|api.?key|secret/i.test(k)))return null;
    return url.toString();
  }catch{return null;}
}
function responseRecord(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
  if(payload.success===false||payload.verified===false||payload.isVerified===false)return null;
  const body=payload.data||payload.verification||payload.user||payload;
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  if(body.verified===false||body.isVerified===false)return null;
  return body;
}
function firstId(record,keys,regex){
  for(const key of keys){
    const value=record?.[key];
    if((typeof value==='string'||typeof value==='number')&&regex.test(String(value)))return String(value);
  }
  return null;
}
function extractDiscord(payload,robloxId){
  const body=responseRecord(payload);
  if(!body)return null;
  const claimed=firstId(body,['robloxId','robloxID','roblox_id','robloxUserId','roblox_user_id'],ROBLOX_ID);
  if(claimed&&claimed!==String(robloxId))return null;
  return firstId(body,['discordId','discordID','discord_id','discordUserId','discord_user_id'],SNOWFLAKE)
    ||(Array.isArray(body.discordIDs)&&body.discordIDs.length===1 && SNOWFLAKE.test(String(body.discordIDs[0]))
      ?String(body.discordIDs[0]):null);
}
function extractRoblox(payload,discordId){
  const body=responseRecord(payload);
  if(!body)return null;
  const claimed=firstId(body,['discordId','discordID','discord_id','discordUserId','discord_user_id'],SNOWFLAKE);
  if(claimed&&claimed!==String(discordId))return null;
  return firstId(body,['robloxId','robloxID','roblox_id','robloxUserId','roblox_user_id'],ROBLOX_ID);
}
async function lookup(type,guildId,userId,{get=axios.get,env=process.env}={}){
  const key=env.ROGOID_API_KEY?.trim();
  if(!key||!SNOWFLAKE.test(String(guildId)))return null;
  const roblox=type==='roblox';
  const template=env[roblox?'ROGOID_ROBLOX_TO_DISCORD_URL':'ROGOID_DISCORD_TO_ROBLOX_URL'];
  if(!template){
    noteOnce('missing-'+type,'ROGOID_API_KEY is set, but the documented '+(roblox?
      'ROGOID_ROBLOX_TO_DISCORD_URL':'ROGOID_DISCORD_TO_ROBLOX_URL')+' is missing. RoGoid lookup disabled until this is configured.');
    return null;
  }
  if(!(roblox?ROBLOX_ID:SNOWFLAKE).test(String(userId)))return null;
  const url=endpoint(template,{guildId,robloxId:userId,discordId:userId});
  if(!url){
    noteOnce('invalid-'+type,'RoGoid lookup URL must be an HTTPS endpoint on rogoid.xyz (or a subdomain) with the provider-documented path.');
    return null;
  }
  // Choose the exact authentication header prescribed by RoGoid documentation.
  const header=String(env.ROGOID_AUTH_HEADER||'Authorization').trim();
  if(!['authorization','x-api-key'].includes(header.toLowerCase())){
    noteOnce('header','ROGOID_AUTH_HEADER must be Authorization or x-api-key.');
    return null;
  }
  const authValue=header.toLowerCase()==='authorization' ? 
      (String(env.ROGOID_AUTH_SCHEME||'Bearer').trim()==='none'?key:'Bearer '+key) :key;
  try{
    const response=await get(url,{headers:{[header]:authValue,Accept:'application/json'},
      timeout:6000,maxRedirects:0,validateStatus:status=>status>=200&&status<500});
    if(response.status===404||response.status===204)return null;
    if(response.status!==200)return null;
    return roblox?extractDiscord(response.data,userId):extractRoblox(response.data,userId);
  }catch(error){
    noteOnce('error-'+type,'RoGoid lookup failed ('+(error.code||error.response?.status||'network error')+'). Continuing without automatic verification.');
    return null;
  }
}
async function robloxToDiscord(guildId,robloxId,options){
  return lookup('roblox',guildId,robloxId,options);
}
async function discordToRoblox(guildId,discordId,options){
  return lookup('discord',guildId,discordId,options);
}
module.exports={robloxToDiscord,discordToRoblox,endpoint,extractDiscord,extractRoblox};
