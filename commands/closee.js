const {MessageFlags} = require('discord.js');
const config=require('../utils/config');
const tickets=require('../utils/tickets');
const perms=require('../utils/permissions');
const {closeTicket}=require('../utils/ticketClosing');
function canClose(member,cfg){
 return Boolean(member) && (perms.isTicketStaff(member,cfg)||perms.isManager(member,cfg));
}
module.exports={
  canClose,
  // Internal helper only. /close is the official instant-close slash command.
  async execute(interaction){
    const cfg=config.getConfig(interaction.guildId);
    const ticket=tickets.get(interaction.guildId,interaction.channelId);
    if(!ticket||ticket.closedAt) return interaction.reply({content:'This is not an open, tracked ticket.',flags:MessageFlags.Ephemeral});
    if(!canClose(interaction.member,cfg))
      return interaction.reply({content:'Only ticket staff or managers can instantly close tickets. Customers may use /close-request.',flags:MessageFlags.Ephemeral});
    if(ticket.closingAt)return interaction.reply({content:'This ticket is already closing.',flags:MessageFlags.Ephemeral});
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const success=await closeTicket(interaction.client,interaction.guildId,cfg,interaction.channelId,interaction.user.id);
    try{await interaction.editReply(success?'Ticket closed. A transcript was prepared and archived where configured.':'The ticket could not be closed. Check the bot permissions and logs.');}
    catch(error){console.warn('[close] Could not update acknowledgement after channel close:',error.message);}
  }
};
