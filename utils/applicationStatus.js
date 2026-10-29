const APPLICATIONS = Object.freeze({
    designer: { name: 'Creative Team', buttonLabel: 'Apply: Creative Team' },
    staff: { name: 'Customer Support', buttonLabel: 'Apply: Customer Support' },
    moderator: { name: 'Discord Moderator', buttonLabel: 'Apply: Moderator' },
    partnership: { name: 'Partnership Team', buttonLabel: 'Apply: Partnerships' },
});

const STATUSES = Object.freeze({
    open: {
        label: 'Open',
        emoji: '<:OpenedEmoji1:1545902291469467668><:OpenedEmoji2:1545902335421841509><:OpenedEmoji3:1545902388961878188>',
    },
    delayed: {
        label: 'Delayed',
        emoji: '<:DeleyaedEmoji1:1558226588980617268><:DeleyaedEmojimiddle:1558226618160259072><:DeleyaedEmoji:1558226651148582973>',
    },
    closed: {
        label: 'Closed',
        emoji: '<:ClosedEmoji1:1545902477621072022><:ClosedEmoji2:1545902533703245914><:ClosedEmoji3:1545902589403594903>',
    },
});

const STATUS_CHOICES = Object.freeze([
    { name: 'Open', value: 'open' },
    { name: 'Delayed', value: 'delayed' },
    { name: 'Closed', value: 'closed' },
]);

function getStatus(cfg, application) {
    const status = cfg.applicationStatus?.[application];
    return Object.hasOwn(STATUSES, status) ? status : 'open';
}

module.exports = { APPLICATIONS, STATUSES, STATUS_CHOICES, getStatus };
