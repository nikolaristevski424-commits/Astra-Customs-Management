const test=require('node:test');
const assert=require('node:assert/strict');
const polls=require('../utils/deadchatPolls');
const cmd=require('../commands/deadchat');
const prompts=require('../utils/wouldyourather');

test('deadchat poll command offers start, results and end',()=>{
 const names=cmd.data.toJSON().options.map(x=>x.name);
 assert.deepEqual(names,['start','results','end']);
});

test('deadchat votes count each member once and support changing answers',()=>{
 const guild='deadchat-counts-'+Date.now();
 const poll=polls.create(guild,{channelId:'123456789012345678',creatorId:'admin',
  question:'What next?',choices:['Game Night','Roblox RP','Chat']});
 assert.deepEqual(polls.counts(poll),[0,0,0]);
 assert.equal(polls.vote(guild,poll.id,'user1',0).changed,true);
 assert.equal(polls.vote(guild,poll.id,'user1',0).changed,false);
 assert.equal(polls.vote(guild,poll.id,'user2',1).changed,true);
 assert.equal(polls.vote(guild,poll.id,'user1',2).changed,true);
 assert.deepEqual(polls.counts(polls.find(guild,poll.id)),[0,1,1]);
 const rendered=cmd.render(guild,polls.find(guild,poll.id));
 const json=JSON.stringify(rendered);
 assert.match(json,/50%/);
 assert.match(json,/Total votes/);
 assert.match(json,/2/);
});

test('closed polls keep final counts and reject new votes',()=>{
 const guild='deadchat-close-'+Date.now();
 const poll=polls.create(guild,{channelId:'123456789012345678',creatorId:'admin',
  question:'Are you here?',choices:['Yes','No']});
 polls.vote(guild,poll.id,'a',0);
 assert.equal(polls.close(guild,poll.id,'admin').alreadyClosed,false);
 assert.equal(polls.close(guild,poll.id,'admin').alreadyClosed,true);
 assert.match(polls.vote(guild,poll.id,'b',1).error,/closed/);
 assert.deepEqual(polls.counts(polls.find(guild,poll.id)),[1,0]);
 const buttons=cmd.render(guild,polls.find(guild,poll.id)).components[0].toJSON().components;
 assert.ok(buttons.every(x=>x.disabled));
});

test('would-you-rather bank is expanded with unique options',()=>{
 assert.ok(prompts.length>=70);
 assert.ok(prompts.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>typeof x==='string'&&x.length>6)));
 assert.equal(new Set(prompts.map(p=>p.join(' | ').toLowerCase())).size,prompts.length);
});
