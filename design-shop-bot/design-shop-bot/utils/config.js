const store = require('./store');
const { getEnvConfigOverrides } = require('./env');

const STORE = 'config';

// Everything here is configured from .env (see utils/env.js's
// ENV_FIELD_MAP) — that's the only way to set most of this. The JSON
// store still exists for the handful of fields other commands write
// at runtime (e.g. /text edit, /service, the honeypot counter), and
// those explicit writes always win over .env for that field.
function defaultConfig() {
    return {
        brandName: 'Design Team',
        accentColor: '#2d2d31',
        bannerUrl: null,
        footerUrl: null,
        prefix: '-',

        // Roles
        staffRoleIds: [],
        managerRoleIds: [],           // /order reset, edit prices, approve bundles/packages
        hrRoleIds: [],                // can /infract, /promote
        creditManagerRoleIds: [],     // can /credit add|remove
        payoutManagerRoleIds: [],     // can /order reset
        qcRoleIds: [],                // can accept/deny /qc submissions
        ticketStaffRoleIds: [],       // can claim/close tickets — falls back to staffRoleIds if empty
        welcomeRoleId: null,
        applicationAcceptRoleId: null, // role given when a creative-team application is accepted

        // Commission — % of the after-tax price a designer keeps, by role.
        // e.g. { "123456": 75, "234567": 70 }. Highest matching rate wins
        // if a member has more than one of these roles.
        commissionRates: {},
        defaultCommissionRate: 0,     // used when a member has none of the roles above

        // Channels
        ticketCategoryId: null,
        transcriptChannelId: null,
        orderLogChannelId: null,
        purchaseLogChannelId: null,
        applicationsChannelId: null,
        promotionsChannelId: null,
        infractionsChannelId: null,
        welcomeChannelId: null,
        dashboardChannelId: null,
        showcasesChannelId: null,
        orderingChannelId: null,
        rulesChannelId: null,
        orderQueueChannelId: null,     // where /order add job postings are announced
        orderRequestsChannelId: null,  // where designer "Request" clicks go for supervisor accept/deny
        bundleReviewChannelId: null,   // where /bundle request goes for approval
        bundleThreadId: null,          // approved bundles get auto-posted here
        packageReviewChannelId: null,  // where /package request goes for approval
        payoutRequestsChannelId: null, // where /payout request goes for the payout team to fulfill
        qcChannelId: null,             // where /qc submit posts submissions for review
        loaChannelId: null,
        loaRoleId: null,
        honeypotChannelId: null,
        affiliationsChannelId: null,
        giveawayChannelId: null,       // default channel for /giveaway start

        // Roblox / payments
        robloxGroupId: null,
        robloxUniverseId: null,       // needed for the game-pass price endpoint
        gamePlaceId: null,            // the joinable place — sent alongside payment links (helps under-13 buyers)
        discordServerIdForBloxlink: null,
        packageCollectorId: null,
        packageCollectorTag: null,
        groupUrl: null,
        orderCounterStart: 1000,      // cosmetic — first /order add job gets this number
        autoCreditPercent: 0,         // % of each detected purchase auto-awarded as store credit (0 = off)

        // Runtime state (not meaningfully settable from .env)
        serviceStatus: {}, // e.g. { "Liveries": "unavailable", "Clothing": "limited" }
        honeypot: { count: 0, messageId: null, channelId: null },

        // Free-text panel content, edited via /text edit (opens a modal)
        text: {
            guidelines: 'No guidelines have been set yet. Staff can set these with `/text edit type:guidelines`.',
            orderRegulations: 'No order regulations have been set yet.',
            careers: 'No careers information has been set yet.',
            dashboardIntro: 'Welcome to our dashboard. This is your go-to destination for important information, services, and resources.',
            affiliationsIntro: 'Welcome to our Affiliations! Explore our handpicked affiliate communities below.',
        },

        watermarkText: null, // falls back to brandName if unset

        taxNote: 'All prices are calculated in Robux. Remember that Roblox charges a 30% marketplace tax on Robux sales — the price shown is what the customer pays, not what you receive after tax.',
        bulkDiscountNote: 'When a price is shown as a range (e.g. "200-220"), the lower price applies when 4+ designs are ordered in the same order ticket.',
    };
}

/**
 * Effective config = hardcoded default < .env < explicit runtime override.
 * The JSON store only ever holds what a command explicitly wrote via
 * setConfig/setNested (e.g. /text edit, /service), so changing .env
 * always takes effect immediately unless a field was specifically
 * written that way.
 */
function getConfig(guildId) {
    const stored = store.get(STORE, guildId, {});
    return { ...defaultConfig(), ...getEnvConfigOverrides(), ...stored };
}

function setConfig(guildId, patch) {
    store.update(STORE, guildId, {}, (current) => ({ ...current, ...patch }));
    return getConfig(guildId);
}

function setNested(guildId, key, value) {
    store.update(STORE, guildId, {}, (current) => {
        const effectiveCurrentNested = current[key] ?? { ...defaultConfig()[key], ...getEnvConfigOverrides()[key] };
        current[key] = { ...effectiveCurrentNested, ...value };
        return current;
    });
    return getConfig(guildId);
}

module.exports = { getConfig, setConfig, setNested, defaultConfig };
