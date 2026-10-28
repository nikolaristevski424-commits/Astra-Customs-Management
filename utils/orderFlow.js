const { withFooter } = require('./footerBranding');
const {ActionRowBuilder,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,ChannelType,PermissionsBitField,MessageFlags,ButtonBuilder,ButtonStyle} = require('discord.js');
const config=require('./config'), tickets=require('./tickets'), orders=require('./orders'), progress=require('./orderProgress');
const catalog=require('./catalog'), service=require('./serviceAvailability');
const TERMS='https://astra-customs-terms.vercel.app/';
const SHOP='https://www.roblox.com/games/102262993580557/Astra-Customs-Shop';
const ephemeral=MessageFlags.Ephemeral;
const open=(cfg,type)=>!['closed','premium'].includes(service.status(cfg,type));
function categories(cfg){
 return new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder().setCustomId('astra_order_type').setPlaceholder('Select an order type...')
   .addOptions(Object.entries(catalog.TYPES).map(([id,item])=>({label:item.label,value:id,description:service.labels[service.status(cfg,id)]||'Browse designs'})))
 );
}
async function start(interaction){
 return interaction.reply(withFooter({flags:ephemeral,content:'**Astra Customs — Place an Order**\nSelect a service. Read the [Terms of Service]('+TERMS+') before continuing.',components:[categories(config.getConfig(interaction.guildId))]}));
}
async function category(interaction){
 const type=interaction.values?.[0],cfg=config.getConfig(interaction.guildId),group=catalog.TYPES[type];
 if(!group)return interaction.reply({flags:ephemeral,content:'That service is not listed.'});
 if(!open(cfg,type))return interaction.reply({flags:ephemeral,content:group.label+' orders are currently '+service.status(cfg,type)+'. Please use support for questions.'});
 const menu=new StringSelectMenuBuilder().setCustomId('astra_order_item_'+type).setPlaceholder('Choose your product...')
   .addOptions(group.items.map(([id,name,price])=>({label:name.slice(0,100),value:id,description:price===null?'Staff quote required':'R$'+price+' per item'})));
 return interaction.reply(withFooter({flags:ephemeral,content:'**'+group.label+'**\nChoose a product. We will show an estimate before payment; complex orders need designer approval.\n[Terms of Service]('+TERMS+')',
 components:[new ActionRowBuilder().addComponents(menu)]}));
}
async function item(interaction){
 const type=interaction.customId.slice('astra_order_item_'.length),p=catalog.byId(interaction.values?.[0]);
 if(!p||p.type!==type)return interaction.reply({flags:ephemeral,content:'Unknown product.'});
 if(!open(config.getConfig(interaction.guildId),type))return interaction.reply({flags:ephemeral,content:'Orders are closed for this category.'});
 const modal=new ModalBuilder().setCustomId('astra_order_form_'+p.id).setTitle(('Order: '+p.label).slice(0,45));
 modal.addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Quantity (1-100)').setStyle(TextInputStyle.Short).setRequired(true).setValue('1').setMaxLength(3)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('deadline').setLabel('Requested delivery date').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('budget').setLabel('Budget in Robux (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('references').setLabel('References / inspiration (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('brief').setLabel('Describe exactly what you need').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1400))
 );
 return interaction.showModal(modal);
}
async function modal(interaction){
 const p=catalog.byId(interaction.customId.slice('astra_order_form_'.length)),guild=interaction.guild,cfg=config.getConfig(interaction.guildId);
 if(!p||!guild)return interaction.reply({flags:ephemeral,content:'Unknown product.'});
 if(!open(cfg,p.type))return interaction.reply({flags:ephemeral,content:'This service is no longer accepting orders.'});
 const qty=Number(interaction.fields.getTextInputValue('qty'));
 if(!Number.isInteger(qty)||qty<1||qty>100)return interaction.reply({flags:ephemeral,content:'Please provide a quantity between 1 and 100.'});
 const existing=tickets.findOpenForUser(interaction.guildId,interaction.user.id);
 if(existing)return interaction.reply({flags:ephemeral,content:'You already have an open ticket: <#'+existing.channelId+'>'});
 await interaction.deferReply({flags:ephemeral});
 const parentId=cfg.orderCategoryId||cfg.ticketCategoryId;
 const parent=parentId?await guild.channels.fetch(parentId).catch(()=>null):null;
 if(!parent || parent.type!==ChannelType.GuildCategory)return interaction.editReply('Please ask management to configure a valid ORDER_CATEGORY_ID.');
 const supportRoles=(cfg.ticketStaffRoleIds?.length?cfg.ticketStaffRoleIds:cfg.staffRoleIds||[]).filter(id=>guild.roles.cache.has(id));
 const roles=[...new Set([...supportRoles,p.role])].filter(id=>guild.roles.cache.has(id));
 const allow=[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory];
 let channel;
 try{
  channel=await guild.channels.create({
   name:('order-'+p.type+'-'+interaction.user.username).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,90),
   type:ChannelType.GuildText,parent:parent.id,permissionOverwrites:[
    {id:guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},
    {id:interaction.user.id,allow},...roles.map(id=>({id,allow}))
   ]
  });
 }catch(error){console.error('[orderFlow] Channel creation failed',error);return interaction.editReply('Could not open the order. Check the bot Manage Channels permission and order category configuration.');}
 const quantity=qty, total=catalog.estimate(p,qty),price=total===null?'Custom quote — designer confirmation required':'R$'+total+' ('+qty+' × R$'+p.price+')';
 const date=interaction.fields.getTextInputValue('deadline').slice(0,100);
 const budget=interaction.fields.getTextInputValue('budget')||'Not provided';
 const brief=interaction.fields.getTextInputValue('brief').slice(0,1024);
 const refs=(interaction.fields.getTextInputValue('references')||'None').slice(0,1024);
 const record=orders.createOrder(interaction.guildId,{customerId:interaction.user.id,designerId:null,source:'orderRequest',product:p.label,service:p.type,
   quantity:qty,price:total,quoteRequired:total===null,designerEarning:0,ticketChannelId:channel.id,deadline:date,
   status:'Not Paid',statusHistory:[]});
 tickets.create(interaction.guildId,channel.id,{userId:interaction.user.id,type:'order',reason:p.label,product:p.label,service:p.type,orderId:record.id,
  quantity,price:total,deadline:date,budget,details:brief,references:refs,staffRoleIds:roles});
 const row=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ticket_claim_'+channel.id).setLabel('Claim Order').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('ticket_close_'+channel.id).setLabel('Close').setStyle(ButtonStyle.Danger)
 );
 try{
  const sent=await channel.send(withFooter({content:'<@'+interaction.user.id+'>'+(guild.roles.cache.has(p.role)?' <@&'+p.role+'>':''),
    embeds:[progress.embed(cfg,record,tickets.get(interaction.guildId,channel.id))],
    components:progress.controls(record),allowedMentions:{users:[interaction.user.id],roles:guild.roles.cache.has(p.role)?[p.role]:[]}}));
  orders.updateOrder(interaction.guildId,record.id,{requestMessageId:sent.id});
  tickets.update(interaction.guildId,channel.id,{orderMessageId:sent.id});
  await channel.send({content:'**Before you continue:** Please read our Terms of Service: '+TERMS+'\nRoblox shop: '+SHOP+'\nA designer will confirm your final price before payment.'});
 }catch(error){console.error('[orderFlow] Failed sending order messages:',error)}
 return interaction.editReply('Order **#'+record.id+'** opened: <#'+channel.id+'>\n**Estimated cost:** '+price+'. A designer will confirm the final quote.');
}
module.exports={start,category,item,modal,categories,TERMS,SHOP};
