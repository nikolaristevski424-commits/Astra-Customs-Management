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
    const extraBlocks = [
        `**Punishment** \`-\` ${punishment}`,
        `**Reason** \`-\` ${reason}`,
    ];
    if (roleId) extraBlocks.push(`**Role** \`-\` <@&${roleId}>`);
    if (issuer) extraBlocks.push(`**Issued by** \`-\` ${issuer}`);
    extraBlocks.push(`**Infraction ID** \`-\` ${infractionId}`);

    const container = buildPanel(cfg, {
        bannerKey: 'infraction',
        heading,
        body: `${body}\n**Staff Username** \`-\` <@${userId}>`,
        extraBlocks,
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
