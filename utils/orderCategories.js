// Fixed routing for Astra Customs' storefront service groups.
// All product types in utils/catalog.js must have a dedicated category.
const {ChannelType}=require('discord.js');
const CATEGORY_BY_SERVICE=Object.freeze({
 discord:'1566106539234693141',bots:'1566106539234693141',embeds:'1566106539234693141',
 graphics:'1566107155881263286',logos:'1566107155881263286',
 liveries:'1566107772074852524',
 uniforms:'1566108552031113366',
 websites:'1566108880717742080',
 els:'1566109672149221616'
});
function fromService(service){return CATEGORY_BY_SERVICE[String(service||'').trim().toLowerCase()]||null;}
function fromDescription(product){
 const text=String(product||'').trim().toLowerCase();
 if(!text)return null;
 if(/\b(website|web site|webpage|web page)\b/.test(text))return fromService('websites');
 if(/\b(els|emergency lighting)\b/.test(text))return fromService('els');
 if(/\b(liver(y|ies)|vehicle wrap|vehicle decals?)\b/.test(text))return fromService('liveries');
 if(/\b(uniforms?|clothing)\b/.test(text))return fromService('uniforms');
 if(/\b(logos?|banners?|photograph(y|s|ic)|screenshots?|graphics?|emojis?)\b/.test(text))return fromService('graphics');
 if(/\b(discord|bots?|embeds?|server setup|channel setup)\b/.test(text))return fromService('discord');
 return null; // Unknown free-text products use the configured general order category.
}
async function category(guild,id){
 if(!id)return null;
 const channel=await guild.channels.fetch(id).catch(()=>null);
 return channel?.type===ChannelType.GuildCategory &&
   String(channel.guildId||guild.id)===String(guild.id)?channel:null;
}
module.exports={CATEGORY_BY_SERVICE,fromService,fromDescription,category};
