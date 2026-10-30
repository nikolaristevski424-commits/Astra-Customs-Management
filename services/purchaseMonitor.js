const { withFooter } = require('../utils/footerBranding');
// Astra Customs payment tracking. Roblox may return 5xx; never interpret those as a successful or failed purchase.
// Persistent receipts prevent credits, logs and delivery from being replayed on every retry.
const axios = require('axios');
const config = require('../utils/config');
const { baseEmbed } = require('../utils/embeds');
const { verifyPurchaseBuyer } = require('../utils/accountVerification');
const credits = require('../utils/credits');
const packages = require('../utils/packages');
const delivery=require('../utils/packageDelivery');
const paymentPool = require('../utils/paymentPool');
const orders = require('../utils/orders');
const receipts = require('../utils/purchaseReceipts');
const store = require('../utils/store');

// Check unique Roblox groups at most every two minutes.
const POLL_INTERVAL_MS = 2 * 60_000;
// Space additional pagination requests to avoid API bursts.
const PAGE_GAP_MS = 3_000;
const LIMIT = 100;
const PAGE_CAP = 8;
const MAX_SEEN = 1500;
// Roblox sometimes posts group sales late. Scan a wider window, without
// increasing the request frequency; transaction IDs keep processing idempotent.
const LOOKBACK_MS = 24 * 60 * 60_000;
const INITIAL_RECOVERY_MS = 2 * 60 * 60_000;
// Only Astra Customs' guild defaults to the requested log channel. No
// cross-server purchase details should ever be sent to this channel.
const ASTRA_GUILD_ID = '1488378242846036070';
const ASTRA_PURCHASE_CHANNEL_ID = '1550931224195768471';
function purchaseLogChannel(guildId,cfg={}) {
  return String(guildId)===ASTRA_GUILD_ID
    ? ASTRA_PURCHASE_CHANNEL_ID
    : (cfg.purchaseLogChannelId || null);
}
// Environment settings are shared by every guild the bot joins. A second
// guild must never try to publish its receipts in Astra Customs' channel.
function purchaseDestinationIssue(guildId,cfg={}) {
  const channelId=purchaseLogChannel(guildId,cfg);
  if(!channelId)return 'No purchase log channel is configured for this guild.';
  if(String(guildId)!==ASTRA_GUILD_ID && String(channelId)===ASTRA_PURCHASE_CHANNEL_ID)
    return 'The shared PURCHASE_LOG_CHANNEL_ID points to Astra Customs guild '+ASTRA_GUILD_ID+
      ', not guild '+guildId+'. Skipping this destination; Astra sales monitoring stays active.';
  return null;
}
const warnedInvalidGuilds=new Set();

const STATE_STORE = 'purchaseMonitor';
let started = false;
let polling = false;


function getGroupState(groupId) {
  const state = store.get(STATE_STORE, 'global', {})[String(groupId)] || {};
  return { initialized:false, baselineCutoff:0, lastSeenAt:0, seenIds:[], nextRequestAt:0, lastPolledAt:0,
    consecutiveFailures:0, lastError:null, lastSuccessAt:0, lastSaleAt:0, lastTransactionCount:0, lastAlertAt:0, lastAlertError:null, ...state };
}
function saveGroupState(groupId, patch) {
  return store.update(STATE_STORE, 'global', {}, all => {
    all[String(groupId)] = { ...getGroupState(groupId), ...patch };
    return all;
  })[String(groupId)];
}
function globalLastPollAt() {
  const state = store.get(STATE_STORE, 'global', {});
  return Number(state.lastRobloxRequestAt) || 0;
}
function markPollStarted(groupId, now) {
  // Persist before the request, preventing rapid requests after a restart.
  store.update(STATE_STORE, 'global', {}, all => {
    all.lastRobloxRequestAt = now;
    const group = all[String(groupId)] || {};
    all[String(groupId)] = { ...group, lastPolledAt: now };
    return all;
  });
}
function nextEligiblePollAt(state, globalLast = globalLastPollAt()) {
  return Math.max(
    Number(state.nextRequestAt) || 0,
    (Number(state.lastPolledAt) || 0) + (state.lastPolledAt ? POLL_INTERVAL_MS : 0),
    (Number(globalLast) || 0) + (globalLast ? POLL_INTERVAL_MS : 0),
  );
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function transactionKey(tx) {
  // Roblox frequently returns id: 0 for EVERY group sale. Using "0" as
  // the key silently collapses unrelated purchases into one receipt.
  const identifier=String(tx.id??'').trim();
  if(identifier && identifier!=='0' && identifier!=='null')return 'id:'+identifier;
  // Milliseconds can fluctuate in Roblox transaction responses; round to
  // the second to keep the same sale stable between scans.
  const timestamp=Date.parse(tx.created);
  const second=Number.isFinite(timestamp)?Math.floor(timestamp/1000):'unknown';
  return 'sale:'+[
    second,String(tx.agent?.id??''),String(tx.details?.gamepassId||tx.details?.id||tx.details?.assetId||''),
    String(tx.currency?.amount??'')
  ].join(':');
}
function createdAt(tx) { return Date.parse(tx.created); }
function canRetry(error) { const status = error.response?.status; return !status || status === 429 || status >= 500; }
function retryDelay(error, attempts) {
  const hdr = error.response?.headers?.['retry-after'];
  if (hdr) {
    const n = Number(hdr);
    if (Number.isFinite(n) && n >= 0) return Math.max(POLL_INTERVAL_MS, Math.min(n * 1000, 3600_000));
    const date = Date.parse(hdr);
    if (Number.isFinite(date)) return Math.max(POLL_INTERVAL_MS, Math.min(date - Date.now(), 3600_000));
  }
  if (!canRetry(error)) return 30 * 60_000;
  const exponential = Math.min(30 * 60_000, POLL_INTERVAL_MS * 2 ** Math.min(attempts,5));
  return Math.max(POLL_INTERVAL_MS, Math.round(exponential * (0.85 + Math.random() * 0.3)));
}
async function requestPage(groupId, cookie, { cursor, limit=LIMIT }={}) {
  const params = { transactionType:'Sale', limit, sortOrder:'Desc' };
  if (cursor) params.cursor = cursor;
  const { data } = await axios.get('https://economy.roblox.com/v2/groups/'+encodeURIComponent(groupId)+'/transactions', {
    params, timeout:20_000, headers:{ Cookie:'.ROBLOSECURITY='+cookie },
    validateStatus: code => code >= 200 && code < 300,
  });
  if (!Array.isArray(data?.data)) throw new Error('Invalid Roblox transaction response; keeping checkpoint unchanged.');
  return { data:data.data, nextPageCursor:data.nextPageCursor || null };
}
async function fetchRecentTransactions(groupId, cookie) {
  try { return (await requestPage(groupId,cookie)).data; }
  catch(error) {
    // A reduced page size can avoid a transient Roblox 500 caused by a large response.
    if (error.response?.status === 500) {
      console.warn('[purchaseMonitor] HTTP 500 on 100-sale page; trying a 25-sale page once.');
      return (await requestPage(groupId,cookie,{limit:25})).data;
    }
    throw error;
  }
}
async function scanSince(groupId, cookie, state) {
  const transactions=[];
  let cursor=null, more=false, pageLimit=LIMIT, reduced=false;
  for(let page=0;page<PAGE_CAP;page++) {
    if(page>0)await sleep(PAGE_GAP_MS);
    let result;
    try { result=await requestPage(groupId,cookie,{cursor,limit:pageLimit}); }
    catch(error) {
      if (page===0 && !reduced && error.response?.status===500) {
        // If Roblox cannot build a 100-sale response, retry 25 and paginate normally.
        pageLimit=25; reduced=true;
        console.warn('[purchaseMonitor] HTTP 500 with 100 sales; paging 25 at a time.');
        await sleep(PAGE_GAP_MS);
        result=await requestPage(groupId,cookie,{cursor,limit:pageLimit});
      }else throw error;
    }
    const seen=new Set(state.seenIds||[]);
    for(const tx of result.data) {
      const ts=createdAt(tx);
      if (!Number.isFinite(ts)) continue;
      if(state.initialized && ts<Date.now()-LOOKBACK_MS && seen.has(transactionKey(tx))) continue;
      transactions.push(tx);
    }
    const oldest=Math.min(...result.data.map(createdAt).filter(Number.isFinite));
    if(!result.nextPageCursor || !result.data.length || (Number.isFinite(oldest) && oldest<Date.now()-LOOKBACK_MS)) {
      return {transactions,hasMore:false};
    }
    cursor=result.nextPageCursor;more=!!cursor;
  }
  return {transactions,hasMore:more};
}
async function recordPurchase(client,guildId,cfg,groupId,tx) {
  const txId=transactionKey(tx),key=String(groupId)+':'+txId;
  let receipt=receipts.get(guildId,key);
  const destChannelId=purchaseLogChannel(guildId,cfg);
  if(!destChannelId)throw new Error('PURCHASE_LOG_CHANNEL_ID is missing; purchases cannot be logged.');
  // An already-complete receipt might still need a Discord alert if the
  // channel used to be misconfigured. Never repeat fulfillment/credit.
  if(receipt?.complete && receipt.logged) return;
  const itemId=String(tx.details?.gamepassId || tx.details?.id || tx.details?.assetId || '');

  const itemName=String(tx.details?.name||'Unknown item').slice(0,100);
  const buyerId=String(tx.agent?.id||'');
  const buyerName=String(tx.agent?.name||'Unknown buyer').slice(0,90);
  const amount=Number(tx.currency?.amount);
  const incomplete=!Number.isFinite(amount) || amount<0 || !buyerId || !itemId;
  // Log even partial records so staff know a sale appeared instead of
  // silently dismissing it. Partial data must never trigger auto-fulfilment.
  const reservation=paymentPool.findReservation(guildId,itemId);
  const linkedCustomer=reservation?.customerDiscordId||null;
  // Bloxlink: Roblox buyer -> Discord member. RoGoid: reserved member ->
  // Roblox account, used only when Bloxlink has no match. RoGoid has no
  // documented reverse endpoint and can never identify an unknown buyer.
  const buyerVerification=!incomplete && buyerId
    ? await verifyPurchaseBuyer(cfg.discordServerIdForBloxlink||guildId,buyerId,linkedCustomer)
    : {userId:null,source:null};
  const buyerDiscordId=buyerVerification.userId;
  // Do not associate a payment with a customer if the Roblox buyer cannot be verified.
  const verifiedBuyer=!!(linkedCustomer && buyerDiscordId && linkedCustomer===buyerDiscordId);
  const mismatch=!!(linkedCustomer && buyerDiscordId && linkedCustomer!==buyerDiscordId);
  const reviewRequired=!!receipt?.reviewRequired || incomplete || (!!reservation && (!verifiedBuyer || mismatch));
  receipt=receipts.update(guildId,key,{
    groupId:String(groupId),transactionId:txId,itemId,itemName,buyerId,buyerName,buyerDiscordId,
    verificationSource:buyerVerification.source,
    amount,customerDiscordId:linkedCustomer,orderId:reservation?.orderId||null,
    reviewRequired,verification:verifiedBuyer?'linked-account-match':mismatch?'account-mismatch':'not-verified',
    ...(incomplete?{error:'Incomplete transaction information; manual review required'}:{}),
  });
  // Make the purchase log retryable independently from payment-credit/fulfilment stages.
  if(!receipt.logged) {
    const target=await client.channels.fetch(destChannelId).catch(()=>null);
    if(!target?.send || (target.guildId && String(target.guildId)!==String(guildId))) {
      const reason=!target?.send
        ? 'Channel missing or inaccessible to the bot.'
        : 'Channel belongs to guild '+target.guildId+', but this receipt is for guild '+guildId+'.';
      saveGroupState(groupId,{lastAlertError:'Purchase channel '+destChannelId+': '+reason});
      throw new Error('Cannot post to purchase channel '+destChannelId+' for guild '+guildId+': '+reason);
    }
    const effectivePermissions=target.permissionsFor?.(client.user?.id);
    if(effectivePermissions && (!effectivePermissions.has('SendMessages')||!effectivePermissions.has('EmbedLinks'))) {
      saveGroupState(groupId,{lastAlertError:'Bot lacks Send Messages or Embed Links in '+destChannelId});
      throw new Error('Missing Send Messages/Embed Links in purchase channel '+destChannelId);
    }
    const record=baseEmbed(cfg,{
      title:'Astra Customs | Roblox Purchase Detected',
      color:reviewRequired?0xf5a623:0x38aa82,bannerKey:'order',
      description:reviewRequired?'⚠️ Staff verification required before order fulfilment.':'Roblox reported a new group sale. This is a transaction notification, not proof of order fulfilment.',
      fields:[
        {name:'Roblox buyer',value:buyerName+' ('+buyerId+')',inline:true},
        {name:'Item',value:itemName+' ('+itemId+')',inline:true},
        {name:'Robux reported',value:Number.isFinite(amount)?'R$'+amount:'Unavailable',inline:true},
        {name:'Transaction ID',value:String(txId).slice(0,180),inline:false},
        {name:'Linked order',value:receipt.orderId?'#'+receipt.orderId:'Not linked',inline:true},
        {name:'Verification',value:receipt.verification,inline:true},
        {name:'Verified by',value:receipt.verificationSource||'Not verified',inline:true},
      ]
    });
    let message;
    try {
      message=await target.send(withFooter({embeds:[record],allowedMentions:{parse:[]}}));
    }catch(error){
      saveGroupState(groupId,{lastAlertError:'Discord notification failed for channel '+destChannelId+': '+error.message.slice(0,120)});
      throw error;
    }
    receipt=receipts.update(guildId,key,{logged:true,logMessageId:message.id});
    saveGroupState(groupId,{lastAlertAt:Date.now(),lastAlertError:null,lastAlertChannelId:destChannelId});
    console.log('[purchaseMonitor] Posted Roblox sale '+txId+' to guild '+guildId+' channel '+destChannelId);
  }
  if(receipt.complete || incomplete) {
    receipts.update(guildId,key,{complete:true,reviewRequired:reviewRequired||!!receipt.reviewRequired});
    return;
  }
  if(!receipt.credited && receipt.creditAttempted) {
    receipt=receipts.update(guildId,key,{reviewRequired:true,creditReviewRequired:true,
      creditError:'Reward attempt interrupted: check balance history before issuing credit again'});
  } else if(!receipt.credited && buyerDiscordId && cfg.autoCreditPercent > 0) {
    const reward=Math.floor(amount * cfg.autoCreditPercent / 100);
    if(reward>0) {
      // Reserve the credit application before awarding, to prefer manual review over duplicate currency.
      receipts.update(guildId,key,{creditAttempted:true});
      credits.addCredit(guildId,buyerDiscordId,reward,{reason:'Roblox purchase '+txId});
    }
    receipt=receipts.update(guildId,key,{credited:true,creditAmount:reward});
  }
  if(reservation && verifiedBuyer) {
    if(receipt.orderId && !receipt.orderUpdated) {
      const order=orders.findOrder(guildId,receipt.orderId);
      if(order && order.status==='Not Paid') {
        const update=require('../utils/orderProgress');
        await update.setStatus(client,guildId,cfg,order,'Paid',{actorId:null,note:'Verified Roblox sale '+txId,auto:true});
      }
      receipt=receipts.update(guildId,key,{orderUpdated:true});
    }
    if(reservation.packageId && !receipt.delivered) {
      const pkg=packages.find(guildId,reservation.packageId);
      if(!delivery.hasDelivery(pkg) || !linkedCustomer){
        receipts.update(guildId,key,{reviewRequired:true,deliveryError:'Package content or verified customer unavailable'});
        receipt=receipts.update(guildId,key,{reviewRequired:true,deliveryError:'Missing deliverable content or customer; staff follow-up required'});
        receipts.update(guildId,key,{complete:true});
        return;
      }
      try {
        const user=await client.users.fetch(linkedCustomer);
        const messages=delivery.deliveryMessages(pkg);
        for(const payload of messages)await user.send(payload);
        receipt=receipts.update(guildId,key,{delivered:true});
      } catch(error) {
        receipts.update(guildId,key,{deliveryError:error.message});
        receipts.update(guildId,key,{reviewRequired:true,complete:true,
          deliveryError:'Automatic delivery failed; manual staff follow-up required: '+error.message.slice(0,120)});
        return;
      }
    }
    paymentPool.release(guildId,itemId);
    receipt=receipts.update(guildId,key,{reservationCleared:true});
  }
  receipts.update(guildId,key,{complete:true,reviewRequired:reviewRequired||!!receipt.creditReviewRequired});
}
async function processGroup(client,groupId,destinations,transactions,{hasMore=false}={}) {
  const state=getGroupState(groupId),seen=new Set(state.seenIds||[]);
  const valid=transactions.filter(tx=>Number.isFinite(createdAt(tx)));
  if(!state.initialized) {
    const cutoff=Date.now()-INITIAL_RECOVERY_MS;
    const recovery=valid.filter(tx=>createdAt(tx)>=cutoff).sort((a,b)=>createdAt(a)-createdAt(b));
    for(const tx of recovery){
      for(const {guildId,cfg} of destinations) {
        const key=String(groupId)+':'+transactionKey(tx);
        const prior=receipts.get(guildId,key);
        if(!prior?.logged){
          // Baseline recovery only sends a notification; no credits or
          // order fulfilment for historical purchases.
          receipts.update(guildId,key,{complete:true,reviewRequired:true,
            verification:'recent-sale-on-first-scan',processingNote:'Review recent sale detected on initial monitor scan'});
          await recordPurchase(client,guildId,cfg,groupId,tx);
        }
      }
    }
    const latest=Math.max(0,...valid.map(createdAt));
    saveGroupState(groupId,{initialized:true,baselineCutoff:latest,lastSeenAt:latest,
      seenIds:valid.map(transactionKey).slice(-MAX_SEEN),lastSuccessAt:Date.now(),
      lastTransactionCount:valid.length,recentRecoveryComplete:true});
    console.log('[purchaseMonitor] Initial scan for group '+groupId+': '+recovery.length+
      ' recent sale(s) recovered for review; no historical credits issued.');
    return;
  }
  // Migration for installations whose old baseline skipped purchases, or
  // whose receipts became complete before the notification channel was set.
  // Run once per group and only send notifications for the recent past.
  if(!state.recentRecoveryComplete){
    const candidates=valid.filter(tx=>createdAt(tx)>=Date.now()-INITIAL_RECOVERY_MS)
      .sort((a,b)=>createdAt(b)-createdAt(a)).slice(0,40);
    for(const tx of candidates){
      for(const {guildId,cfg} of destinations){
        const key=String(groupId)+':'+transactionKey(tx);
        if(!receipts.get(guildId,key)?.logged){
          receipts.update(guildId,key,{complete:true,reviewRequired:true,
            processingNote:'Recent sale recovered after monitor update; verify manually'});
          await recordPurchase(client,guildId,cfg,groupId,tx);
        }
      }
    }
    saveGroupState(groupId,{recentRecoveryComplete:true});
  }
  // Independently repair missed notifications, even if a transaction is
  // already listed in the monitor checkpoint (which suppresses replay).
  for(const tx of valid){
    if(createdAt(tx)<Date.now()-LOOKBACK_MS)continue;
    for(const {guildId,cfg} of destinations){
      const prior=receipts.get(guildId,String(groupId)+':'+transactionKey(tx));
      if(prior && !prior.logged)await recordPurchase(client,guildId,cfg,groupId,tx);
    }
  }
  const pending=valid.filter(tx=>!seen.has(transactionKey(tx)) &&
      createdAt(tx)>=Date.now()-LOOKBACK_MS).sort((a,b)=>createdAt(a)-createdAt(b));
  for(const tx of pending) {
    for(const {guildId,cfg} of destinations) await recordPurchase(client,guildId,cfg,groupId,tx);
    seen.add(transactionKey(tx));
    saveGroupState(groupId,{lastSeenAt:Math.max(state.lastSeenAt,createdAt(tx)),seenIds:[...seen].slice(-MAX_SEEN),
      lastSaleAt:Math.max(getGroupState(groupId).lastSaleAt||0,createdAt(tx))});
  }
  saveGroupState(groupId,{lastTransactionCount:valid.length});
  if(hasMore) console.warn('[purchaseMonitor] More than '+PAGE_CAP+' pages of sales exist; scan may be incomplete.');
}
async function pollGroups(client,cookie) {
  if(polling)return;
  polling=true;
  try {
    const groups=new Map();
    for(const [guildId] of client.guilds.cache){
      if (String(guildId)!==ASTRA_GUILD_ID) continue;
      const cfg=config.getConfig(guildId);
      if(!cfg.robloxGroupId)continue;
      const issue=purchaseDestinationIssue(guildId,cfg);
      if(issue) {
        if(!warnedInvalidGuilds.has(String(guildId))) {
          console.warn('[purchaseMonitor] Skipping guild '+guildId+': '+issue);
          warnedInvalidGuilds.add(String(guildId));
        }
        continue;
      }
      const groupId=String(cfg.robloxGroupId);
      if(!groups.has(groupId))groups.set(groupId,[]);
      groups.get(groupId).push({guildId,cfg});
    }
    // Oldest-first scheduling prevents starvation when monitoring multiple
    // groups. Only one group can be polled per two-minute global slot.
    const eligible = [...groups.entries()].sort(([a],[b]) =>
      (getGroupState(a).lastPolledAt || 0) - (getGroupState(b).lastPolledAt || 0));
    for(const [groupId,destinations] of eligible) {
      const state=getGroupState(groupId);
      const now=Date.now();
      if(now < nextEligiblePollAt(state)) continue;
      markPollStarted(groupId,now);
      try {
        const {transactions,hasMore}=await scanSince(groupId,cookie,state);
        await processGroup(client,groupId,destinations,transactions,{hasMore});
        saveGroupState(groupId,{consecutiveFailures:0,nextRequestAt:0,lastError:null,lastSuccessAt:Date.now(),
          lastTransactionCount:transactions.length});
      }catch(error) {
        const failures=state.consecutiveFailures+1,delay=retryDelay(error,failures);
        saveGroupState(groupId,{consecutiveFailures:failures,nextRequestAt:Date.now()+delay,lastError:'HTTP '+(error.response?.status||'network')+': '+error.message.slice(0,180)});
        console.warn('[purchaseMonitor] Group '+groupId+' '+(error.response?.status||'network')+'; retry in '+Math.ceil(delay/1000)+'s. '+error.message);
      }
      break;
    }
  } finally {polling=false;}
}
function start(client){
  if(started)return;
  const cookie=String(process.env.ROBLOX_COOKIE||'').trim().replace(/^\.ROBLOSECURITY=/,'');
  if(!cookie){console.error('[purchaseMonitor] DISABLED: ROBLOX_COOKIE missing. Group transactions require a cookie authorized for group finances.');return;}
  started=true;
  console.log('[purchaseMonitor] Checking unique Roblox groups for new sales at most every 2 minutes (slower on errors); paginated requests are spaced.');
  const loop=async()=>{try{await pollGroups(client,cookie)}catch(e){console.error('[purchaseMonitor] Poll failed:',e)}finally{setTimeout(loop,POLL_INTERVAL_MS).unref?.();}};
  loop();
}
function retryNow(groupId){
  const state = getGroupState(groupId);
  // Never let a manual retry override Roblox's rate-limit response.
  if (state.nextRequestAt > Date.now() && String(state.lastError||'').startsWith('HTTP 429')) {
    return {scheduled:false,nextRequestAt:state.nextRequestAt};
  }
  saveGroupState(groupId,{nextRequestAt:0,consecutiveFailures:0});
  return {scheduled:true,nextRequestAt:nextEligiblePollAt(getGroupState(groupId))};
}
module.exports={start,fetchRecentTransactions,scanSince,processGroup,pollGroups,transactionKey,retryDelay,
  getGroupState,recordPurchase,retryNow,nextEligiblePollAt,purchaseLogChannel,
  POLL_INTERVAL_MS,PAGE_GAP_MS,INITIAL_RECOVERY_MS,LOOKBACK_MS,ASTRA_GUILD_ID,ASTRA_PURCHASE_CHANNEL_ID,purchaseDestinationIssue};
