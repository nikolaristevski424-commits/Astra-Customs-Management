const aliases={
  discord:'discord',server:'discord',servers:'discord',
  livery:'liveries',liveries:'liveries',
  uniform:'uniforms',uniforms:'uniforms',clothing:'uniforms',
  graphic:'graphics',graphics:'graphics',photography:'graphics',photo:'graphics',
  logo:'logos',logos:'logos',banner:'graphics',banners:'graphics',
  bot:'bots',bots:'bots',embed:'embeds',embeds:'embeds',
  website:'websites',websites:'websites',els:'els'};
const normalize = (name) => aliases[String(name||'').trim().toLowerCase()]||null;
function status(cfg,type){
  const entries=Object.entries(cfg.serviceStatus||{});
  const exact=entries.find(([k])=>k.toLowerCase()===type);
  const matching=exact||entries.find(([k])=>normalize(k)===type);
  const raw=matching?.[1]||'open';
  return ({available:'open',limited:'delayed',unavailable:'closed'}[raw]||raw);
}
// Use the Astra Customs status artwork in the exact three-part order.
const icons=Object.freeze({
 open:'<:OpenedEmoji1:1545902291469467668><:OpenedEmoji2:1545902335421841509><:OpenedEmoji3:1545902388961878188>',
 closed:'<:ClosedEmoji1:1545902477621072022><:ClosedEmoji2:1545902533703245914><:ClosedEmoji3:1545902589403594903>',
 delayed:'<:DeleyaedEmoji1:1558226588980617268><:DeleyaedEmojimiddle:1558226618160259072><:DeleyaedEmoji:1558226651148582973>',
 premium:'<:P12:1558228368883978295><:P13:1558228373975597146><:P12:1558228377511526523>'
});
const labels=Object.freeze({open:'Open',delayed:'Delayed',closed:'Closed',premium:'Premium / Boosters Only'});
module.exports={normalize,status,icons,labels};
