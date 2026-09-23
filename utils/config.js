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
        applicationReviewerRoleId: null, // role allowed to accept/deny applications
        staffApplicationAcceptRoleId: null,
        designerApplicationAcceptRoleId: null,

        // Commission — % of the after-tax price a designer keeps, by role.
        // e.g. { "123456": 75, "234567": 70 }. Highest matching rate wins
        // if a member has more than one of these roles.
        commissionRates: {},
        defaultCommissionRate: 0,     // used when a member has none of the roles above

        // Channels
        ticketCategoryId: null,
        orderCategoryId: null,
        transcriptChannelId: null,
        orderLogChannelId: null,
        purchaseLogChannelId: null,
        applicationsChannelId: null,
        applicationResultsChannelId: null,
        promotionsChannelId: null,
        infractionsChannelId: null,
        welcomeChannelId: null,
        dashboardChannelId: null,
        showcasesChannelId: null,
        orderingChannelId: null,
        rulesChannelId: null,
        orderQueueChannelId: null,     // where /order add job postings are announced
        orderRequestsChannelId: null,  // where designer "Request" clicks go for supervisor accept/deny
        packageBundleChannelId: null,  // forum/text channel where package and bundle review threads are created
        bundleReviewChannelId: null,   // where /bundle request goes for approval
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
        discordInviteUrl: 'https://discord.gg/pap89wQJpk',
        orderCounterStart: 1000,      // cosmetic — first /order add job gets this number
        autoCreditPercent: 0,         // % of each detected purchase auto-awarded as store credit (0 = off)

        // Runtime state (not meaningfully settable from .env)
        serviceStatus: {}, // e.g. { "Liveries": "open", "Clothing": "delayed" }
        honeypot: { count: 0, messageId: null, channelId: null },

        // Free-text panel content, edited via /text edit (opens a modal)
        text: {
            guidelines: [
                '# Server Guidelines',
                '',
                '> **1. Orders**\n> Please do not ping a designer. Designers have many other orders and will respond when available.',
                '> **2. Misuse**\n> Use all channels appropriately and use tickets only for their intended purposes.',
                '> **3. Advertising**\n> Advertising is not allowed, including unsolicited DMs. Advertising is only permitted for approved affiliates.',
                '> **4. English**\n> English is the main language of this server so everyone can collaborate effectively.',
                '> **5. Alts**\n> Alternate accounts are strictly prohibited. Do not use an alt to bypass a punishment.',
                '> **6. Drama**\n> Do not create or bring drama into the server. Help us keep the community calm and welcoming.',
                '> **7. Profanity**\n> Do not bypass the profanity filter or use profanity in server channels.',
                '> **8. Respect**\n> Treat others as you want to be treated. Do not troll or intentionally disrupt the community.',
                '> **9. Account**\n> Your Discord username must match your Roblox username. Alternate accounts are not allowed.',
                '> **10. NSFW**\n> Nudity, graphic content, hateful content, and similar messages or images are strictly prohibited.',
                '> **11. Voice Channels**\n> Use voice channels for their intended purposes. Follow PTS in RP VCs and RTO in RTO channels.',
                '> **12. Pinging**\n> Do not ping high ranks or members without a valid reason. Contact HR only when the matter is important.',
            ].join('\n\n'),
            orderRegulations: [
                '# Order Regulations',
                '',
                '> **1. Refund Policy**\n> Completed payments are non-refundable unless the assigned designer explicitly agrees otherwise before work begins.',
                '> **2. Reviews & Reputation**\n> Review previous commissions and designer feedback before placing an order.',
                '> **3. Order Completion**\n> The timeframe provided by the designer is final. Avoid unnecessary pings unless you have important updates.',
                '> **4. Cancellation Policy**\n> Cancelling after work begins may result in a blacklist. Responsible cancellations require early notice and a 15% cancellation fee.',
                '> **5. Advance Payments**\n> Advance payment requirements and percentages are at the designer\'s discretion.',
                '> **6. Completion Acceptance**\n> Once the customer and designer confirm completion, further complaints, revisions, or disputes will not be accepted.',
                '> **7. Customer-Designer Agreement**\n> Before work begins, the designer must explain pricing, revisions, delivery expectations, and terms. Proceeding means the customer accepts them.',
                '',
                '*Confirm everything twice before proceeding. Refusing payment after completion does not resolve an order.*',
            ].join('\n\n'),
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
