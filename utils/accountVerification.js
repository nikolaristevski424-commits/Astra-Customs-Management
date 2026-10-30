const bloxlink=require('./bloxlink');
const rogoid=require('./rogoid');

const DISCORD_ID=/^\d{17,22}$/;
const ROBLOX_ID=/^\d{1,20}$/;
async function checkProviders(guildId,userId,validResult,{
    bloxlinkLookup,rogoidLookup
}){
    if(!DISCORD_ID.test(String(guildId)))return{userId:null,source:null};
    if(!userId)return{userId:null,source:null};
    // Bloxlink always takes priority. Never replace a mismatching Bloxlink
    // identity with a second provider silently for financial transactions.
    const bloxlinkId=await bloxlinkLookup(guildId,userId).catch(()=>null);
    if(bloxlinkId!=null && validResult.test(String(bloxlinkId)))
        return{userId:String(bloxlinkId),source:'bloxlink'};
    const rogoidId=await rogoidLookup(guildId,userId).catch(()=>null);
    if(rogoidId!=null && validResult.test(String(rogoidId)))
        return{userId:String(rogoidId),source:'rogoid'};
    return{userId:null,source:null};
}
async function robloxToDiscordWithSource(guildId,robloxId,{
    bloxlinkLookup=bloxlink.robloxToDiscord,
    rogoidLookup=rogoid.robloxToDiscord
}={}){
    if(!ROBLOX_ID.test(String(robloxId)))return{userId:null,source:null};
    return checkProviders(guildId,robloxId,DISCORD_ID,{bloxlinkLookup,rogoidLookup});
}
async function discordToRobloxWithSource(guildId,discordId,{
    bloxlinkLookup=bloxlink.discordToRoblox,
    rogoidLookup=rogoid.discordToRoblox
}={}){
    if(!DISCORD_ID.test(String(discordId)))return{userId:null,source:null};
    return checkProviders(guildId,discordId,ROBLOX_ID,{bloxlinkLookup,rogoidLookup});
}
async function robloxToDiscord(guildId,robloxId,options){
    return (await robloxToDiscordWithSource(guildId,robloxId,options)).userId;
}
async function discordToRoblox(guildId,discordId,options){
    return (await discordToRobloxWithSource(guildId,discordId,options)).userId;
}
module.exports={robloxToDiscord,discordToRoblox,robloxToDiscordWithSource,discordToRobloxWithSource};
