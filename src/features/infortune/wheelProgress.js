export function wheelProgress(economy, groups = [], nowServer = Date.now()) {
  const rows = groups.flatMap((group, groupIndex) => group.members.filter(player => !player.isBot).map(player => {
    const member = economy?.members?.[player.id] || {};
    const launched = member.launched ?? member.spin === 'done';
    const exchange = !!economy?.exchangeEnabled && !!member.needsExchange;
    const status = member.spin !== 'done' ? launched ? 'spinning' : 'pending'
      : member.presented === false ? 'returning'
      : exchange ? member.choiceMade ? member.target ? 'chosen' : 'declined' : 'choosing' : 'ready';
    return { id: player.id, userId: player.userId, nick: player.nick, group: groupIndex + 1, exchange, status,
      seconds: member.choiceUntil ? Math.max(0, Math.ceil((member.choiceUntil - nowServer) / 1000)) : null };
  }));
  const count = status => rows.filter(row => row.status === status).length;
  return { rows, pending: count('pending'), spinning: count('spinning'), returning: count('returning'), choosing: count('choosing') };
}
