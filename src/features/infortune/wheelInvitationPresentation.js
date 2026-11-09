export function wheelInvitationEvent(state) {
  if (!state.reminderSpeaking && !state.speaking) return null;
  const reminder = state.reminderSpeaking;
  return {
    id: `${reminder ? 'wheel-reminder' : 'wheel-invitation'}:${state.roomId}:${state.roundId}`,
    kind: reminder ? 'wheel-reminder' : 'wheel-enter',
    key: state.key,
    roundId: state.roundId,
    text: reminder ? 'cliquez moi dessus pour lancer la roue!'
      : 'À toi de jouer ! Fais tourner la roue pour faire grandir ta cagnotte.',
  };
}

export function completeWheelInvitation(feature, event) {
  if (event?.kind === 'wheel-reminder') feature.finishWheelReminder(event.key);
  else if (event?.kind === 'wheel-enter') feature.enterWheel(event.key);
}
