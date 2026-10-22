export const PLAYER_AFK_AFTER_MS = 2 * 60 * 1000;
export const PLAYER_IDLE_EXIT_AFTER_MS = 5 * 60 * 1000;
export const PLAYER_IDLE_EXIT_MESSAGE =
  "Retour à l’accueil après 5 minutes sans activité. Tu peux rejoindre une nouvelle partie.";

const MAX_REMEMBERED_IDLE_EXITS = 4096;

export function getPlayerLastActivityAt(player) {
  return Number(player?.lastActivityAt) || Number(player?.lastSeenAt) || 0;
}

export function createPlayerInactivityController({
  isHumanPlayer,
  isPlayerConnected,
  isStandaloneTrainingPlayer,
  onAfk,
  onIdleExit,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  // Kept independently of the removed presence so reconnect cannot silently
  // log the same idle session straight back in. An explicit login clears it.
  const idleExits = new Map();
  const identityKey = (identity) => {
    const userId = Number(identity?.userId);
    if (Number.isInteger(userId) && userId > 0) return `user:${userId}`;
    const installId = String(identity?.installId || "").trim().toLowerCase();
    return installId ? `install:${installId}` : null;
  };
  const liveHuman = (player) =>
    isHumanPlayer(player) &&
    !isStandaloneTrainingPlayer(player) &&
    player.trainingPresenceOnly !== true;
  const eligible = (player) => liveHuman(player) && isPlayerConnected(player);

  function isPlayerAfk(player, timestamp = now()) {
    const lastActivityAt = getPlayerLastActivityAt(player);
    return eligible(player) && !!lastActivityAt && timestamp - lastActivityAt >= PLAYER_AFK_AFTER_MS;
  }

  function clearPlayerAfkTimer(player) {
    if (player?.afkTimer == null) return;
    clearTimeoutFn(player.afkTimer);
    player.afkTimer = null;
  }

  function getIdleExit(identity) {
    return idleExits.get(identityKey(identity)) || null;
  }

  function clearIdleExit(identity) {
    idleExits.delete(identityKey(identity));
  }

  function expirePlayerIfIdle(room, socketId, player) {
    if (!room || room.players.get(socketId) !== player || !liveHuman(player)) return false;
    const lastActivityAt = getPlayerLastActivityAt(player);
    if (!lastActivityAt || now() - lastActivityAt < PLAYER_IDLE_EXIT_AFTER_MS) return false;
    clearPlayerAfkTimer(player);
    const notice = {
      type: "inactivity",
      error: "player_idle",
      roomId: room.id,
      message: PLAYER_IDLE_EXIT_MESSAGE,
      idleMs: PLAYER_IDLE_EXIT_AFTER_MS,
    };
    const key = identityKey(player);
    if (key) {
      idleExits.delete(key);
      idleExits.set(key, notice);
      if (idleExits.size > MAX_REMEMBERED_IDLE_EXITS) idleExits.delete(idleExits.keys().next().value);
    }
    onIdleExit(room, socketId, player, notice);
    return true;
  }

  function schedulePlayerAfkTransition(room, socketId, player) {
    clearPlayerAfkTimer(player);
    if (!room || !socketId || !eligible(player)) return;
    const elapsed = Math.max(0, now() - getPlayerLastActivityAt(player));
    const threshold = elapsed < PLAYER_AFK_AFTER_MS ? PLAYER_AFK_AFTER_MS : PLAYER_IDLE_EXIT_AFTER_MS;
    const timer = setTimeoutFn(() => {
      if (player.afkTimer !== timer) return;
      player.afkTimer = null;
      if (room.players.get(socketId) !== player || !eligible(player)) return;
      if (expirePlayerIfIdle(room, socketId, player)) return;
      if (isPlayerAfk(player)) onAfk(room, player);
      schedulePlayerAfkTransition(room, socketId, player);
    }, Math.max(1, threshold - elapsed));
    player.afkTimer = timer;
    player.afkTimer?.unref?.();
  }

  function markSocketPlayerActivity(room, socket, reason = "activity") {
    const player = room?.players.get(socket?.id);
    if (!player || !isHumanPlayer(player)) return false;
    const timestamp = now();
    const wasAfk = isPlayerAfk(player, timestamp);
    player.lastActivityAt = timestamp;
    player.lastSeenAt = timestamp;
    player.lastActivityReason = reason;
    schedulePlayerAfkTransition(room, socket.id, player);
    return wasAfk;
  }

  return Object.freeze({
    clearIdleExit,
    clearPlayerAfkTimer,
    expirePlayerIfIdle,
    getIdleExit,
    isPlayerAfk,
    markSocketPlayerActivity,
    schedulePlayerAfkTransition,
  });
}
