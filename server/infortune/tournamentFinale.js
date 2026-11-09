import { createInfortuneFinaleSession } from "../../shared/createInfortuneFinaleSession.js";
import { drawFinaleGiftLetters } from '../../shared/finaleGiftLetters.js';
import { buyFinaleLetter } from './buyFinaleLetter.js';
import { normalizeFinaleText } from '../../shared/infortuneFinaleRules.js';
import { infortunePlayerKey } from "../../shared/infortunePlateaus.js";
import { INFORTUNE_FINALE_DURATION_MS, INFORTUNE_FINALE_VICTORY_POINTS,
  INFORTUNE_FINAL_RANKING_MS, rankInfortuneFinale } from "../../shared/infortuneTournamentFinale.js";

// The room owns one game, with private sessions keyed by authenticated identity.
// Public updates contain only standings and deadlines until the finale closes.
export function createTournamentWheelFinale({ roomId, tournamentId, startsAt, introStartsAt = startsAt, puzzle, ranking, ledger,
  rules = {}, wallet = null, random = Math.random, freeLetters = drawFinaleGiftLetters(puzzle.clue, random), now = Date.now, timers = globalThis, onChange = () => {}, onWin = () => {}, onFinish = () => {} }) {
  const deadlineAt = startsAt + INFORTUNE_FINALE_DURATION_MS;
  const podiumAt = deadlineAt + INFORTUNE_FINAL_RANKING_MS;
  const participants = new Map(), outcomes = new Map();
  for (const entry of ranking) {
    const key = infortunePlayerKey(entry);
    if (entry.isBot || !key || participants.has(key)) continue;
    participants.set(key, { entry, session: createInfortuneFinaleSession({ puzzle, freeLetters,
      bank: ledger?.banks.get(key) || 0, rules: { ...rules, victoryPoints: INFORTUNE_FINALE_VICTORY_POINTS } }) });
  }
  let closed = false, disposed = false, revision = 0;
  const handles = new Set();
  const purchases = new Map();
  const privateSnapshot = participant => participant ? { ...participant.session.snapshot(),
    ...(Number.isFinite(participant.gobblarsBalance) ? { gobblarsBalance: participant.gobblarsBalance } : {}) } : null;
  function publicSnapshot() {
    return { roomId, tournamentId, introStartsAt, startsAt, deadlineAt, podiumAt, revision, serverNow: now(), closed,
      ...(closed ? { answer: puzzle.answer, clue: puzzle.clue } : {}),
      ranking: rankInfortuneFinale(ranking, outcomes), remaining: [...participants.values()].filter(p => !outcomes.has(p.entry.nick)).length };
  }
  const publish = () => { revision++; onChange(publicSnapshot()); };
  function finish() {
    if (closed || disposed) return;
    closed = true;
    for (const { entry, session } of participants.values()) {
      if (!outcomes.has(entry.nick)) {
        session.expire(); outcomes.set(entry.nick, session.snapshot().outcome);
      }
    }
    publish(); onFinish(publicSnapshot());
  }
  function schedule(fn, at) {
    const handle = timers.setTimeout(() => { handles.delete(handle); fn(); }, Math.max(0, at - now()));
    handles.add(handle); handle?.unref?.();
  }
  function snapshot(key) {
    if (now() >= deadlineAt) finish();
    const participant = participants.get(key);
    return { ok: true, finale: publicSnapshot(), snapshot: privateSnapshot(participant) };
  }
  async function refreshWallet(key) {
    const participant = participants.get(key);
    if (participant) {
      try { const profile = await wallet.read(participant.entry); if (Number.isFinite(profile?.balance)) participant.gobblarsBalance = profile.balance; } catch { /* A fresh payment always rechecks the wallet. */ }
    }
    return snapshot(key);
  }
  function submitNow(key, action) {
    if (disposed) return { ok: false, error: "unavailable" };
    if (action.type === "snapshot") return wallet ? refreshWallet(key) : snapshot(key);
    if (now() >= deadlineAt) finish();
    const participant = participants.get(key);
    if (!participant) return { ok: false, error: "spectator" };
    if (now() < startsAt) return { ok: false, error: "not_started" };
    const committed = participant.session.snapshot().outcome;
    if (action.type === "answer" && committed && !committed.expired) return snapshot(key);
    if (closed) return { ...snapshot(key), ok: false, error: "expired" };
    if (action.type === "answer" && (typeof action.answer !== "string" || action.answer.length > 40))
      return { ok: false, error: "one_word_required", finale: publicSnapshot(), snapshot: participant.session.snapshot() };
    if (action.type === "buy" && (typeof action.letter !== "string" || !/^[A-Z]$/i.test(action.letter)))
      return { ok: false, error: "invalid_letter", finale: publicSnapshot(), snapshot: participant.session.snapshot() };
    const { session, entry } = participant;
    // Retries after a lost acknowledgement return the first committed result.
    if (session.snapshot().outcome) return snapshot(key);
    if (action.type === "buy" && session.snapshot().purchased.includes(String(action.letter).toUpperCase())) {
      const reply = snapshot(key), letter = String(action.letter).toUpperCase();
      return { ...reply, indices: reply.snapshot.tiles.filter(tile => tile.kind === 'letter' && normalizeFinaleText(tile.character) === letter).map(tile => tile.index) };
    }
    if (action.type === 'buy' && action.currency === 'gobblars') return buyFinaleLetter({ participant, action, wallet, deadlineAt,
      expired: () => disposed || closed || now() >= deadlineAt }).then(result => ({ ...result, finale: publicSnapshot(), snapshot: privateSnapshot(participant) }));
    const result = action.type === "buy" ? session.buyLetter(action.letter)
      : action.type === "answer" ? session.submitAnswer(action.answer) : { ok: false, error: "invalid_action" };
    if (result.ok && action.type === "answer") {
      const outcome = result.snapshot.outcome;
      outcomes.set(entry.nick, outcome);
      if (outcome.correct) onWin(entry, outcome);
      publish();
    }
    return { ...result, finale: publicSnapshot(), snapshot: privateSnapshot(participant) };
  }
  function submit(key, action) {
    const pending = purchases.get(key);
    if (pending) return pending.then(() => submit(key, action), () => submit(key, action));
    const result = submitNow(key, action);
    if (!result?.then) return result;
    const tracked = result.finally(() => { if (purchases.get(key) === tracked) purchases.delete(key); });
    purchases.set(key, tracked); return tracked;
  }
  schedule(publish, startsAt);
  schedule(finish, deadlineAt);
  return { snapshot, publicSnapshot, submit, finish, dispose() {
    disposed = true; for (const handle of handles) timers.clearTimeout(handle); handles.clear();
  } };
}
