const BANNERS = Object.freeze({
    default: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1600&q=85',
    dashboard: 'https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1600&q=85',
    order: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=85',
    bundle: 'https://images.unsplash.com/photo-1553484771-371a605b060b?auto=format&fit=crop&w=1600&q=85',
    payout: 'https://images.unsplash.com/photo-1559526324-593bc073d938?auto=format&fit=crop&w=1600&q=85',
    giveaway: 'https://images.unsplash.com/photo-1513158966894-9f0f2f4f7a0f?auto=format&fit=crop&w=1600&q=85',
    loa: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85',
});

const FOOTER = 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&w=1200&q=80';

function banner(key = 'default') {
    return BANNERS[key] || BANNERS.default;
}

module.exports = { BANNERS, FOOTER, banner };