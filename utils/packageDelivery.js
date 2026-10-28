// Package payloads are private until a confirmed purchase.
const MAX_TEXT=4000;
const MAX_LINKS=8;
function parseLinks(input) {
  const values=String(input||'').split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);
  if(values.length>MAX_LINKS)throw new Error('Please provide no more than '+MAX_LINKS+' delivery links.');
  const unique=[...new Set(values)];
  for(const value of unique) {
    let url;
    try {url=new URL(value)}catch{throw new Error('Each delivery link must be a full https:// URL.')}
    if(url.protocol!=='https:' || !url.hostname.includes('.') || url.username || url.password)
      throw new Error('Delivery links must use https:// and cannot include passwords.');
  }
  return unique;
}
function normalizeText(value){
  const text=String(value||'').trim();
  if(text.length>MAX_TEXT)throw new Error('Delivery text cannot exceed '+MAX_TEXT+' characters.');
  return text;
}
function hasDelivery(pkg){
  return Boolean(pkg && (pkg.files?.length || pkg.deliveryText?.trim() || pkg.deliveryLinks?.length));
}
function summary(pkg){
  const parts=[];
  if(pkg.files?.length) parts.push(pkg.files.length+' attached file(s)');
  if(pkg.deliveryLinks?.length)parts.push(pkg.deliveryLinks.length+' private link(s)');
  if(pkg.deliveryText?.trim())parts.push('text/code instructions');
  return parts.join(', ')||'No delivery content';
}
function chunks(text,limit=1750){
 const result=[];
 const value=String(text||'');
 for(let i=0;i<value.length;i+=limit)result.push(value.slice(i,i+limit));
 return result;
}
function deliveryMessages(pkg) {
  if(!hasDelivery(pkg))throw new Error('This package has no deliverable content.');
  const intro='**Astra Customs — Purchase Delivered**\nYour verified purchase of **'+pkg.name+'** is ready.\n';
  const messages=[{content:intro,allowedMentions:{parse:[]}}];
  if(pkg.files?.length)messages.push({content:'**Package files:**',files:pkg.files.map(f=>({attachment:f.url,name:f.name})),allowedMentions:{parse:[]}});
  if(pkg.deliveryText?.trim()){
    chunks(pkg.deliveryText).forEach((part,i)=>messages.push({content:'**Delivery text'+(i?' (continued)':'')+':**\n'+part,allowedMentions:{parse:[]}}));
  }
  if(pkg.deliveryLinks?.length){
    chunks(pkg.deliveryLinks.join('\n')).forEach((part,i)=>messages.push({content:'**Private download links'+(i?' (continued)':'')+':**\n'+part,allowedMentions:{parse:[]}}));
  }
  return messages;
}
module.exports={parseLinks,normalizeText,hasDelivery,summary,deliveryMessages};
