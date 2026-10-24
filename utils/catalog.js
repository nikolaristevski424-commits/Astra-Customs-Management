// Customer-facing catalog; null means that staff must issue a custom quote.
const TYPES = {
  discord: {label:'Discord', role:'1497420575583502397', items:[
    ['server2','Full Server Setup (2-day delivery)',2000], ['server6','Full Server Setup (6-day delivery)',1500],
    ['server10','Full Server Setup (10-day delivery)',800], ['channels','Complete channel list',300],
    ['embed','Discord embed (each)',70], ['existingbot','Existing bot setup (each)',210],
    ['roles','Full role setup',150], ['permissions','Roles with permissions',200], ['discordother','Other Discord services',null]
  ]},
  liveries: {label:'Liveries',role:'1497420527789412462',items:[
    ['pd-livery','Police Department Livery',130],['fd-livery','Fire Department Livery',130],
    ['ems-livery','EMS Livery',135],['dot-livery','DOT Livery',130],
    ['staff-livery','Staff Livery',180],['race-livery','Race Livery',240],['other-livery','Other Livery (from R$140)',null]
  ]},
  graphics: {label:'Graphics',role:'1497420719015989439',items:[
    ['race-graphic','Race Graphic',200],['emojis','Custom Emoji (per emoji)',5],
    ['other-graphic','Other Graphic (from R$70)',null],['photography','Photography / Screenshots',null]
  ]},
  uniforms:{label:'Uniforms',role:'1497420622840725616',items:[
    ['pd-uniform','Police Uniform',140],['fd-uniform','Fire Uniform',140],
    ['ems-uniform','EMS Uniform',145],['dot-uniform','DOT Uniform',140],
    ['staff-uniform','Staff Uniform',170],['race-uniform','Race Uniform',200],
    ['other-uniform','Other Uniform (from R$130)',null]
  ]},
  bots:{label:'Bots',role:'1497420575583502397',items:[['custom-bot','Custom-coded Discord Bot (quote)',null],['bot-setup','Existing bot setup',210]]},
  logos:{label:'Logos',role:'1497420767959187538',items:[['logo','Logo Design',100]]},
  embeds:{label:'Embeds',role:'1497420575583502397',items:[['embed-standalone','Discord Embed',70]]},
  websites:{label:'Websites',role:'1560652223317413899',items:[['basic-web','Basic Website (from R$800)',null],['web-other','Custom Website / Additional Pages',null]]},
  els:{label:'ELS',role:'1497420666729922620',items:[['els-package','ELS Package',130]]}
};
const byId = (id) => {
 for (const [type, group] of Object.entries(TYPES)) {
   const item = group.items.find(([key]) => key === id);
   if(item) return {id:item[0],label:item[1],price:item[2],type,service:group.label,role:
       id==='photography'?'1510707552202129469':group.role};
 }
 return null;
};
const estimate = (item, quantity) => Number.isInteger(item.price)?item.price * quantity:null;
module.exports={TYPES,byId,estimate};
