// For "panel"-style commands (pricelist, portfolio, tax, dashboard, etc.)
// the user wants the channel to just show the resulting embed/panel, not
// a visible "SomeUser used /command" line above it. Discord removes that
// line when the interaction's response is deleted, so: defer ephemerally,
// delete the (empty) reply, then send the real payload as a normal
// message in the channel.
//
// This only works for slash commands. Message-based ("-prefix") shortcuts
// get the same visual effect by deleting the triggering message instead —
// see events/messageCreate.js.

async function sendAsPanel(interaction, payload, targetChannel = null) {
    const destination = targetChannel || interaction.channel;
    try {
        await interaction.deferReply({ ephemeral: true });
        await interaction.deleteReply();
    } catch {
        // If we couldn't defer/delete for some reason, fall back to a normal reply
        // rather than losing the response entirely.
        return destination.send(payload);
    }
    return destination.send(payload);
}

module.exports = { sendAsPanel };
