export function areRoundResultsPending({ live, training, roomId, roundId, receivedRound }) {
  return Boolean(live && !training && roundId != null &&
    (String(receivedRound?.roundId) !== String(roundId) || String(receivedRound?.roomId) !== String(roomId)));
}
