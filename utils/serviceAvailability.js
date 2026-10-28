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
// Keep the Wi-Fi/signal strength indicator AND the complete three-piece status badge.
// The signal indicators were used in Astra's original order-status design.
const signalIcons=Object.freeze({
  open:'<:StatusEMOJIGreen:1545902027299627018>',
  delayed:'<:StatusEmojiYellow:1545902089186705459>',
  closed:'<:StatusEmojiRed:1545902134258827294>',
  premium:'<:StatusEMOJIGreen:1545902027299627018>'
});
const badgeIcons=Object.freeze({
  open:'<:OpenedEmoji1:1545902291469467668><:OpenedEmoji2:1545902335421841509><:OpenedEmoji3:1545902388961878188>',
  delayed:'<:DeleyaedEmoji1:1558226588980617268><:DeleyaedEmojimiddle:1558226618160259072><:DeleyaedEmoji:1558226651148582973>',
  closed:'<:ClosedEmoji1:1545902477621072022><:ClosedEmoji2:1545902533703245914><:ClosedEmoji3:1545902589403594903>',
  premium:'<:P12:1558228368883978295><:P13:1558228373975597146><:P12:1558228377511526523>'
});
const icons=Object.freeze(Object.fromEntries(
  Object.keys(badgeIcons).map(status=>[status,signalIcons[status]+badgeIcons[status]])
));
const labels=Object.freeze({open:'Open',delayed:'Delayed',closed:'Closed',premium:'Premium / Boosters Only'});
module.exports={normalize,status,icons,signalIcons,badgeIcons,labels};
