import { createFeatureStore } from "../../app/core/createFeatureStore.js";

export const TARGET_ROUND_REMINDER_WINDOW_MS = 10_000;
export const TARGET_ROUND_REMINDER_THRESHOLD = 5;
export const TARGET_ROUND_REMINDER_DURATION_MS = 6_000;

export const TARGET_ROUND_REMINDER_LINES = Object.freeze([
  "Minute papillon, la grille n’est pas un buffet à volonté !",
  "Quel débit ! Mais le dictionnaire entier ne rentrera pas dans la case.",
  "Les lettres demandent une pause : on cherche la perle rare !",
  "Doucement, champion, cette manche se joue au singulier !",
  "Le mode mitraillette est impressionnant… mais regarde l’objectif !",
  "On admire la collection, mais un seul mot fera l’affaire !",
  "Petit rappel du GPS : destination UN SEUL MOT !",
  "Le clavier chauffe ! On respire et on vise juste.",
  "La pêche est bonne, mais on cherche le gros poisson !",
  "Sacré démarrage ! Garde un peu d’énergie pour le bon mot.",
]);

const OBJECTIVES = Object.freeze({
  target_long: { action: "trouver", detail: "le mot le plus long de la grille." },
  target_score: { action: "trouver", detail: "le mot qui rapporte le plus de points." },
  ocid: { action: "proposer", detail: "pour piéger les autres joueurs en OCID." },
});

function getRoundKey(session) {
  if (session?.roundId == null) return null;
  return JSON.stringify([session.origin, session.roomId, session.roundId]);
}

function canSubmit(session) {
  // The session may retain its intro status after the board unlocks. The
  // server startsAt timestamp below excludes the actual presentation time.
  return (session?.phase === "intro" || session?.phase === "playing") &&
    session.origin !== "daily" && session.roundStatus !== "ocid_vote";
}

export function createTargetRoundReminderFeature(
  { getKernel, scope },
  { random = Math.random, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}
) {
  const store = createFeatureStore({ reminder: null });
  let gameplay = null;
  let roundKey = null;
  let count = 0;
  let shown = false;
  let timer = null;

  function dismiss() {
    if (timer != null) clearTimeoutFn(timer);
    timer = null;
    store.set("reminder", null);
  }

  function syncSession() {
    const session = gameplay?.store.getState();
    const nextKey = getRoundKey(session);
    if (nextKey && nextKey !== roundKey) {
      dismiss();
      roundKey = nextKey;
      count = 0;
      shown = false;
    }
    if (!nextKey || !canSubmit(session)) dismiss();
    return session;
  }

  function registerSubmission({ roundType, nowMs } = {}) {
    const objective = OBJECTIVES[roundType];
    if (!objective) return false;
    const session = syncSession();
    if (!getRoundKey(session) || !canSubmit(session) || shown) return false;
    if (!Number.isFinite(session.startsAt) || !Number.isFinite(nowMs)) return false;
    const elapsed = nowMs - session.startsAt;
    if (elapsed < 0 || elapsed > TARGET_ROUND_REMINDER_WINDOW_MS) return false;
    count += 1;
    if (count < TARGET_ROUND_REMINDER_THRESHOLD) return false;
    shown = true;
    const index = Math.min(TARGET_ROUND_REMINDER_LINES.length - 1,
      Math.max(0, Math.floor(random() * TARGET_ROUND_REMINDER_LINES.length)));
    store.set("reminder", { ...objective, line: TARGET_ROUND_REMINDER_LINES[index] });
    timer = setTimeoutFn(dismiss, TARGET_ROUND_REMINDER_DURATION_MS);
    return true;
  }

  function start() {
    const lease = getKernel().features.acquire("gameplaySession");
    gameplay = lease.feature;
    scope.add(lease.release);
    scope.add(gameplay.store.subscribe(syncSession));
    scope.add(() => {
      dismiss();
      gameplay = null;
    });
    syncSession();
  }

  return Object.freeze({ dismiss, registerSubmission, start, store });
}
