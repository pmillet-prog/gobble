import { INFORTUNE_REWARDS } from '../../../shared/infortuneWheel.js';
import { GOBBLARS_PER_GOBBLE } from '../../../shared/gobbleRewards.js';

export const GOBBLE_REWARD_TIMING = Object.freeze({ split: 1800, fly: 4300, land: 5400, end: 6500 });
export const emptyGobblePresentation = () => ({ walletWithheld: 0, bankHold: null, gobbleReward: null });

// Presentation only. Neither a toast nor an animation is allowed to credit money.
// Wallet receipts remain authoritative; only their display is deferred to results.
export function createGobbleRewardPresentation({ getKernel, store, timers, now, documentTarget, enabled }) {
  let round = null, timer = null, startedAt = null, snapshot;
  const active = value => {
    const state = getKernel().getState();
    return enabled && state.session.isLoggedIn && state.navigation.view === 'live'
      && String(value?.roomId) === String(state.game.currentRoomId);
  };
  const same = value => round && String(round.roundId) === String(value?.roundId) && String(round.roomId) === String(value?.roomId);
  function reset() {
    timers.clearTimeout(timer); timer = null; round = null; startedAt = null;
    store.patch(emptyGobblePresentation());
  }
  function startRound(value) {
    if (!active(value) || same(value)) return;
    reset();
    if (value.training || !(value.infortune?.enabled || value.tournament?.id)) return;
    round = { roomId: value.roomId, roundId: value.roundId, wallet: 0, receipts: new Set(), ended: false, presented: false };
  }
  function settle() {
    timers.clearTimeout(timer); timer = null;
    if (round) round.presented = true;
    store.patch(emptyGobblePresentation());
  }
  function tick() {
    timers.clearTimeout(timer); timer = null;
    const reward = store.getState().gobbleReward;
    if (!reward || startedAt == null) return;
    const elapsed = now() - startedAt;
    if (documentTarget?.hidden || elapsed >= GOBBLE_REWARD_TIMING.end) { settle(); return; }
    const stage = elapsed >= GOBBLE_REWARD_TIMING.land ? 'landed'
      : elapsed >= GOBBLE_REWARD_TIMING.fly ? 'flying' : elapsed >= GOBBLE_REWARD_TIMING.split ? 'split' : 'announce';
    if (stage === 'landed') round.presented = true;
    store.patch({ gobbleReward: { ...reward, stage }, ...(stage === 'landed' ? { walletWithheld: 0, bankHold: null } : {}) });
    const next = Object.values(GOBBLE_REWARD_TIMING).find(time => time > elapsed);
    timer = timers.setTimeout(tick, next - elapsed);
  }
  function observe() {
    const state = getKernel().getState();
    if (round && !active(round)) { reset(); return; }
    const resume = state.session.resumeSnapshot;
    if (resume && resume !== snapshot) {
      snapshot = resume;
      // A reconnect syncs balances, never replays old gains or retains a stale hold.
      if (active(resume)) {
        reset();
        if (resume.currentRound && ['playing', 'intro'].includes(resume.phase))
          startRound({ ...resume.currentRound, roomId: resume.roomId });
      }
    }
    const reward = store.getState().gobbleReward;
    if (reward?.stage !== 'pending' || state.game.phase !== 'results') return;
    if (documentTarget?.hidden) { settle(); return; }
    startedAt = now(); tick();
  }
  function award(value) {
    if (!round || round.presented || !active(round) || value?.kind !== 'live_gobble') return;
    if (value.roomId != null && String(value.roomId) !== String(round.roomId)
      || value.roundId != null && String(value.roundId) !== String(round.roundId)) return;
    const amount = Math.max(0, Math.trunc(Number(value.amount) || 0));
    if (!amount || !Number.isFinite(value.balance)) return;
    const receipt = `${value.ts}:${value.balance}:${amount}`;
    if (round.receipts.has(receipt)) return;
    round.receipts.add(receipt); round.wallet += amount;
    const reward = store.getState().gobbleReward;
    store.patch({ walletWithheld: round.wallet,
      ...(reward ? { gobbleReward: { ...reward, wallet: round.wallet } } : {}) });
  }
  function endRound(value) {
    if (!active(value) || value.training) return;
    if (round && !same(value)) return;
    if (!round) startRound(value);
    if (!same(value) || round.ended) return;
    round.ended = true;
    const nick = getKernel().getState().session.nickname;
    const gobbles = Math.max(0, Math.trunc(Number(value.tournament?.roundAwarded?.[nick]?.gobbles) || 0));
    const bank = value.infortune?.enabled || value.infortuneFinale ? gobbles * INFORTUNE_REWARDS.gobble : 0;
    if (!bank && !round.wallet) { settle(); return; }
    store.patch({ bankHold: store.getState().bank,
      gobbleReward: { id: `${value.roomId}:${value.roundId}`, gobbles: gobbles || round.wallet / GOBBLARS_PER_GOBBLE, bank, wallet: round.wallet, stage: 'pending' } });
    observe();
  }
  return { reset, startRound, endRound, award, observe, refresh: tick };
}
