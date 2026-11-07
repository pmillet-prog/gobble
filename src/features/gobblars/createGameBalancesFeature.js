import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { subscribeForegroundClockRefresh } from "../../utils/realtimeClock.js";
import { INFORTUNE_CLIENT_ENABLED } from "../infortune/infortuneAvailability.js";
import { createGobbleRewardPresentation, emptyGobblePresentation } from './createGobbleRewardPresentation.js';

// The wallet belongs to preferences; this service owns only the private current
// tournament bank. It survives individual presentation mounts and resyncs after
// offline time without persisting an account's balance in browser storage.
export function createGameBalancesFeature({ getKernel, ports, scope }, { timers = globalThis, now = Date.now,
  documentTarget = globalThis.document, enabled = INFORTUNE_CLIENT_ENABLED } = {}) {
  const store = createFeatureStore({ bank: null, tournamentId: null, ...emptyGobblePresentation() });
  const rewards = createGobbleRewardPresentation({ getKernel, store, timers, now, documentTarget, enabled });
  let roomId = null, accountId = null, generation = 0, pending = false, dirty = false, timeout = null, queued = null;
  let requestId = 0;
  function cancel() {
    generation++; pending = dirty = false;
    timers.clearTimeout(timeout); timers.clearTimeout(queued); timeout = queued = null;
  }
  function refresh() {
    if (!roomId || !enabled) return;
    if (pending) { dirty = true; return; }
    const token = generation, id = ++requestId;
    pending = true; dirty = false;
    timeout = timers.setTimeout(() => { if (token === generation && id === requestId) {
      pending = false; timeout = null; if (dirty) changed();
    } }, 4000);
    ports.realtime.emit("infortune:bank", { roomId }, reply => {
      if (token !== generation || id !== requestId || !pending) return;
      pending = false; timers.clearTimeout(timeout); timeout = null;
      if (reply?.ok && String(reply.roomId) === String(roomId) && Number.isFinite(reply.bank))
        store.patch({ bank: reply.bank, tournamentId: reply.tournamentId });
      if (dirty) changed();
    });
  }
  function changed(value) {
    if (value?.roomId != null && String(value.roomId) !== String(roomId)) return;
    if (queued !== null || !roomId) return;
    queued = timers.setTimeout(() => { queued = null; refresh(); }, 0);
  }
  function observe() {
    const state = getKernel().getState();
    const nextRoom = state.session.isLoggedIn && ["live", "vault"].includes(state.navigation.view) ? state.game.currentRoomId : null;
    const nextAccount = state.session.authState?.user?.id ?? state.session.nickname;
    if (String(nextRoom) !== String(roomId) || nextAccount !== accountId) {
      cancel(); rewards.reset(); roomId = nextRoom; accountId = nextAccount;
      store.patch({ bank: null, tournamentId: null }); refresh();
    }
    rewards.observe();
  }
  return { store, refresh, start() {
    scope.add(getKernel().subscribe(observe));
    scope.add(ports.realtime.bind({ connect: changed,
      roundStarted(value) { rewards.startRound(value); changed(value); },
      roundEnded(value) { rewards.endRound(value); changed(value); },
      gobblarsAwarded: rewards.award,
      gobblarsBalanceUpdated(value) {
        if (Number.isSafeInteger(value?.balance) && value.balance >= 0)
          getKernel().features.prepare('preferences').set('gobblarsBalance', value.balance);
      },
      infortuneEconomy: changed, infortunePlateau: changed, infortuneFinale: changed,
      breakStarted: changed, tournamentLobbyUpdate: changed }));
    scope.add(subscribeForegroundClockRefresh(() => { rewards.refresh(); refresh(); }, { documentTarget }));
    observe(); scope.add(() => { cancel(); rewards.reset(); roomId = accountId = null; });
  } };
}
