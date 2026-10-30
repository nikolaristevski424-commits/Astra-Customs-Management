const {SlashCommandBuilder,MessageFlags}=require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const {isExecutive}=require('../utils/env');
const {isOwner}=require('../utils/ownership');
const ledger=require('../utils/partnerLedger');

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
        return interaction.reply({flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},content:[
            '**Astra Customs | Partnership Team Tracker**',
            '**Rate:** R$20 per unique successfully published partnership',
            '',
            ...(ranked.length?ranked.map((e,i)=>'**'+(i+1)+'.** <@'+e.userId+'> — '+e.count+' partnership(s) · R$'+e.robuxEarned):['No partnerships recorded yet.']),
            '',
            'These are tracked amounts, not confirmed or automatically sent Roblox payouts.'
        ].join('\n').slice(0,1950)});
    }
    const userId=sub==='mine'?interaction.user.id:interaction.options.getUser('member',true).id;
    const s=ledger.stats(interaction.guildId,userId);
    return interaction.reply({flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},content:[
        '**Astra Customs | Partnership Activity**',
        '**Team member:** <@'+userId+'>',
        '**Recorded partnerships:** '+s.count,
        '**Rate:** R$'+ledger.REWARD_PER_PARTNERSHIP+' per partnership',
        '**Total accrued:** R$'+s.robuxEarned,
        '',
        '**Recent partnerships:**',
        ...(s.entries.length?s.entries.slice(-5).reverse().map(e=>'• #'+e.id+' — '+e.server+' ('+e.invite+')'):['None recorded yet.']),
        '',
        'Amounts are for tracking; a manager must verify partnerships before paying. No Robux are automatically sent.'
    ].join('\n').slice(0,1950)});
}
module.exports={data,execute};
