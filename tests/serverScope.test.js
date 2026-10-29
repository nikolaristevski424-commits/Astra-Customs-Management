const test = require('node:test');
const assert = require('node:assert/strict');
const scope = require('../utils/serverScope');
const servers = require('../commands/servers');
const serverAlias = require('../commands/server');
const FOUNDER_ID = '1255248600850497568';
const ASTRA = scope.ASTRA_GUILD_ID;
const OTHER = '1599999999999999999';

function fakeInteraction(userId, subcommand, options = {}) {
    let replied, edited, leaves = 0;
    const otherGuild = {id:OTHER,name:'Other Community',memberCount:12,leave:async()=>{leaves++;}};
    const astraGuild = {id:ASTRA,name:'Astra Customs',memberCount:200,leave:async()=>{leaves++;}};
    const guilds = new Map([[ASTRA,astraGuild],[OTHER,otherGuild]]);
    return {
        interaction:{
            guildId:ASTRA,
            guild:{id:ASTRA,ownerId:options.ownerId||'123456789012345678'},
            user:{id:userId},
            member:{id:userId,roles:{cache:new Map()},permissions:{has:()=>true}},
            client:{guilds:{cache:guilds}},
            options:{
                getSubcommand:()=>subcommand,
                getString:()=>options.serverId||OTHER,
                getBoolean:()=>options.confirm??true,
            },
            reply:async value=>{replied=value;},
            deferReply:async()=>{},
            editReply:async value=>{edited=value;},
        },
        output:()=>replied || edited,
        leaves:()=>leaves,
    };
}

test('Astra server identity and auto-leave flag are explicit',()=>{
    assert.equal(ASTRA,'1488378242846036070');
    assert.equal(scope.isAstraGuild(ASTRA),true);
    assert.equal(scope.isAstraGuild(OTHER),false);
    assert.equal(scope.autoLeaveEnabled({AUTO_LEAVE_OTHER_GUILDS:'0'}),false);
    assert.equal(scope.autoLeaveEnabled({AUTO_LEAVE_OTHER_GUILDS:'1'}),true);
});

test('server listing exposes all connected guilds privately to founder',async()=>{
    const session=fakeInteraction(FOUNDER_ID,'list');
    await servers.execute(session.interaction);
    assert.match(session.output().content,/Other Community/);
    assert.match(session.output().content,/Astra Customs/);
    assert.equal(session.output().flags,64);
});

test('only exact founder user ID can invoke /server leave, even if someone else is the server owner',async()=>{
    const session=fakeInteraction('999999999999999999','leave',{ownerId:'999999999999999999'});
    await serverAlias.execute(session.interaction);
    assert.match(session.output().content,/Only the Astra Customs founder/);
    assert.equal(session.leaves(),0);
});

test('founder can remove an unwanted server with confirmation',async()=>{
    const session=fakeInteraction(FOUNDER_ID,'leave');
    await serverAlias.execute(session.interaction);
    assert.equal(session.leaves(),1);
    assert.match(session.output(),/Left/);
});

test('founder cannot remove bot from Astra Customs and cannot leave without confirmation',async()=>{
    const protectedServer=fakeInteraction(FOUNDER_ID,'leave',{serverId:ASTRA});
    await serverAlias.execute(protectedServer.interaction);
    assert.equal(protectedServer.leaves(),0);
    assert.match(protectedServer.output().content,/cannot remove itself/);
    const unconfirmed=fakeInteraction(FOUNDER_ID,'leave',{confirm:false});
    await serverAlias.execute(unconfirmed.interaction);
    assert.equal(unconfirmed.leaves(),0);
});

test('auto leave setting targets only other guilds, never official Astra',async()=>{
    const astra={id:ASTRA,name:'Astra Customs',leave:async()=>{throw new Error('Should never leave Astra')}};
    let left=0;
    const other={id:OTHER,name:'Another Server',leave:async()=>{left++;}};
    assert.equal((await scope.checkGuild(astra,{autoLeave:true})).status,'allowed');
    assert.equal((await scope.checkGuild(other,{autoLeave:false})).status,'blocked');
    assert.equal(left,0);
    assert.equal((await scope.checkGuild(other,{autoLeave:true})).status,'left');
    assert.equal(left,1);
});

test('old interactions in another server are blocked even before command dispatch',async()=>{
    const event=require('../events/interactionCreate');
    let response;
    const interaction={
      guildId:OTHER,commandName:'payout',customId:'payout_autosend_1',
      isRepliable:()=>true,
      reply:async payload=>{response=payload},
      isChatInputCommand:()=>true,
      client:{commands:new Map([['payout',{execute:async()=>{throw new Error('should not execute')}}]])}
    };
    await event.execute(interaction);
    assert.match(response.content,/only available in the official Astra Customs server/i);
});
