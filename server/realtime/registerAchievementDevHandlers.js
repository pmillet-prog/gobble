import { randomUUID } from "node:crypto";
import { TROPHY_BY_ID } from "../../shared/trophyCatalog.js";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GRANTS = 512;
const GRANT_INTERVAL_MS = 500;

// A socket-local simulation: no collection, progression or leaderboard writes.
// Keep every accepted request until reset so a retry cannot increment twice.
export function registerAchievementDevHandlers(socket, { requireDevToolsAccess, getRoom, now = Date.now }) {
  const counts = new Map();
  const requests = new Map();
  let ownerId = null;
  let lastGrantAt = -Infinity;

  function reset() {
    counts.clear();
    requests.clear();
    lastGrantAt = -Infinity;
  }
  function authorize(reply) {
    const candidate = Number(socket.data?.authUser?.id);
    const userId = Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
    if (ownerId !== userId) {
      reset();
      ownerId = userId;
    }
    if (!requireDevToolsAccess(socket, reply)) return null;
    if (!userId) {
      reply({ ok: false, error: "auth_required" });
      return null;
    }
    return userId;
  }
  const replyTo = callback => typeof callback === "function" ? callback : () => {};

  socket.on("dev:achievement:status", (_payload, callback) => {
    const reply = replyTo(callback);
    if (authorize(reply)) reply({ ok: true, allowed: true });
  });

  socket.on("dev:achievement:grant", (payload, callback) => {
    const reply = replyTo(callback);
    const userId = authorize(reply);
    if (!userId) return;
    const id = payload?.id;
    if (typeof id !== "string" || !Object.hasOwn(TROPHY_BY_ID, id)) {
      return reply({ ok: false, error: "invalid_achievement" });
    }
    if (typeof payload?.requestId !== "string" || !REQUEST_ID.test(payload.requestId)) {
      return reply({ ok: false, error: "invalid_request" });
    }
    const requestId = payload.requestId.toLowerCase();
    const previous = requests.get(requestId);
    if (previous) return reply(previous.award.id === id ? previous : { ok: false, error: "invalid_request" });
    if (requests.size >= MAX_GRANTS) return reply({ ok: false, error: "dev_achievement_limit" });
    const earnedAt = now();
    if (earnedAt - lastGrantAt < GRANT_INTERVAL_MS) {
      return reply({ ok: false, error: "rate_limited", retryAfterMs: GRANT_INTERVAL_MS - (earnedAt - lastGrantAt) });
    }
    const roundId = socket.roomId ? getRoom(socket.roomId)?.currentRound?.id : null;
    const previousCount = counts.get(id) || 0;
    const count = TROPHY_BY_ID[id].unique ? 1 : previousCount + 1;
    const result = { ok: true, award: { id, eventId: `achievement-dev:${randomUUID()}`, userId,
      delta: count - previousCount, count, roundId: roundId == null ? null : String(roundId), earnedAt, dev: true } };
    counts.set(id, count);
    requests.set(requestId, result);
    lastGrantAt = earnedAt;
    reply(result);
  });

  socket.on("dev:achievement:reset", (_payload, callback) => {
    const reply = replyTo(callback);
    if (!authorize(reply)) return;
    reset();
    reply({ ok: true });
  });
  socket.on("disconnect", () => {
    reset();
    ownerId = null;
  });
}
