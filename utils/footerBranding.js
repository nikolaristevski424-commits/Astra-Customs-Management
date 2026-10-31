const { EmbedBuilder, ContainerBuilder, ActionRowBuilder, MediaGalleryBuilder, MessageFlags } = require('discord.js');

// Publicly accessible Astra Customs asset. Override via FOOTER_URL if desired.
const DEFAULT_FOOTER_URL =
  'https://raw.githubusercontent.com/nikolaristevski424-commits/Astra-Customs-Management/main/assets/banners/astra-footer-2026.webp';

function footerUrl(cfg = {}) {
  return cfg.footerUrl || process.env.FOOTER_URL || DEFAULT_FOOTER_URL;
}
function json(component) {
  return typeof component?.toJSON === 'function' ? component.toJSON() : component;
}
function isFooterImage(embed, url) {
  return json(embed)?.image?.url === url;
}
function isComponentsV2(payload) {
  if ((Number(payload.flags) & MessageFlags.IsComponentsV2) !== 0) return true;
  return payload.components.some(c => [10,11,12,13,14,17].includes(json(c)?.type));
}
function footerGallery(url) {
  return new MediaGalleryBuilder().addItems([{media:{url}}]);
}
function hasFooter(payload, url) {
  return payload.components.some(c => JSON.stringify(json(c)).includes(url));
}
function isButtonRow(component) {
  return component?.type===1 && component.components?.length>0 &&
    component.components.every(c => c.type===2);
}
/**
 * Discord layout: banner at the top of the container, text and selections,
 * then a footer strip INSIDE the container, with buttons BELOW it.
 *
 * The container is rebuilt from its JSON so existing components are preserved.
 * Only trailing button action rows move outside; dropdowns remain inside.
 */
function addFooterToV2(payload,url) {
  if(hasFooter(payload,url))return payload;

  // Replace the old, incorrect footer as panels are refreshed.
  // Preserve header graphics, select menus, and every button.
  const components=payload.components.filter(c=>{
    const raw=json(c);
    return !(raw?.type===12 && JSON.stringify(raw).includes('footer-banner.png'));
  });
  const containerIndex=components.findIndex(c => json(c)?.type===17);
  if(containerIndex<0) return {...payload,components:[...components,footerGallery(url)]};

  const raw=json(components[containerIndex]);
  const inside=[...(raw.components||[])].filter(c=>!(c.type===12 && JSON.stringify(c).includes('footer-banner.png')));

  // Pull only trailing button rows out of the container. This matches
  // the dashboard example without moving select menus or content blocks.
  const buttons=[];
  while(inside.length && isButtonRow(inside[inside.length-1])) {
    buttons.unshift(inside.pop());
  }
  inside.push(footerGallery(url).toJSON());

  const rebuilt=new ContainerBuilder({...raw,components:inside});
  components.splice(containerIndex,1,rebuilt,...buttons.map(b=>new ActionRowBuilder(b)));
  return {...payload,components};
}

/** Consistent Astra metadata for existing classic embeds.
 * Retain every original title, field, color, footer, and description.
 * Do not overwrite Decision: footers used by application review logic.
 * Do not alter image-only footer/banner embeds.
 */
// Legacy workflows rely on the original fields and "Decision:" footer
// marker. Theme these safely instead of converting edited embeds to V2.
const COLORS=Object.freeze({
  primary:0x6178dc,success:0x28a88e,warning:0xe3a74a,danger:0xde6571,
  purple:0x8862d8,muted:0x68788f
});
function accentFor(raw){
  const title=String(raw?.title||'').toLowerCase();
  if(/\b(denied|cancelled|rejected|terminated|blacklist|failed|error|voided)\b/.test(title))
    return COLORS.danger;
  if(/\b(approved|accepted|paid|delivered|success|completed)\b/.test(title))
    return COLORS.success;
  if(/\b(pending|request|review|waiting|delayed|warning)\b/.test(title))
    return COLORS.warning;
  if(/\b(design|portfolio|creative|showcase)\b/.test(title))
    return COLORS.purple;
  return COLORS.primary;
}
function polishClassicEmbeds(embeds,cfg={}){
  const brand=String(cfg.brandName||process.env.BRAND_NAME||'Astra Customs').slice(0,256);
  return embeds.map(embed=>{
    const raw=json(embed);
    if(!raw || typeof raw!=='object' || !(raw.title||raw.description||raw.fields?.length))return embed;
    const result=EmbedBuilder.from(embed);
    if(raw.color==null)result.setColor(accentFor(raw));
    if(!raw.author?.name)result.setAuthor({name:brand});
    if(!raw.footer?.text)result.setFooter({text:brand+'  •  Official notification'});
    return result;
  });
}

/**
 * Brand normal embeds and Components V2 messages with the Astra footer.
 * A classic embed may only have one big image; a separate image-only embed
 * keeps its original header and puts the footer above any message buttons.
 */
function withFooter(payload,cfg={}) {
  if(!payload || typeof payload!=='object')return payload;
  const url=footerUrl(cfg);
  if(!/^https:\/\//i.test(url))return payload;

  if(Array.isArray(payload.embeds) && payload.embeds.length) {
    const polished=polishClassicEmbeds(payload.embeds,cfg);
    if(polished.some(e=>isFooterImage(e,url)))return {...payload,embeds:polished};
    const oldRemoved=polished.filter(e=>!String(json(e)?.image?.url||'').includes('footer-banner.png'));
    if(oldRemoved.length>=10)return {...payload,embeds:oldRemoved};
    return {...payload,embeds:[...oldRemoved,new EmbedBuilder().setImage(url)]};
  }
  if(Array.isArray(payload.components) && payload.components.length && isComponentsV2(payload)) {
    return addFooterToV2(payload,url);
  }
  return payload;
}
module.exports={withFooter,footerUrl,polishClassicEmbeds,DEFAULT_FOOTER_URL};
