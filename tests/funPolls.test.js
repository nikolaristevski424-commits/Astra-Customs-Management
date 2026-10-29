const test=require('node:test');
const assert=require('node:assert/strict');
const polls=require('../utils/deadchatPolls');
const wyr=require('../commands/wouldyourather');
const general=require('../commands/poll');
const deadchat=require('../commands/deadchat');
const questions=require('../utils/wouldyourather');

test('Would You Rather questions include new Roblox, ERLC and general choices',()=>{
 assert.ok(questions.length>=100);
 assert.ok(questions.every(q=>q.length===2&&q.every(v=>typeof v==='string'&&v.length>=6)));
 assert.equal(new Set(questions.map(q=>q.join('|').toLowerCase())).size,questions.length);
 assert.ok(wyr.pick('erlc').some(q=>/ER:LC|roleplay|police|sheriff|vehicle|livery|department|ems|firefighter/i.test(q)));
});
test('Would You Rather slash command exposes a poll category',()=>{
 const cmd=wyr.data.toJSON();
 assert.equal(cmd.name,'wouldyourather');
 assert.ok(cmd.options?.some(x=>x.name==='category'));
});
test('general poll has create, results and end options',()=>{
 const values=general.data.toJSON().options;
 assert.deepEqual(values.map(v=>v.name),['create','results','end']);
 const create=values.find(v=>v.name==='create');
 assert.equal(create.options.filter(x=>x.name.startsWith('option')).length,5);
});
test('general and WYR polls each count unique member votes and do not mix with deadchat',()=>{
 const gid='mixed-polls-'+Date.now(),channelId='123456789012345678';
 const wyrPoll=polls.create(gid,{channelId,creatorId:'creator',kind:'wyr',question:'Would you rather',choices:['A','B']});
 const deadPoll=polls.create(gid,{channelId,creatorId:'creator',kind:'deadchat',question:'Anyone around?',choices:['Yes','No']});
 const genericPoll=polls.create(gid,{channelId,creatorId:'creator',kind:'poll',question:'Pick one',choices:['Red','Blue','Green']});
 assert.equal(polls.latest(gid,channelId,'wyr').id,wyrPoll.id);
 assert.equal(polls.latest(gid,channelId,'deadchat').id,deadPoll.id);
 assert.equal(polls.latest(gid,channelId,'poll').id,genericPoll.id);
 polls.vote(gid,wyrPoll.id,'u1',0);
 polls.vote(gid,wyrPoll.id,'u1',1);
 polls.vote(gid,genericPoll.id,'u1',0);
 polls.vote(gid,genericPoll.id,'u2',0);
 polls.vote(gid,genericPoll.id,'u3',2);
 assert.deepEqual(polls.counts(polls.find(gid,wyrPoll.id)),[0,1]);
 assert.deepEqual(polls.counts(polls.find(gid,deadPoll.id)),[0,0]);
 assert.deepEqual(polls.counts(polls.find(gid,genericPoll.id)),[2,0,1]);
 const result=deadchat.render(gid,polls.find(gid,genericPoll.id));
 assert.ok(JSON.stringify(result).includes('67%'));
 assert.equal(result.components[0].toJSON().components.length,3);
 assert.match(result.components[0].toJSON().components[0].custom_id,/^community_vote_/);
});
test('poll votes persist after status changed and disabled buttons prevent further voting',()=>{
 const gid='closed-community-'+Date.now();
 const p=polls.create(gid,{channelId:'123456789012345678',creatorId:'owner',
  kind:'poll',question:'Pick',choices:['A','B']});
 polls.vote(gid,p.id,'u1',1);
 polls.close(gid,p.id,'owner');
 assert.match(polls.vote(gid,p.id,'u2',0).error,/closed/);
 const rendered=deadchat.render(gid,polls.find(gid,p.id));
 assert.ok(rendered.components[0].toJSON().components.every(x=>x.disabled));
});
