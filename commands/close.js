const {SlashCommandBuilder}=require('discord.js');
const instant=require('./closee');

// /close is the actual, immediate staff closure command. The 24-hour
// customer request flow remains available as /close-request.
module.exports={
 data:new SlashCommandBuilder().setName('close')
  .setDescription('Close this ticket now and archive its transcript (ticket staff/management)'),
 canClose:instant.canClose,
 execute:instant.execute
};
