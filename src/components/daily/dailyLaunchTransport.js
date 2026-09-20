function launchError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function createDailyLaunchId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export async function requestDailyLaunch(payload, {
  emitSocketAck,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 6000,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let sentAt = Date.now();
  let data;
  try {
    const response = await fetchImpl("/api/daily/start", {
      method: "POST", credentials: "include", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    data = await response.json();
    if (!data || typeof data.ok !== "boolean") throw new Error("bad_payload");
  } catch (error) {
    if (!emitSocketAck) throw error;
    sentAt = Date.now();
    data = await emitSocketAck("daily:start", payload, { timeoutMs: 4000 });
  } finally {
    clearTimeout(timeout);
  }
  if (!data?.ok) throw launchError(data?.error || "network_error");
  return { ...data, transportElapsedMs: Date.now() - sentAt };
}

export async function launchDailyGame(payload, { isReady, ...transport } = {}) {
  const prepared = await requestDailyLaunch({ ...payload, stage: "prepare" }, transport);
  // Do not spend an attempt if the player left, the tab was hidden or the game is unavailable.
  if (!isReady()) return null;
  if (!prepared.prepared || !prepared.launchId) throw launchError("launch_unavailable");
  const commit = { ...payload, launchId: prepared.launchId, dateId: prepared.dateId, stage: "start" };
  let data;
  try {
    data = await requestDailyLaunch(commit, transport);
  } catch (error) {
    if (error.code || !isReady()) throw error;
    // Lost HTTP/socket replies reuse the same launch, never a fresh attempt.
    data = await requestDailyLaunch(commit, transport);
  }
  const remainingMs = Math.max(0, data.endsAt - data.serverNow - data.transportElapsedMs);
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) throw launchError("already_played");
  return { ...data, remainingMs, duel: prepared.duel };
}
