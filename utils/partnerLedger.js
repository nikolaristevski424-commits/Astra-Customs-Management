const store=require('./store');
const STORE='partnershipLedger';
const REWARD_PER_PARTNERSHIP=20;
const STATUS=Object.freeze({active:'active',terminated:'terminated'});
function defaultState(){return{counter:1,entries:[]};}

function record(guildId,{userId,server,invite,messageId,messageUrl,representativeIds=[]}){
    if(!userId || !invite || (!messageId && !messageUrl))
        throw Error('A published partnership needs a responsible user, invite and Discord message.');
    let result;
    store.update(STORE,guildId,defaultState(),state=>{
        const existing=state.entries.find(p=>p.invite===invite || (messageId && p.messageId===messageId));
        if(existing){
            // A partner may be formally re-established without earning the
            // commission again for an invite already counted historically.
            if(existing.status===STATUS.terminated && existing.invite===invite && existing.messageId!==messageId){
                Object.assign(existing,{
                    status:STATUS.active,terminatedAt:null,terminatedReason:null,terminatedBy:null,
                    deletedAt:null,deleteError:null,server:String(server).slice(0,100),
                    userId,representativeIds:[...new Set(representativeIds)],messageId:messageId||null,
                    messageUrl:messageUrl||null,reestablishedAt:Date.now()
                });
                result={created:false,reactivated:true,entry:existing};
                return state;
            }
            result={created:false,reactivated:false,entry:existing};
            return state;
        }
        const entry={
            id:state.counter++,userId,server:String(server).slice(0,100),invite,
            messageId:messageId||null,messageUrl:messageUrl||null,
            representativeIds:[...new Set(representativeIds)],createdAt:Date.now(),
            status:STATUS.active,reward:REWARD_PER_PARTNERSHIP
        };
        state.entries.push(entry);
        result={created:true,entry};
        return state;
    });
    return result;
}
function list(guildId){return store.get(STORE,guildId,defaultState()).entries;}
function active(guildId){return list(guildId).filter(entry=>entry.status!==STATUS.terminated);}
function stats(guildId,userId){
    const entries=list(guildId).filter(e=>!userId || e.userId===userId);
    const count=entries.length;
    return{count,activeCount:entries.filter(e=>e.status!==STATUS.terminated).length,
      terminatedCount:entries.filter(e=>e.status===STATUS.terminated).length,
      robuxEarned:entries.reduce((n,e)=>n+(Number(e.reward)||0),0),entries};
}
function leaderboard(guildId){
    const totals=new Map();
    for(const e of list(guildId)){
        const t=totals.get(e.userId)||{userId:e.userId,count:0,robuxEarned:0};
        t.count++;t.robuxEarned+=Number(e.reward)||0;totals.set(e.userId,t);
    }
    return [...totals.values()].sort((a,b)=>b.count-a.count||a.userId.localeCompare(b.userId));
}
function terminateRepresentative(guildId,representativeId){
    const affected=[];
    store.update(STORE,guildId,defaultState(),state=>{
        for(const entry of state.entries){
            if(entry.status===STATUS.terminated ||
               !entry.representativeIds?.includes(representativeId))continue;
            entry.status=STATUS.terminated;
            entry.terminatedAt=Date.now();
            entry.terminatedBy=representativeId;
            entry.terminatedReason='Partner representative left Astra Customs';
            affected.push({...entry});
        }
        return state;
    });
    return affected;
}
function markDeletion(guildId,id,{deleted=false,error=null}={}){
    let changed=null;
    store.update(STORE,guildId,defaultState(),state=>{
        const entry=state.entries.find(e=>e.id===id);
        if(!entry || entry.status!==STATUS.terminated)return state;
        if(deleted){entry.deletedAt=Date.now();entry.deleteError=null;}
        else entry.deleteError=String(error||'Could not remove published announcement').slice(0,180);
        changed={...entry};
        return state;
    });
    return changed;
}
module.exports={STATUS,REWARD_PER_PARTNERSHIP,record,list,active,stats,leaderboard,
    terminateRepresentative,markDeletion};
