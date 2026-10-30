const store=require('./store');
const STORE='partnershipLedger';
const REWARD_PER_PARTNERSHIP=20;
function defaultState(){return{counter:1,entries:[]};}

function record(guildId,{userId,server,invite,messageId,messageUrl,representativeIds=[]}){
    if(!userId || !invite || (!messageId && !messageUrl))
        throw Error('A published partnership needs a responsible user, invite and Discord message.');
    let result;
    store.update(STORE,guildId,defaultState(),state=>{
        const existing=state.entries.find(p=>p.invite===invite || (messageId && p.messageId===messageId));
        if(existing){
            result={created:false,entry:existing};
            return state;
        }
        const entry={
            id:state.counter++,userId,server:String(server).slice(0,100),invite,
            messageId:messageId||null,messageUrl:messageUrl||null,
            representativeIds,createdAt:Date.now(),reward:REWARD_PER_PARTNERSHIP
        };
        state.entries.push(entry);
        result={created:true,entry};
        return state;
    });
    return result;
}
function list(guildId){return store.get(STORE,guildId,defaultState()).entries;}
function stats(guildId,userId){
    const entries=list(guildId).filter(e=>!userId || e.userId===userId);
    const count=entries.length;
    return{count,robuxEarned:entries.reduce((n,e)=>n+(Number(e.reward)||0),0),entries};
}
function leaderboard(guildId){
    const totals=new Map();
    for(const e of list(guildId)){
        const t=totals.get(e.userId)||{userId:e.userId,count:0,robuxEarned:0};
        t.count++;t.robuxEarned+=Number(e.reward)||0;totals.set(e.userId,t);
    }
    return [...totals.values()].sort((a,b)=>b.count-a.count||a.userId.localeCompare(b.userId));
}
module.exports={REWARD_PER_PARTNERSHIP,record,list,stats,leaderboard};
