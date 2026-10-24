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
const icons={open:'<:StatusEMOJIGreen:1545902027299627018><:OpenedEmoji1:1545902291469467668><:OpenedEmoji2:1545902335421841509><:OpenedEmoji3:1545902388961878188>',
 delayed:'<:StatusEmojiYellow:1545902089186705459>',
 closed:'<:StatusEmojiRed:1545902134258827294><:ClosedEmoji1:1545902477621072022><:ClosedEmoji2:1545902533703245914><:ClosedEmoji3:1545902589403594903>',
 premium:'<:boost_1:1492387526613143683>'};
const labels={open:'Open',delayed:'Delayed',closed:'Closed',premium:'Premium / Boosters Only'};
module.exports={normalize,status,icons,labels};
