// Some permissions are deliberately NOT configurable at all — money-moving
// commands (payout approval, gamepass price changes via /package setprice)
// are gated on role/user IDs that only whoever controls the host's .env
// file can change. This is on purpose: nothing short of editing .env and
// restarting the bot can grant someone payout rights.
//
// Everything ELSE (roles, channels, branding, commission rates...) is ALSO
// configured entirely from .env — see ENV_FIELD_MAP below and config.js's
// getConfig(). That's the only way to configure this bot; there is no
// in-Discord setup command. config.setConfig()/setNested() still exist for
// a few runtime-state fields written by other commands (e.g. /text edit,
// /service), and those explicit writes always win over .env for that field.

function parseIdList(value) {
    return (value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/** "roleId:75,roleId2:70" -> { roleId: 75, roleId2: 70 } */
function parseCommissionRates(value) {
    const map = {};
    for (const pair of (value || '').split(',')) {
        const [roleId, pct] = pair.split(':').map((s) => s?.trim());
        if (roleId && pct && !Number.isNaN(Number(pct))) map[roleId] = Number(pct);
    }
    return map;
}

function getExecutiveRoleIds() {
    return parseIdList(process.env.EXECUTIVE_ROLE_IDS);
}

function getExecutiveUserIds() {
    return parseIdList(process.env.EXECUTIVE_USER_IDS);
}

function isExecutive(member) {
    const roleIds = getExecutiveRoleIds();
    const userIds = getExecutiveUserIds();
    if (userIds.includes(member.id)) return true;
    if (member.permissions?.has?.('Administrator')) return true;
    return member.roles.cache.some((role) => roleIds.includes(role.id));
}

// [envVarName, configKey, type] — type is 'string' | 'int' | 'idlist' | 'commission'
const ENV_FIELD_MAP = [
    // Branding
    ['BRAND_NAME', 'brandName', 'string'],
    ['ACCENT_COLOR', 'accentColor', 'string'],
    ['BANNER_URL', 'bannerUrl', 'string'],
    ['FOOTER_URL', 'footerUrl', 'string'],
    ['PREFIX', 'prefix', 'string'],
    ['GROUP_URL', 'groupUrl', 'string'],
    ['DISCORD_INVITE_URL', 'discordInviteUrl', 'string'],
    ['WATERMARK_TEXT', 'watermarkText', 'string'],

    // Roles
    ['STAFF_ROLE_IDS', 'staffRoleIds', 'idlist'],
    ['MANAGER_ROLE_IDS', 'managerRoleIds', 'idlist'],
    ['HR_ROLE_IDS', 'hrRoleIds', 'idlist'],
    ['CREDIT_MANAGER_ROLE_IDS', 'creditManagerRoleIds', 'idlist'],
    ['PAYOUT_MANAGER_ROLE_IDS', 'payoutManagerRoleIds', 'idlist'],
    ['QC_ROLE_IDS', 'qcRoleIds', 'idlist'],
    ['TICKET_STAFF_ROLE_IDS', 'ticketStaffRoleIds', 'idlist'],
    ['WELCOME_ROLE_ID', 'welcomeRoleId', 'string'],
    ['APPLICATION_REVIEWER_ROLE_ID', 'applicationReviewerRoleId', 'string'],
    ['STAFF_APPLICATION_ACCEPT_ROLE_ID', 'staffApplicationAcceptRoleId', 'string'],
    ['DESIGNER_APPLICATION_ACCEPT_ROLE_ID', 'designerApplicationAcceptRoleId', 'string'],
    ['LOA_ROLE_ID', 'loaRoleId', 'string'],

    // Commission
    ['COMMISSION_RATES', 'commissionRates', 'commission'],
    ['DEFAULT_COMMISSION_RATE', 'defaultCommissionRate', 'int'],

    // Channels
    ['TICKET_CATEGORY_ID', 'ticketCategoryId', 'string'],
    ['ORDER_CATEGORY_ID', 'orderCategoryId', 'string'],
    ['TRANSCRIPT_CHANNEL_ID', 'transcriptChannelId', 'string'],
    ['ORDER_LOG_CHANNEL_ID', 'orderLogChannelId', 'string'],
    ['PURCHASE_LOG_CHANNEL_ID', 'purchaseLogChannelId', 'string'],
    ['APPLICATIONS_CHANNEL_ID', 'applicationsChannelId', 'string'],
    ['APPLICATION_RESULTS_CHANNEL_ID', 'applicationResultsChannelId', 'string'],
    ['PROMOTIONS_CHANNEL_ID', 'promotionsChannelId', 'string'],
    ['INFRACTIONS_CHANNEL_ID', 'infractionsChannelId', 'string'],
    ['WELCOME_CHANNEL_ID', 'welcomeChannelId', 'string'],
    ['DASHBOARD_CHANNEL_ID', 'dashboardChannelId', 'string'],
    ['SHOWCASES_CHANNEL_ID', 'showcasesChannelId', 'string'],
    ['ORDERING_CHANNEL_ID', 'orderingChannelId', 'string'],
    ['RULES_CHANNEL_ID', 'rulesChannelId', 'string'],
    ['ORDER_QUEUE_CHANNEL_ID', 'orderQueueChannelId', 'string'],
    ['ORDER_REQUESTS_CHANNEL_ID', 'orderRequestsChannelId', 'string'],
    ['BUNDLE_REVIEW_CHANNEL_ID', 'bundleReviewChannelId', 'string'],
    ['BUNDLE_THREAD_ID', 'bundleThreadId', 'string'],
    ['PACKAGE_REVIEW_CHANNEL_ID', 'packageReviewChannelId', 'string'],
    ['PAYOUT_REQUESTS_CHANNEL_ID', 'payoutRequestsChannelId', 'string'],
    ['QC_CHANNEL_ID', 'qcChannelId', 'string'],
    ['LOA_CHANNEL_ID', 'loaChannelId', 'string'],
    ['HONEYPOT_CHANNEL_ID', 'honeypotChannelId', 'string'],
    ['AFFILIATIONS_CHANNEL_ID', 'affiliationsChannelId', 'string'],
    ['GIVEAWAY_CHANNEL_ID', 'giveawayChannelId', 'string'],

    // Roblox / payments
    ['ROBLOX_GROUP_ID', 'robloxGroupId', 'string'],
    ['ROBLOX_UNIVERSE_ID', 'robloxUniverseId', 'string'],
    ['GAME_PLACE_ID', 'gamePlaceId', 'string'],
    ['BLOXLINK_GUILD_ID', 'discordServerIdForBloxlink', 'string'],
    ['PACKAGE_COLLECTOR_ID', 'packageCollectorId', 'string'],
    ['PACKAGE_COLLECTOR_TAG', 'packageCollectorTag', 'string'],
    ['ORDER_COUNTER_START', 'orderCounterStart', 'int'],
    ['AUTO_CREDIT_PERCENT', 'autoCreditPercent', 'int'],
];

/**
 * Config values sourced from .env, for anything the shop wants to set
 * once at deploy-time instead of via /setup. Only fields that actually
 * have a non-empty env var set are included, so this can be safely
 * spread on top of hardcoded defaults without clobbering them with
 * empty strings.
 */
function getEnvConfigOverrides() {
    const overrides = {};
    for (const [envVar, key, type] of ENV_FIELD_MAP) {
        const raw = process.env[envVar];
        if (raw === undefined || raw === '') continue;

        if (type === 'idlist') overrides[key] = parseIdList(raw);
        else if (type === 'int') overrides[key] = Number(raw);
        else if (type === 'commission') overrides[key] = parseCommissionRates(raw);
        else overrides[key] = raw;
    }
    return overrides;
}

module.exports = {
    getExecutiveRoleIds,
    getExecutiveUserIds,
    isExecutive,
    parseIdList,
    parseCommissionRates,
    getEnvConfigOverrides,
    ENV_FIELD_MAP,
};
