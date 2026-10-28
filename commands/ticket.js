const {SlashCommandBuilder,MessageFlags,AttachmentBuilder,PermissionsBitField} = require('discord.js');
const config=require('../utils/config');
const tickets=require('../utils/tickets');
const orders=require('../utils/orders');
const progress=require('../utils/orderProgress');
const perms=require('../utils/permissions');
const {buildTranscript}=require('../utils/ticketClosing');

const EPHEMERAL=MessageFlags.Ephemeral;
const MAX_TRANSCRIPT_BYTES=8 * 1024 * 1024;
const priorities={normal:'⚪ Normal',high:'🟠 High',urgent:'🔴 Urgent'};
function staff(member,cfg){
  return Boolean(member) && (perms.isManager(member,cfg)||perms.isTicketStaff(member,cfg));
}
function manage(member,cfg,ticket){
  return staff(member,cfg);
}
function safeName(input){
  return String(input||'').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9 -]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,90);
}
function details(ticket){
  return [
    '**Ticket:** <#'+ticket.channelId+'>',
    '**Type:** '+(ticket.type||'support'),
    '**Opened by:** <@'+ticket.userId+'>',
    '**Assigned to:** '+(ticket.claimedBy?'<@'+ticket.claimedBy+'>':'Unclaimed'),
    '**Priority:** '+(priorities[ticket.priority]||priorities.normal),
    '**Replies:** '+(ticket.locked?'Locked':'Allowed'),
    '**Opened:** <t:'+Math.floor(ticket.createdAt/1000)+':R>',
    '**Status:** '+(ticket.closedAt?'Closed':ticket.closingAt?'Closing':'Open'),
    ticket.orderId?'**Linked order:** #'+ticket.orderId:'',
    ticket.reason?'**Reason:** '+String(ticket.reason).slice(0,650):'',
  ].filter(Boolean).join('\n');
}
function getTicket(interaction){
  const ticket=tickets.get(interaction.guildId,interaction.channelId);
  if(!ticket || ticket.closedAt) return null;
  return ticket;
}
function reply(interaction,message){return interaction.reply({content:message,flags:EPHEMERAL,allowedMentions:{parse:[]}});}
module.exports={
 data:new SlashCommandBuilder().setName('ticket').setDescription('Manage private tickets, assignments and transcripts')
  .addSubcommand(s=>s.setName('info').setDescription('View details and status of the current ticket'))
  .addSubcommand(s=>s.setName('list').setDescription('View the latest open tickets (staff only)'))
  .addSubcommand(s=>s.setName('stats').setDescription('View ticket workload statistics (managers only)'))
  .addSubcommand(s=>s.setName('add').setDescription('Add someone to this ticket (staff only)')
    .addUserOption(o=>o.setName('user').setDescription('Member to add').setRequired(true)))
  .addSubcommand(s=>s.setName('remove').setDescription('Remove a participant from this ticket (staff only)')
    .addUserOption(o=>o.setName('user').setDescription('Member to remove').setRequired(true)))
  .addSubcommand(s=>s.setName('rename').setDescription('Rename this ticket channel (staff only)')
    .addStringOption(o=>o.setName('name').setDescription('New channel name').setMinLength(1).setMaxLength(90).setRequired(true)))
  .addSubcommand(s=>s.setName('priority').setDescription('Set the ticket priority (staff only)')
    .addStringOption(o=>o.setName('level').setDescription('How urgently should staff triage this?')
      .addChoices({name:'Normal',value:'normal'},{name:'High',value:'high'},{name:'Urgent',value:'urgent'}).setRequired(true)))
  .addSubcommand(s=>s.setName('assign').setDescription('Assign the ticket to a staff member (managers only)')
    .addUserOption(o=>o.setName('user').setDescription('Assignee').setRequired(true)))
  .addSubcommand(s=>s.setName('claim').setDescription('Claim a currently unassigned ticket'))
  .addSubcommand(s=>s.setName('unclaim').setDescription('Release the current ticket assignment'))
  .addSubcommand(s=>s.setName('lock').setDescription('Temporarily lock customer replies in this ticket'))
  .addSubcommand(s=>s.setName('unlock').setDescription('Allow the ticket owner to reply again'))
  .addSubcommand(s=>s.setName('transcript').setDescription('Download the current ticket transcript privately (staff only)')),
 async execute(interaction){
    const cfg=config.getConfig(interaction.guildId);
    const sub=interaction.options.getSubcommand();
    const isStaff=staff(interaction.member,cfg);
    if(sub==='stats'){
      if(!perms.isManager(interaction.member,cfg))return reply(interaction,'Only managers can view staff ticket statistics.');
      const all=tickets.list(interaction.guildId),open=all.filter(t=>!t.closedAt);
      const unclaimed=open.filter(t=>!t.claimedBy);
      const byPriority=Object.keys(priorities).map(k=>k+': '+open.filter(t=>(t.priority||'normal')===k).length).join(' | ');
      const byType=['order','support'].map(k=>k+': '+open.filter(t=>t.type===k).length).join(' | ');
      return reply(interaction,'**Astra Customs | Ticket Overview**\nOpen: **'+open.length+'** · Unclaimed: **'+unclaimed.length+'** · Closed: **'+(all.length-open.length)+'**\n'+byPriority+'\n'+byType);
    }
    if(sub==='list'){
      if(!isStaff)return reply(interaction,'Only ticket staff can view the ticket queue.');
      const open=tickets.list(interaction.guildId).filter(t=>!t.closedAt)
        .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      const lines=open.slice(0,12).map(t=>'<#'+t.channelId+'> · '+(priorities[t.priority]||priorities.normal)+
        ' · '+(t.claimedBy?'Claimed <@'+t.claimedBy+'>':'Unclaimed'));
      return reply(interaction,'**Open Tickets ('+open.length+')**\n'+(lines.join('\n')||'No open tickets.'));
    }
    const ticket=getTicket(interaction);
    if(!ticket)return reply(interaction,'Run this inside an active ticket channel.');
    if(sub==='info'){
      // The channel is private; ticket details are only returned to the current member.
      return reply(interaction,details(ticket));
    }
    if(sub==='claim'){
      const assignedRole=(ticket.staffRoleIds||[]).some(roleId=>interaction.member.roles.cache.has(roleId));
      if(!isStaff && !assignedRole)return reply(interaction,'Only ticket staff or an authorized service designer can claim this ticket.');
      if(ticket.claimedBy)return reply(interaction,'This ticket is already assigned to <@'+ticket.claimedBy+'>.');
      await interaction.deferReply({flags:EPHEMERAL});
      tickets.update(interaction.guildId,ticket.channelId,{claimedBy:interaction.user.id,claimedAt:Date.now()});
      if(ticket.orderId){
        const order=orders.findOrder(interaction.guildId,ticket.orderId);
        if(order){
          const updated=orders.updateOrder(interaction.guildId,order.id,{designerId:interaction.user.id});
          await progress.refresh(interaction.client,interaction.guildId,cfg,updated);
        }
      }
      return interaction.editReply('You claimed this ticket. Customer and order assignment have been updated.');
    }
    if(sub==='unclaim'){
      if(!isStaff && ticket.claimedBy!==interaction.user.id)
        return reply(interaction,'Only the assigned member or ticket staff can unclaim this ticket.');
      if(!ticket.claimedBy)return reply(interaction,'This ticket is already unclaimed.');
      await interaction.deferReply({flags:EPHEMERAL});
      tickets.update(interaction.guildId,interaction.channelId,{claimedBy:null,claimedAt:null});
      if(ticket.orderId){
        const order=orders.findOrder(interaction.guildId,ticket.orderId);
        if(order){
          const updated=orders.updateOrder(interaction.guildId,order.id,{designerId:null});
          await progress.refresh(interaction.client,interaction.guildId,cfg,updated);
        }
      }
      return interaction.editReply('Ticket assignment cleared. A designer can claim it again.');
    }
    if(!isStaff)return reply(interaction,'Only ticket staff or managers may change ticket settings or download transcripts.');
    if(sub==='lock'||sub==='unlock'){
      const locked=sub==='lock';
      if(!!ticket.locked===locked)return reply(interaction,locked?'Ticket is already locked.':'Ticket is already unlocked.');
      await interaction.deferReply({flags:EPHEMERAL});
      try{
        await interaction.channel.permissionOverwrites.edit(ticket.userId,
          {SendMessages:!locked}, {reason:'Astra Customs ticket '+(locked?'lock':'unlock')});
      }catch(error){
        console.warn('[ticket] Failed to '+sub+' ticket:',error.message);
        return interaction.editReply('Could not '+sub+' the ticket. Check the bot Manage Channels permission.');
      }
      tickets.update(interaction.guildId,ticket.channelId,{locked,lockedBy:locked?interaction.user.id:null,lockedAt:locked?Date.now():null});
      await interaction.channel.send({content:'**Ticket '+(locked?'Locked':'Unlocked')+'** · '+(locked?'Customer replies are temporarily paused.':'The ticket owner may reply again.')+
        '\nChanged by <@'+interaction.user.id+'>.',allowedMentions:{parse:[]}}).catch(()=>{});
      return interaction.editReply(locked?'Ticket locked.':'Ticket unlocked.');
    }
    if(sub==='transcript'){
      await interaction.deferReply({flags:EPHEMERAL});
      try{
        const data=await buildTranscript(interaction.channel);
        if(data.length>MAX_TRANSCRIPT_BYTES)
          return interaction.editReply('The transcript is too large for a Discord attachment. Ask a manager to use the configured transcript channel.');
        return interaction.editReply({content:'Private ticket transcript for <#'+ticket.channelId+'>.',
          files:[new AttachmentBuilder(data,{name:'astra-transcript-'+ticket.channelId+'.txt'})]});
      }catch(error){
        console.warn('[ticket] Transcript generation failed:',error);
        return interaction.editReply('Could not generate transcript. Check bot Read Message History permission.');
      }
    }
    if(sub==='assign'){
      if(!perms.isManager(interaction.member,cfg))return reply(interaction,'Only managers can assign tickets.');
      const user=interaction.options.getUser('user',true);
      const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
      if(!member||user.bot)return reply(interaction,'Select a valid server member, not a bot.');
      const allowed=staff(member,cfg) || (ticket.staffRoleIds||[]).some(roleId=>member.roles.cache.has(roleId));
      if(!allowed)return reply(interaction,'That member is not authorized as ticket staff or a designer for this order.');
      await interaction.deferReply({flags:EPHEMERAL});
      // An assignee must retain channel visibility.
      if(!interaction.channel.permissionsFor(member)?.has(PermissionsBitField.Flags.ViewChannel)){
        try{await interaction.channel.permissionOverwrites.edit(member.id,{
          ViewChannel:true,SendMessages:true,ReadMessageHistory:true
        },{reason:'Astra Customs ticket assignment'});}
        catch(error){return interaction.editReply('Could not grant assignee access: '+error.message);}
      }
      tickets.update(interaction.guildId,ticket.channelId,{claimedBy:member.id,claimedAt:Date.now()});
      if(ticket.orderId){
        const order=orders.findOrder(interaction.guildId,ticket.orderId);
        if(order){
          const updated=orders.updateOrder(interaction.guildId,order.id,{designerId:member.id});
          await progress.refresh(interaction.client,interaction.guildId,cfg,updated);
        }
      }
      await interaction.channel.send({content:'<@'+member.id+'> has been assigned to this ticket by staff.',
        allowedMentions:{users:[member.id]}}).catch(()=>{});
      return interaction.editReply('Ticket assigned to <@'+member.id+'>.');
    }
    if(sub==='add'||sub==='remove'){
      const user=interaction.options.getUser('user',true);
      if(user.id===interaction.client.user.id)return reply(interaction,'The bot cannot be removed from its own ticket.');
      if(sub==='remove' && (user.id===ticket.userId || user.id===ticket.claimedBy))
        return reply(interaction,'Cannot remove the ticket owner or current assignee. Reassign or unclaim first.');
      if(sub==='add' && user.bot)return reply(interaction,'Bots cannot be added as ticket participants.');
      await interaction.deferReply({flags:EPHEMERAL});
      try{
        if(sub==='add'){
          const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
          if(!member)return interaction.editReply('That user is not in this server.');
          await interaction.channel.permissionOverwrites.edit(user.id,{
            ViewChannel:true,SendMessages:true,ReadMessageHistory:true
          },{reason:'Astra Customs: added by '+interaction.user.id});
        }else{
          // Explicit deny is necessary even when another guild role still grants access.
          await interaction.channel.permissionOverwrites.edit(user.id,{
            ViewChannel:false,SendMessages:false,ReadMessageHistory:false
          },{reason:'Astra Customs: removed by '+interaction.user.id});
        }
      }catch(error){console.warn('[ticket] Participant update failed',error);
        return interaction.editReply('Could not change participant permissions: '+error.message);}
      return interaction.editReply('**'+(sub==='add'?'Added':'Removed')+'** <@'+user.id+'> '+(sub==='add'?'to':'from')+' the ticket.');
    }
    if(sub==='rename'){
      const name=safeName(interaction.options.getString('name',true));
      if(name.length<2)return reply(interaction,'Enter a valid channel name with at least two letters or numbers.');
      await interaction.deferReply({flags:EPHEMERAL});
      try{await interaction.channel.setName(name,'Ticket renamed by '+interaction.user.id);}
      catch(error){return interaction.editReply('Could not rename ticket: '+error.message);}
      tickets.update(interaction.guildId,ticket.channelId,{customName:name});
      return interaction.editReply('Ticket renamed to **#'+name+'**.');
    }
    if(sub==='priority'){
      const priority=interaction.options.getString('level',true);
      if(!(priority in priorities))return reply(interaction,'Invalid priority.');
      tickets.update(interaction.guildId,ticket.channelId,{priority,priorityBy:interaction.user.id,priorityAt:Date.now()});
      await interaction.reply({content:'Ticket priority set to **'+priorities[priority]+'**.',flags:EPHEMERAL});
      await interaction.channel.send({content:'**Ticket Priority Updated** · '+priorities[priority]+
        '\nUpdated by <@'+interaction.user.id+'>. This does not guarantee a specific response time.',
        allowedMentions:{parse:[]}}).catch(()=>{});
      return;
    }
 }
};
