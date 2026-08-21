function getActivePlayer(socket, cb, { getRoom, isStandaloneTrainingPlayer }) {
  const room = getRoom(socket.roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) {
    cb?.({ ok: false, error: "not_logged_in" });
    return null;
  }
  if (isStandaloneTrainingPlayer(player)) {
    cb?.({ ok: false, error: "standalone_training" });
    return null;
  }
  return { room, player };
}

export function registerSpecialRoundHandlers(
  socket,
  {
    clearOcidProposalForNick,
    getRoom,
    isStandaloneTrainingPlayer,
    markSocketPlayerActivity,
    submitOcidProposalForNick,
    submitOcidVoteForNick,
    updateSpecial3WordsState,
  }
) {
  const playerDependencies = { getRoom, isStandaloneTrainingPlayer };

  socket.on("special3Words:update", (payload, cb) => {
    const active = getActivePlayer(socket, cb, playerDependencies);
    if (!active) return;
    const { room, player } = active;
    markSocketPlayerActivity(room, socket, "special3");
    const result = updateSpecial3WordsState(room, {
      roundId: payload?.roundId,
      nick: player?.nick,
      wordSlots: payload?.wordSlots,
      specialPlacements: payload?.specialPlacements,
    });
    cb?.(result);
  });

  socket.on("ocid:propose", (payload, cb) => {
    const active = getActivePlayer(socket, cb, playerDependencies);
    if (!active) return;
    const { room, player } = active;
    markSocketPlayerActivity(room, socket, "ocid_propose");
    const result = submitOcidProposalForNick(room, {
      roundId: payload?.roundId,
      nick: player.nick,
      word: payload?.word,
      path: payload?.path,
    });
    cb?.(result);
  });

  socket.on("ocid:clearProposal", (payload, cb) => {
    const active = getActivePlayer(socket, cb, playerDependencies);
    if (!active) return;
    const { room, player } = active;
    markSocketPlayerActivity(room, socket, "ocid_clear");
    const result = clearOcidProposalForNick(room, {
      roundId: payload?.roundId,
      nick: player.nick,
    });
    cb?.(result);
  });

  socket.on("ocid:vote", (payload, cb) => {
    const active = getActivePlayer(socket, cb, playerDependencies);
    if (!active) return;
    const { room, player } = active;
    markSocketPlayerActivity(room, socket, "ocid_vote");
    const result = submitOcidVoteForNick(room, {
      roundId: payload?.roundId,
      nick: player.nick,
      optionId: payload?.optionId,
    });
    cb?.(result);
  });
}
