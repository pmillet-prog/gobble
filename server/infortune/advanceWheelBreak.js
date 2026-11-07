import { INFORTUNE_EXCHANGE_STEP_MS } from '../../shared/infortuneExchangePlan.js';
import { infortuneLeaders, INFORTUNE_LEADER_WALK_MS, INFORTUNE_LEADER_LEAD_IN_MS, INFORTUNE_LEADER_LEAD_OUT_MS } from '../../shared/infortuneLeaders.js';

// End the wheel together, after all presentations or at the server deadline.
// Reserve the actual exchanges and the shared leader walk before the next round.
export function advanceWheelBreak(room, roundId, economy, now = Date.now()) {
  const state = room.breakState;
  if (!economy || String(state?.roundId) !== String(roundId) || !state.infortune || state.wheelFinished) return null;
  const deadlineAt = state.infortune.openedAt + state.infortune.windowMs;
  if (now < state.infortune.openedAt) return null;
  if (!economy.complete && now < deadlineAt) return null;
  const steps = Math.max(0, ...Object.values(economy.exchangeReplays || {}).map(replay => replay.length));
  if (state.infortune.roundNumber === 4) {
    state.wheelFinished = true;
    state.wheelClosing = null;
    state.nextStartAt = now + steps * INFORTUNE_EXCHANGE_STEP_MS + INFORTUNE_LEADER_LEAD_OUT_MS;
    return { ...state, roomId: room.id, serverNow: now, lastRoundResults: undefined };
  }
  const startsAt = now + steps * INFORTUNE_EXCHANGE_STEP_MS + INFORTUNE_LEADER_LEAD_IN_MS;
  const endsAt = startsAt + INFORTUNE_LEADER_WALK_MS;
  const leaders = infortuneLeaders((state.infortune.groups || []).flatMap(group => group.members), id => economy.members[id]?.bank);
  const nextStartAt = endsAt + INFORTUNE_LEADER_LEAD_OUT_MS;
  state.wheelFinished = true;
  state.wheelClosing = { id: `${room.id}:${roundId}:leaders`, roundNumber: state.infortune.roundNumber,
    startsAt, endsAt, leaders };
  state.nextStartAt = nextStartAt;
  return { ...state, roomId: room.id, serverNow: now, lastRoundResults: undefined };
}
