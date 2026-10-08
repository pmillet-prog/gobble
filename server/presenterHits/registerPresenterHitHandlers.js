import { isPresenterHitId, PRESENTER_HIT_IDENTITIES } from "../../shared/presenterHits.js";

export function registerPresenterHitHandlers(socket, { service, getRoom, getSocketPlayerIdentity }) {
  const onHit = (payload = {}) => {
    if (!payload || typeof payload !== "object" || payload.devPreview || !isPresenterHitId(payload.presenterId)) return;
    const identity = getSocketPlayerIdentity(socket);
    const room = getRoom(socket.roomId);
    const player = room?.players?.get(socket.id);
    const round = room?.currentRound;
    if (!identity || !player || player.connected === false || player.isBot || String(player.token || "").startsWith("bot-") ||
        Number(player.userId) !== Number(identity.userId) || round?.training || player.standaloneTraining?.sessionId ||
        !round) return;
    // Tournament commentary has a distinct presentation scope, while the
    // podium and ordinary interventions retain the final real round ID.
    const celebration = room.breakState?.breakKind === "tournament_end" ? room.breakState.tournamentSummary : null;
    const celebrationScope = celebration?.presenterScopeId;
    if (String(payload.roundId) !== String(round.id) &&
        (!celebrationScope || String(payload.roundId) !== String(celebrationScope))) return;
    if (!["intro", "running", "finished", "ocid_vote"].includes(round.status)) return;
    if (payload.surface === "podium") {
      const nick = PRESENTER_HIT_IDENTITIES.find(entry => entry.presenterId === payload.presenterId)?.nick;
      const onPodium = celebration?.ranking?.filter(entry => Number(entry.points ?? entry.score) > 0).slice(0, 3)
        .some(entry => entry.isBot === true && entry.nick === nick);
      if (!onPodium) return;
    }
    if (payload.presenterId === "foucault" && payload.surface !== "podium" &&
        (!["target_long", "target_score"].includes(round.special?.type) || !round.targetFoundAt?.has(player.nick))) return;
    const userId = Number(identity.userId);
    const playerKey = Number.isSafeInteger(userId) && userId > 0 ? `user:${userId}`
      : identity.installId ? `install:${identity.installId}` : "";
    if (!playerKey) return;
    service.recordHit({ playerKey, scope: `${room.id}:${round.id}`, presenterId: payload.presenterId,
      streamId: payload.streamId, sequence: payload.sequence });
  };
  socket.on("presenter:hit", onHit);
  return () => socket.off("presenter:hit", onHit);
}
