const {SlashCommandBuilder,MessageFlags}=require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const {isExecutive}=require('../utils/env');
const {isOwner}=require('../utils/ownership');
const ledger=require('../utils/partnerLedger');
const {makeCard,COLORS,safe}=require('../utils/visualSystem');

const data=new SlashCommandBuilder().setName('partnership-stats')
    .setDescription('Track successful partnership announcements and team Robux commission.')
    .addSubcommand(s=>s.setName('mine').setDescription('View your own recorded partnerships and Robux total'))
    .addSubcommand(s=>s.setName('user').setDescription('View a specific team member’s partnerships (management only)')
        .addUserOption(o=>o.setName('member').setDescription('Team member').setRequired(true)))
    .addSubcommand(s=>s.setName('leaderboard').setDescription('View partnership team counts and accrued rewards (management only)'));

async function execute(interaction){
    const cfg=config.getConfig(interaction.guildId);
    const manager=perms.isManager(interaction.member,cfg)||isExecutive(interaction.member)||isOwner(interaction);
    const sub=interaction.options.getSubcommand();
    if(sub!=='mine'&&!manager)
        return interaction.reply({content:'Only management can view other members’ partnership totals.',flags:MessageFlags.Ephemeral});
    if(sub==='leaderboard'){
        const ranked=ledger.leaderboard(interaction.guildId).slice(0,15);
        const lines=ranked.map((e,i)=>{
            const historical=ledger.stats(interaction.guildId,e.userId);
            return '**'+(i+1)+'.** <@'+e.userId+'>   •   **R$'+e.robuxEarned+'**\n'+
                 historical.activeCount+' active  /  '+historical.terminatedCount+' terminated  /  '+
                 historical.count+' recorded';
        });
        return interaction.reply(makeCard(cfg,{
            title:'Partnership Leaderboard',
            subtitle:'TEAM PERFORMANCE  /  R$20 PER RECORDED PARTNERSHIP',
            intro:'Historical commissions are preserved even if a representative leaves and a partnership is terminated.',
            details:['**TEAM MEMBERS**\n'+(lines.length?lines.join('\n\n'):'No partnerships recorded yet.')],
            note:'**Financial note**  These are tracked commissions, not confirmed or automatically sent Roblox payouts.',
            accentColor:COLORS.purple,ephemeral:true
        }));
    }
    const userId=sub==='mine'?interaction.user.id:interaction.options.getUser('member',true).id;
    const stats=ledger.stats(interaction.guildId,userId);
    const recent=stats.entries.slice(-6).reverse().map(e=>
      '**#'+e.id+'  '+safe(e.server,80)+'**  ·  '+(e.status===ledger.STATUS.terminated?'Terminated':'Active')+
      '\n'+safe(e.invite,200)+(e.terminatedReason?'\nReason: '+safe(e.terminatedReason,150):'')
    );
    return interaction.reply(makeCard(cfg,{
        title:'Partnership Activity',
        subtitle:'TEAM MEMBER  /  ACCRUED COMMISSIONS',
        intro:'**Member**  <@'+userId+'>\n**Recorded**  '+stats.count+'   •   **Active**  '+
             stats.activeCount+'   •   **Terminated**  '+stats.terminatedCount+
             '\n**Historical earnings**  R$'+stats.robuxEarned,
        details:['**RECENT PARTNERSHIPS**\n'+(recent.length?recent.join('\n\n'):'No recorded partnerships')],
        note:'**Important**  Leaving representatives trigger automatic termination and removal of active announcements. Historical commission records remain for management to audit. Payouts are not automatic.',
        accentColor:COLORS.purple,ephemeral:true
    }));

}
module.exports={data,execute};
