// Strict ownership check: no implicit Administrator, executive or staff bypass.
function ids(value) {return String(value||'').split(',').map(s=>s.trim()).filter(id=>/^\d{17,22}$/.test(id));}
function isOwner(interaction) {
  if (!interaction?.guild || !interaction?.member) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (ids(process.env.OWNERSHIP_USER_IDS).includes(interaction.user.id)) return true;
  const roles=interaction.member.roles?.cache;
  // Verified Astra Customs ownership role; overrideable through the host env.
  const ownerRoleIds=ids(process.env.OWNERSHIP_ROLE_IDS || '1538963559986372719');
  return !!roles?.some(role => ownerRoleIds.includes(role.id));
}
module.exports={isOwner,ids};
