// Astra Customs payment tracking. Roblox may return 5xx; never interpret those as a successful or failed purchase.
// Persistent receipts prevent credits, logs and delivery from being replayed on every retry.
const axios = require('axios');
const config = require('../utils/config');
const { baseEmbed } = require('../utils/embeds');
const { robloxToDiscord } = require('../utils/bloxlink');
const credits = require('../utils/credits');
const packages = require('../utils/packages');
const paymentPool = require('../utils/paymentPool');
const orders = require('../utils/orders');
const receipts = require('../utils/purchaseReceipts');
const store = require('../utils/store');

const POLL_INTERVAL_MS = 60_000;
const LIMIT = 100;
const PAGE_CAP = 8;
const MAX_SEEN = 1500;
const LOOKBACK_MS = 15 * 60_000;
const STATE_STORE = 'purchaseMonitor';
let started = false;
let polling = false;
let lastRequestAt = 0;

function getGroupState(groupId) {
  const state = store.get(STATE_STORE, 'global', {})[String(groupId)] || {};
  return { initialized:false, baselineCutoff:0, lastSeenAt:0, seenIds:[], nextRequestAt:0,
    consecutiveFailures:0, lastError:null, lastSuccessAt:0, ...state };
}
function saveGroupState(groupId, patch) {
  return store.update(STATE_STORE, 'global', {}, all => {
    all[String(groupId)] = { ...getGroupState(groupId), ...patch };
    return all;
  })[String(groupId)];
}
function transactionKey(tx) {
  return String(tx.id ?? [
    Date.parse(tx.created), tx.agent?.id || '', tx.details?.id || tx.details?.gamepassId || '', tx.currency?.amount ?? '',
  ].join(':'));
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
  return Math.round(exponential * (0.85 + Math.random() * 0.3));
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
    let result;
    try { result=await requestPage(groupId,cookie,{cursor,limit:pageLimit}); }
    catch(error) {
      if (page===0 && !reduced && error.response?.status===500) {
        // If Roblox cannot build a 100-sale response, retry 25 and paginate normally.
        pageLimit=25; reduced=true;
        console.warn('[purchaseMonitor] HTTP 500 with 100 sales; paging 25 at a time.');
        result=await requestPage(groupId,cookie,{cursor,limit:pageLimit});
      }else throw error;
    }
    const seen=new Set(state.seenIds||[]);
    for(const tx of result.data) {
      const ts=createdAt(tx);
      if (!Number.isFinite(ts)) continue;
      if(state.initialized && ts<state.lastSeenAt-LOOKBACK_MS && seen.has(transactionKey(tx))) continue;
      transactions.push(tx);
    }
    const oldest=Math.min(...result.data.map(createdAt).filter(Number.isFinite));
    if(!result.nextPageCursor || !result.data.length || (state.initialized && oldest < state.lastSeenAt - LOOKBACK_MS)) {
      return {transactions,hasMore:false};
    }
    cursor=result.nextPageCursor;more=!!cursor;
  }
  return {transactions,hasMore:more};
}
async function recordPurchase(client,guildId,cfg,groupId,tx) {
  const txId=transactionKey(tx),key=String(groupId)+':'+txId;
  let receipt=receipts.get(guildId,key);
  if(receipt?.complete) return;
  const itemId=String(tx.details?.gamepassId || tx.details?.id || '');
  const itemName=String(tx.details?.name||'Unknown item').slice(0,100);
  const buyerId=String(tx.agent?.id||'');
  const buyerName=String(tx.agent?.name||'Unknown buyer').slice(0,90);
  const amount=Number(tx.currency?.amount);
  if(!Number.isFinite(amount) || amount<0 || !buyerId || !itemId) {
    receipts.update(guildId,key,{reviewRequired:true,error:'Incomplete transaction payload',complete:true,transactionId:txId});
    console.warn('[purchaseMonitor] Incomplete transaction needs manual review: '+key);
    return;
  }
  const buyerDiscordId=buyerId ? await robloxToDiscord(cfg.discordServerIdForBloxlink,buyerId).catch(()=>null) : null;
  const reservation=paymentPool.findReservation(guildId,itemId);
  const linkedCustomer=reservation?.customerDiscordId||null;
  // Do not associate a payment with a customer if the Roblox buyer cannot be verified.
  const verifiedBuyer=!!(linkedCustomer && buyerDiscordId && linkedCustomer===buyerDiscordId);
  const mismatch=!!(linkedCustomer && buyerDiscordId && linkedCustomer!==buyerDiscordId);
  const reviewRequired=!!reservation && (!verifiedBuyer || mismatch);
  receipt=receipts.update(guildId,key,{
    groupId:String(groupId),transactionId:txId,itemId,itemName,buyerId,buyerName,buyerDiscordId,
    amount,customerDiscordId:linkedCustomer,orderId:reservation?.orderId||null,
    reviewRequired,verification:verifiedBuyer?'linked-account-match':mismatch?'account-mismatch':'not-verified',
  });
  // Make the purchase log retryable independently from payment-credit/fulfilment stages.
  if(!receipt.logged && cfg.purchaseLogChannelId) {
    const target=await client.channels.fetch(cfg.purchaseLogChannelId);
    if(!target?.send) throw new Error('Configured purchase-log channel cannot send messages');
    const record=baseEmbed(cfg,{
      title:'Astra Customs | Roblox Purchase Detected',
      color:reviewRequired?0xf5a623:0x38aa82,bannerKey:'order',
      description:reviewRequired?'⚠️ Buyer identity requires staff verification before order fulfillment.':'Roblox reported a group sale.',
      fields:[
        {name:'Roblox buyer',value:buyerName+' ('+buyerId+')',inline:true},
        {name:'Item',value:itemName+' ('+itemId+')',inline:true},
        {name:'Robux after tax',value:'R$'+amount,inline:true},
        {name:'Transaction ID',value:String(txId).slice(0,180),inline:false},
        {name:'Linked order',value:receipt.orderId?'#'+receipt.orderId:'Not linked',inline:true},
        {name:'Verification',value:receipt.verification,inline:true},
      ]
    });
    const message=await target.send({embeds:[record],allowedMentions:{parse:[]}});
    receipt=receipts.update(guildId,key,{logged:true,logMessageId:message.id});
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
      if(pkg?.files?.length && linkedCustomer){
        try {
          const user=await client.users.fetch(linkedCustomer);
          await user.send({content:'Your Astra Customs purchase of **'+pkg.name+'** was verified. Files:',files:pkg.files.map(f=>({attachment:f.url,name:f.name}))});
          receipt=receipts.update(guildId,key,{delivered:true});
        } catch(error) {
          receipts.update(guildId,key,{deliveryError:error.message});
          throw new Error('Payment confirmed but automatic delivery failed: '+error.message);
        }
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
    saveGroupState(groupId,{initialized:true,baselineCutoff:Math.max(0,...valid.map(createdAt)),lastSeenAt:Math.max(0,...valid.map(createdAt)),
      seenIds:valid.map(transactionKey).slice(-MAX_SEEN),lastSuccessAt:Date.now()});
    console.log('[purchaseMonitor] Baseline established for group '+groupId+'; historical sales not replayed.');
    return;
  }
  const pending=valid.filter(tx=>!seen.has(transactionKey(tx)) && createdAt(tx)>=state.lastSeenAt-LOOKBACK_MS && createdAt(tx)>=(state.baselineCutoff||0)).sort((a,b)=>createdAt(a)-createdAt(b));
  for(const tx of pending) {
    for(const {guildId,cfg} of destinations) await recordPurchase(client,guildId,cfg,groupId,tx);
    seen.add(transactionKey(tx));
    saveGroupState(groupId,{lastSeenAt:Math.max(state.lastSeenAt,createdAt(tx)),seenIds:[...seen].slice(-MAX_SEEN)});
  }
  if(hasMore) console.warn('[purchaseMonitor] More than '+PAGE_CAP+' pages of sales exist; increase scan cap before assuming backfill is complete.');
}
async function pollGroups(client,cookie) {
  if(polling)return;
  polling=true;
  try {
    const groups=new Map();
    for(const [guildId] of client.guilds.cache){
      const cfg=config.getConfig(guildId);
      if(!cfg.robloxGroupId)continue;
      const groupId=String(cfg.robloxGroupId);
      if(!groups.has(groupId))groups.set(groupId,[]);
      groups.get(groupId).push({guildId,cfg});
    }
    for(const [groupId,destinations] of groups) {
      const state=getGroupState(groupId);
      if(Date.now()<state.nextRequestAt)continue;
      try {
        const wait=lastRequestAt+POLL_INTERVAL_MS-Date.now();
        if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
        lastRequestAt=Date.now();
        const {transactions,hasMore}=await scanSince(groupId,cookie,state);
        await processGroup(client,groupId,destinations,transactions,{hasMore});
        saveGroupState(groupId,{consecutiveFailures:0,nextRequestAt:0,lastError:null,lastSuccessAt:Date.now()});
      }catch(error) {
        const failures=state.consecutiveFailures+1,delay=retryDelay(error,failures);
        saveGroupState(groupId,{consecutiveFailures:failures,nextRequestAt:Date.now()+delay,lastError:'HTTP '+(error.response?.status||'network')+': '+error.message.slice(0,180)});
        console.warn('[purchaseMonitor] Group '+groupId+' '+(error.response?.status||'network')+'; retry in '+Math.ceil(delay/1000)+'s. '+error.message);
      }
    }
  } finally {polling=false;}
}
function start(client){
  if(started)return;
  const cookie=process.env.ROBLOX_COOKIE;
  if(!cookie){console.log('[purchaseMonitor] Monitoring disabled: ROBLOX_COOKIE missing');return;}
  started=true;
  console.log('[purchaseMonitor] Monitoring group sales with persisted receipts and retry backoff.');
  const loop=async()=>{try{await pollGroups(client,cookie)}catch(e){console.error('[purchaseMonitor] Poll failed:',e)}finally{setTimeout(loop,POLL_INTERVAL_MS).unref?.();}};
  loop();
}
function retryNow(groupId){
  saveGroupState(groupId,{nextRequestAt:0,consecutiveFailures:0});
}
module.exports={start,fetchRecentTransactions,scanSince,processGroup,pollGroups,transactionKey,retryDelay,getGroupState,recordPurchase,retryNow};
