const store=require('./store');
const STORE='deadchatPolls';
const initial=()=>({counter:1,polls:[]});
function create(guildId,{channelId,creatorId,question,choices,kind='deadchat'}){
  let poll;
  store.update(STORE,guildId,initial(),state=>{
    const id=state.counter++;
    poll={id,channelId,creatorId,question,choices,kind,
      votes:{},status:'open',createdAt:Date.now(),closedAt:null,messageId:null};
    state.polls.push(poll);
    return state;
  });
  return poll;
}
function find(guildId,id){
  return store.get(STORE,guildId,initial()).polls.find(p=>p.id===Number(id))||null;
}
function vote(guildId,id,userId,index){
  let outcome={error:'Poll not found.'};
  store.update(STORE,guildId,initial(),state=>{
    const poll=state.polls.find(p=>p.id===Number(id));
    if(!poll)return state;
    if(poll.status!=='open'){outcome={error:'This poll is closed.'};return state;}
    if(!Number.isInteger(index)||index<0||index>=poll.choices.length){
      outcome={error:'Invalid answer.'};return state;
    }
    const previous=poll.votes[userId];
    poll.votes[userId]=index;
    outcome={poll,changed:previous!==index,previous};
    return state;
  });
  return outcome;
}
function close(guildId,id,closedBy){
  let outcome={error:'Poll not found.'};
  store.update(STORE,guildId,initial(),state=>{
    const poll=state.polls.find(p=>p.id===Number(id));
    if(!poll)return state;
    if(poll.status==='closed'){outcome={poll,alreadyClosed:true};return state;}
    poll.status='closed';poll.closedAt=Date.now();poll.closedBy=closedBy;
    outcome={poll,alreadyClosed:false};
    return state;
  });
  return outcome;
}
function attach(guildId,id,messageId){
  store.update(STORE,guildId,initial(),state=>{
    const poll=state.polls.find(p=>p.id===Number(id));
    if(poll)poll.messageId=messageId;
    return state;
  });
}
function counts(poll){
  const values=poll.choices.map(()=>0);
  for(const i of Object.values(poll.votes||{}))if(Number.isInteger(i)&&values[i]!==undefined)values[i]++;
  return values;
}
function latest(guildId,channelId,kind='deadchat'){
  const list=store.get(STORE,guildId,initial()).polls;
  return [...list].reverse().find(p=>p.channelId===channelId && (p.kind||'deadchat')===kind)||null;
}
module.exports={create,find,vote,close,attach,counts,latest};
