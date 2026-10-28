const {ChannelType,PermissionsBitField} = require('discord.js');
const {collectAttachmentFiles}=require('./respond');
const {withFooter}=require('./footerBranding');
const {EventEmitter}=require('events');

/**
 * Forum posts require a starter `message`. Text channels instead create an
 * unbound public thread, then send the review message inside it. Sending an
 * object as `startMessage` (the old code) is invalid.
 */
function permissions(channel,botId) {
  const bits=channel?.permissionsFor?.(botId);
  if(!bits)return {missing:['Bot channel permissions unavailable'],canSend:false,canThread:false};
  const has=(p)=>bits.has(p);
  const forum=channel.type===ChannelType.GuildForum||channel.type===ChannelType.GuildMedia;
  const missing=(forum
    ? [['ViewChannel',PermissionsBitField.Flags.ViewChannel],['SendMessages',PermissionsBitField.Flags.SendMessages]]
    : [['ViewChannel',PermissionsBitField.Flags.ViewChannel],['SendMessages',PermissionsBitField.Flags.SendMessages],
       ['CreatePublicThreads',PermissionsBitField.Flags.CreatePublicThreads],
       ['SendMessagesInThreads',PermissionsBitField.Flags.SendMessagesInThreads]]
  ).filter(([,flag])=>!has(flag)).map(([name])=>name);
  return {missing,canSend:has(PermissionsBitField.Flags.SendMessages),
    canThread:forum?has(PermissionsBitField.Flags.SendMessages):
      has(PermissionsBitField.Flags.CreatePublicThreads)&&has(PermissionsBitField.Flags.SendMessagesInThreads)};
}
async function sendDirect(channel,payload,reason){
  if(!channel?.send)throw Error('Fallback channel cannot send messages.');
  const message=await channel.send(payload);
  return {id:channel.id,channelId:channel.id,messageId:message.id,url:message.url,
    fallback:true,reason};
}
async function createCatalogThread(channel,name,message,{fallbackChannel=null,botId=null}={}) {
  if(!channel)throw Error('Review channel does not exist. Check PACKAGE_BUNDLE_CHANNEL_ID.');
  const safeName=String(name).slice(0,100);
  const branded=withFooter(message);
  const files=collectAttachmentFiles(branded);
  const payload=files.length?{...branded,files}:branded;
  const forum=[ChannelType.GuildForum,ChannelType.GuildMedia].includes(channel.type);
  const text=[ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type);
  if(!forum&&!text)throw Error('Review channel must be a text or forum channel.');
  const autoArchiveDuration=[60,1440,4320,10080].includes(channel.defaultAutoArchiveDuration)
    ?channel.defaultAutoArchiveDuration:1440;
  try {
    if(!channel.threads?.create)throw Error('Review channel does not support threads.');
    if(forum){
      const thread=await channel.threads.create({name:safeName,autoArchiveDuration,
        message:payload,reason:'Astra Customs package/bundle review'});
      return {id:thread.id,channelId:thread.id,url:thread.url||null,fallback:false};
    }
    const thread=await channel.threads.create({name:safeName,type:ChannelType.PublicThread,
      autoArchiveDuration,reason:'Astra Customs package/bundle review'});
    try{
      const post=await thread.send(payload);
      return {id:thread.id,channelId:thread.id,messageId:post.id,url:post.url||null,fallback:false};
    }catch(error){
      console.error('[catalogThreads] Thread created but starter message failed:',{parent:channel.id,thread:thread.id,code:error.code,message:error.message});
      // Preserve review visibility even if Discord blocks posting in threads.
      if(channel.send)return sendDirect(channel,payload,'Thread message failed: '+error.message);
      throw error;
    }
  }catch(error){
    console.warn('[catalogThreads] Review thread unavailable:',{channelId:channel.id,type:channel.type,
      code:error.code,status:error.status,message:error.message});
    const destination=(text&&channel.send)?channel:
      (fallbackChannel?.type===ChannelType.GuildText&&fallbackChannel?.send?fallbackChannel:null);
    if(destination){
      try{return await sendDirect(destination,payload,'Thread creation unavailable: '+error.message);}
      catch(fallbackError){throw Error('Thread error: '+error.message+'; fallback error: '+fallbackError.message);}
    }
    const missing=botId?permissions(channel,botId).missing:[];
    throw Error('Cannot create review in <#'+channel.id+'>. '+error.message+
      (missing.length?' Bot permissions missing: '+missing.join(', '):'')+
      '. Use a text channel for PACKAGE_REVIEW_CHANNEL_ID or grant the bot Send Messages in its forum channel.');
  }
}
module.exports={createCatalogThread,permissions};
