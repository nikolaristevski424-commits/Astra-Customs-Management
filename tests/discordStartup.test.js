const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Events}=require('discord.js');
const {startGateway}=require('../utils/discordStartup');

function mock(){
    const client=new EventEmitter(),calls=[],logs=[];
    client.login=async token=>{
        calls.push('login');
        assert.equal(token,'fake-private-token');
        return token;
    };
    const logger={
        log:value=>logs.push(String(value)),
        error:value=>logs.push(String(value))
    };
    return{client,calls,logs,logger};
}
test('Discord login runs without waiting for a stuck command REST deployment',async()=>{
    const {client,calls,logger}=mock();
    let release;
    const neverCompletes=new Promise(resolve=>{release=resolve});
    const started=startGateway({
        client,token:'fake-private-token',logger,
        deployCommands:async()=>{calls.push('deploy');return neverCompletes}
    });
    await started;
    assert.deepEqual(calls,['login'],'Login must not wait for command registration');
    client.emit(Events.ClientReady);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,['login','deploy']);
    release();
});
test('command sync only begins after the ready event, and runs once',async()=>{
    const {client,calls,logger}=mock();
    await startGateway({
        client,token:'fake-private-token',logger,
        deployCommands:()=>{calls.push('deploy')}
    });
    assert.deepEqual(calls,['login']);
    client.emit(Events.ClientReady);
    client.emit(Events.ClientReady);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,['login','deploy']);
});
test('command REST failure is logged, without breaking Discord gateway',async()=>{
    const {client,calls,logger,logs}=mock();
    await startGateway({
        client,token:'fake-private-token',logger,
        deployCommands:async()=>{calls.push('deploy');throw Error('Discord REST unavailable')}
    });
    client.emit(Events.ClientReady);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,['login','deploy']);
    assert.ok(logs.some(x=>x.includes('Discord REST unavailable')));
});
test('invalid Discord token surfaces an error; command sync is not invoked',async()=>{
    const {client,calls,logger}=mock();
    client.login=async()=>{calls.push('login');throw Error('Invalid token')};
    await assert.rejects(
        startGateway({
            client,token:'fake-private-token',logger,
            deployCommands:async()=>{calls.push('deploy')}
        }),
        /Invalid token/
    );
    assert.deepEqual(calls,['login']);
});
