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
  const key=normalize(type);
  if(!key) return 'open';
  const entries=cfg?.serviceStatus||{};
  // Prefer the exact canonical key: old versions could leave both
  // "Liveries" and "liveries" in the store with contradictory states.
  let raw=Object.prototype.hasOwnProperty.call(entries,key) ? entries[key] : undefined;
  if(raw===undefined){
    const matches=Object.entries(entries).filter(([entry])=>normalize(entry)===key);
    raw=matches.length?matches[matches.length-1][1]:'open';
  }
  const result=({available:'open',limited:'delayed',unavailable:'closed'}[raw]||raw);
  return ['open','delayed','closed','premium'].includes(result)?result:'open';
}
function canonicalizeStatuses(current){
  const normalized={};
  // Preserve unknown keys (future extensions) while canonicalizing known services.
  for(const [key,value] of Object.entries(current||{})){
    const service=normalize(key);
    if(service) normalized[service]=value;
    else normalized[key]=value;
  }
  return normalized;
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
module.exports={normalize,status,canonicalizeStatuses,icons,signalIcons,badgeIcons,labels};
