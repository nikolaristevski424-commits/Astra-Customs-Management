const {ContainerBuilder,TextDisplayBuilder,SeparatorBuilder,MessageFlags}=require('discord.js');
const {withFooter}=require('./footerBranding');

// One recognizable visual language across public panels, customer orders,
// private tickets, and read-only command responses.
const COLORS=Object.freeze({
  primary:0x6178dc,blue:0x4682d8,teal:0x28a88e,
  purple:0x8862d8,amber:0xe3a74a,red:0xde6571,
  muted:0x68788f
});
function safe(value,max=1400){
  return String(value??'Not provided').replace(/@everyone|@here/gi,'[mention]').slice(0,max);
}
function brand(cfg){return safe(cfg?.brandName||'Astra Customs',64);}
function heading(cfg,subtitle){
  return '# '+brand(cfg)+'\n'+safe(subtitle,180);
}
function accent(cfg,preferred){
  if(typeof preferred==='number'&&Number.isInteger(preferred)&&preferred>=0&&preferred<=0xffffff)return preferred;
  const candidate=String(cfg?.accentColor||'').replace(/^#/,'');
  return /^[0-9a-f]{6}$/i.test(candidate)?parseInt(candidate,16):COLORS.primary;
}
function textBlock(container,content){
  if(content)container.addTextDisplayComponents(new TextDisplayBuilder().setContent(safe(content,3900)));
}
function makeCard(cfg,{title,subtitle='',intro='',details=[],accentColor=null,rows=[],note='',ephemeral=false}={}){
  const box=new ContainerBuilder().setAccentColor(accent(cfg,accentColor));
  textBlock(box,heading(cfg,title)+(subtitle?'\n'+safe(subtitle,280):''));
  if(intro){box.addSeparatorComponents(new SeparatorBuilder());textBlock(box,intro);}
  for(const item of details.slice(0,4))textBlock(box,item);
  if(note){box.addSeparatorComponents(new SeparatorBuilder());textBlock(box,note);}
  for(const row of rows.slice(0,2))box.addActionRowComponents(row);
  return withFooter({
    flags:MessageFlags.IsComponentsV2|(ephemeral?MessageFlags.Ephemeral:0),
    components:[box],allowedMentions:{parse:[]}
  },cfg);
}
const ORDER_STATES=Object.freeze({
  'Not Paid':{icon:'◯',label:'Awaiting payment',color:COLORS.muted},
  Paid:{icon:'✓',label:'Payment recorded',color:COLORS.teal},
  'In Progress':{icon:'◆',label:'In production',color:COLORS.blue},
  Completed:{icon:'✓',label:'Ready for delivery',color:COLORS.purple},
  Delivered:{icon:'✓',label:'Delivered',color:COLORS.teal},
  Cancelled:{icon:'×',label:'Cancelled',color:COLORS.red},
  Void:{icon:'×',label:'Voided',color:COLORS.red}
});
module.exports={COLORS,ORDER_STATES,safe,brand,heading,accent,makeCard};
