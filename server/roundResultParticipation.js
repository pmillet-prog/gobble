// A training observer is connected to the socket, but has left live play.
// Keep genuine activity earned before leaving, as for a disconnected player.
export function getRoundResultParticipation(player, { isBot = false, participated = false } = {}) {
  const connected = isBot || !!(
    player && player.connected !== false &&
    !player.standaloneTraining?.sessionId && player.trainingPresenceOnly !== true
  );
  return { connected, included: connected || !!participated };
}
