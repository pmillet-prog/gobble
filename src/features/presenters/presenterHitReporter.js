import { isPresenterHitId } from "../../../shared/presenterHits.js";

const reporters = new WeakMap();

// No subscriptions, React state or send queue: read the current live context
// only for a hit that the sprite accepted. The same stream survives reconnects.
export function reportPresenterHit(kernel, presenterId, { roundId, devPreview = false, surface = "intervention" } = {}) {
  if (!kernel || devPreview || !isPresenterHitId(presenterId)) return false;
  const state = kernel.getState?.();
  const socket = kernel.ports?.realtime;
  const activeRoundId = roundId ?? state?.realtime?.roundId;
  if (state?.navigation?.view !== "live" || !state?.session?.isLoggedIn || !socket?.connected || activeRoundId == null) return false;
  let reporter = reporters.get(kernel);
  if (!reporter) {
    const streamId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    reporter = { streamId, sequence: 0 };
    reporters.set(kernel, reporter);
  }
  socket.emit("presenter:hit", { presenterId, roundId: activeRoundId, streamId: reporter.streamId,
    sequence: ++reporter.sequence, surface });
  return true;
}
