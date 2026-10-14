const {
    ComponentType,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const { collectAttachmentFiles } = require('./respond');

async function updateStatusPanel(message, { color, heading, details }) {
    const source = message.components.find((component) =>
        component.type === ComponentType.Container || component.data?.type === ComponentType.Container
    );
    if (!source) throw new Error('The original announcement does not contain a Components V2 panel.');

    const container = new ContainerBuilder(source.toJSON()).setAccentColor(color);
    const statusIndex = container.components.findIndex((component) =>
        component.data?.type === ComponentType.TextDisplay && component.data.content.includes('**Status**')
    );
    const statusBlock = new TextDisplayBuilder().setContent(`**Status** \`-\` ${heading.toUpperCase()}\n${details}`);
    if (statusIndex >= 0) {
        container.components[statusIndex] = statusBlock;
    } else {
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(statusBlock);
    }

    const files = collectAttachmentFiles(container);
    const payload = {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        allowedMentions: { parse: [] },
    };
    if (files.length) payload.files = files;
    return message.edit(payload);
}

module.exports = { updateStatusPanel };
