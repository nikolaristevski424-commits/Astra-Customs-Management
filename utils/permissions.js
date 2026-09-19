const { PermissionsBitField } = require('discord.js');

function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function hasAnyRole(member, roleIds = []) {
    if (!roleIds || roleIds.length === 0) return false;
    return member.roles.cache.some((role) => roleIds.includes(role.id));
}

function isStaff(member, config) {
    return isAdmin(member) || hasAnyRole(member, config.staffRoleIds);
}

function isManager(member, config) {
    return isAdmin(member) || hasAnyRole(member, config.managerRoleIds) || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

function isHR(member, config) {
    return isAdmin(member) || hasAnyRole(member, config.hrRoleIds);
}

function isCreditManager(member, config) {
    return isAdmin(member) || hasAnyRole(member, config.creditManagerRoleIds);
}

function isPayoutManager(member, config) {
    return isAdmin(member) || hasAnyRole(member, config.payoutManagerRoleIds);
}

function isQualityControl(member, config) {
    return isAdmin(member) || hasAnyRole(member, config.qcRoleIds);
}

/** Ticket claim/close permission. Falls back to general staff if no dedicated ticket-staff roles are configured. */
function isTicketStaff(member, config) {
    const roleIds = config.ticketStaffRoleIds?.length ? config.ticketStaffRoleIds : config.staffRoleIds;
    return isAdmin(member) || hasAnyRole(member, roleIds);
}

/**
 * % of the after-tax price a designer keeps, based on their highest-paying
 * matching role in config.commissionRates. Falls back to
 * config.defaultCommissionRate if they don't have any of those roles.
 */
function commissionRate(member, config) {
    const rates = config.commissionRates || {};
    let best = null;
    for (const [roleId, pct] of Object.entries(rates)) {
        if (member.roles.cache.some((role) => role.id === roleId)) {
            if (best === null || pct > best) best = pct;
        }
    }
    return best !== null ? best : config.defaultCommissionRate || 0;
}

module.exports = {
    isAdmin,
    hasAnyRole,
    isStaff,
    isManager,
    isHR,
    isCreditManager,
    isPayoutManager,
    isQualityControl,
    isTicketStaff,
    commissionRate,
};
