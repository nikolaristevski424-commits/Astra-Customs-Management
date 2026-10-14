const path = require('path');

const ASSET_BASE = 'attachment://';

const BANNERS = Object.freeze({
    default: `${ASSET_BASE}default-banner.png`,
    dashboard: `${ASSET_BASE}dashboard-banner.png`,
    order: `${ASSET_BASE}order-banner.png`,
    guidelines: `${ASSET_BASE}guidelines-banner.png`,
    status: `${ASSET_BASE}status-banner.png`,
    applications: `${ASSET_BASE}applications-banner.png`,
    prices: `${ASSET_BASE}prices-banner.png`,
    portfolio: `${ASSET_BASE}portfolio-banner.png`,
    'designer-info': `${ASSET_BASE}marketplace-banner.png`,
    marketplace: `${ASSET_BASE}marketplace-banner.png`,
    promotion: `${ASSET_BASE}promotion-banner.png`,
    infraction: `${ASSET_BASE}infraction-banner.png`,
    bundle: `${ASSET_BASE}default-banner.png`,
    payout: `${ASSET_BASE}default-banner.png`,
    giveaway: `${ASSET_BASE}default-banner.png`,
    loa: `${ASSET_BASE}default-banner.png`,
});

const FOOTER = `${ASSET_BASE}footer-banner.png`;

function banner(key = 'default') {
    return BANNERS[key] || BANNERS.default;
}

module.exports = { BANNERS, FOOTER, banner, ASSET_BASE };