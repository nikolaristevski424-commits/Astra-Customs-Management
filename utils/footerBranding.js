const { EmbedBuilder, MediaGalleryBuilder, MessageFlags } = require('discord.js');

// A stable publicly accessible copy of the Astra-branded asset already in assets/banners.
// Set FOOTER_URL in the host environment to replace this image without editing code.
const DEFAULT_FOOTER_URL =
  'https://raw.githubusercontent.com/nikolaristevski424-commits/Astra-Customs-Management/main/assets/banners/footer-banner.png';

function footerUrl(cfg = {}) {
  return cfg.footerUrl || process.env.FOOTER_URL || DEFAULT_FOOTER_URL;
}
function isFooterImage(embed, url) {
  const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
  return data?.image?.url === url;
}
function hasV2Components(components) {
  return components.some(c => {
    const data = typeof c?.toJSON === 'function' ? c.toJSON() : c;
    return [10,11,12,13,14,17].includes(data?.type);
  });
}
/**
 * Add the full-width Astra footer *below* the original embed or V2 panel,
 * preserving the original banner and buttons. Does not mutate the input.
 * Discord embeds support only one main image, so a separate image-only
 * embed is required for classic messages.
 */
function withFooter(payload, cfg = {}) {
  if(!payload || typeof payload !== 'object') return payload;
  const url = footerUrl(cfg);
  if(!/^https:\/\//i.test(url)) return payload;
  if(Array.isArray(payload.embeds) && payload.embeds.length) {
    if(payload.embeds.some(e=>isFooterImage(e,url)) || payload.embeds.length>=10) return payload;
    const image = new EmbedBuilder().setImage(url);
    return {...payload, embeds:[...payload.embeds,image]};
  }
  if(Array.isArray(payload.components) && payload.components.length) {
    const v2 = ((Number(payload.flags)||0) & MessageFlags.IsComponentsV2) !== 0
      || hasV2Components(payload.components);
    if(!v2) return payload;
    const already = payload.components.some(c=> {
      const data = typeof c?.toJSON === 'function' ? c.toJSON() : c;
      return JSON.stringify(data).includes(url) || JSON.stringify(data).includes('footer-banner.png');
    });
    if(already) return payload;
    const gallery = new MediaGalleryBuilder().addItems([{media:{url}}]);
    return {...payload, components:[...payload.components,gallery]};
  }
  return payload;
}
module.exports={withFooter,footerUrl,DEFAULT_FOOTER_URL};
