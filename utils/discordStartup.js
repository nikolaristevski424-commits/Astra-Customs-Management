const {Events}=require('discord.js');

/**
 * Login must not depend on the Discord REST slash-command registration call.
 * In some hosting environments REST requests retry while the Node process is
 * technically 'running'. The gateway should always connect first.
 */
function startGateway({client,token,deployCommands,logger=console}){
    if(!client?.once || typeof client.login!=='function')
        throw new TypeError('A Discord client with login() and once() is required');
    if(typeof deployCommands!=='function')
        throw new TypeError('deployCommands must be a function');

    client.once(Events.ClientReady,()=>{
        logger.log('[startup] Discord gateway ready. Scheduling slash-command registration...');
        // Do not await REST: other events and interactions must keep working.
        Promise.resolve().then(deployCommands).catch(error=>{
            logger.error('[startup] Slash-command registration failed: '+(error?.message||'Unknown error'));
        });
    });
    logger.log('[startup] Connecting to Discord gateway now; slash-command sync will not block login.');
    return Promise.resolve().then(()=>client.login(token));
}
module.exports={startGateway};
