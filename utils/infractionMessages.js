const { MessageFlags } = require('discord.js');
const { buildPanel } = require('./embeds');
const { sendWithAttachments } = require('./respond');

async function sendInfractionMessages(channel, cfg, {
    userId,
    heading,
    body,
    punishment,
    reason,
    infractionId,
    issuer,
    roleId,
}) {
    const details = [
        `**Punishment** \`-\` ${punishment}`,
        `**Reason** \`-\` ${reason}`,
    ];
    if (roleId) details.push(`**Role** \`-\` <@&${roleId}>`);
    if (issuer) details.push(`**Issued by** \`-\` ${issuer}`);
    details.push(`**Infraction ID** \`-\` ${infractionId}`, '**Status** \`-\` ACTIVE');
    const extraBlocks = [details.slice(0, 2).join('\n'), details.slice(2).join('\n')];

    const container = buildPanel(cfg, {
        bannerKey: 'infraction',
        heading,
        body: `${body}\n**Staff Username** \`-\` <@${userId}>`,
        extraBlocks,
        accentColor: 0xe74c3c,
    });

    const panelMessage = await sendWithAttachments(channel, {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        allowedMentions: { parse: [] },
    });

    const pingMessage = await channel.send({
        content: `<@${userId}>`,
        allowedMentions: { users: [userId] },
    });

    return { panelMessage, pingMessage };
}

module.exports = { sendInfractionMessages };
