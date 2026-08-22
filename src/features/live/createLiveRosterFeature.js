import { createStateFeature } from "../../app/core/createStateFeature.js";

const EMPTY_LIST = Object.freeze([]);

const ROSTER_FIELDS = Object.freeze([
  "afk",
  "crowned",
  "inTraining",
  "installId",
  "isBot",
  "isDailyChampion",
  "isWeeklyChampion",
  "isWeeklyVocabChampion",
  "nick",
  "playerKey",
  "readyForTournament",
  "team",
  "trainingMode",
  "userId",
  "weeklyVocabPodiumRank",
]);

function normalizeRosterEntry(entry) {
  const normalized = {};
  for (const field of ROSTER_FIELDS) {
    normalized[field] = entry?.[field] ?? null;
  }
  return Object.freeze(normalized);
}

function buildMetadataSnapshot(list) {
  if (!Array.isArray(list) || list.length === 0) return EMPTY_LIST;
  return Object.freeze(list.map(normalizeRosterEntry));
}

function buildMetadataFingerprint(list) {
  const fingerprint = new Map();
  if (!Array.isArray(list)) return fingerprint;
  for (const entry of list) {
    const signature = ROSTER_FIELDS.map((field) => String(entry?.[field] ?? "")).join(":");
    fingerprint.set(signature, (fingerprint.get(signature) || 0) + 1);
  }
  return fingerprint;
}

function fingerprintsMatch(left, right) {
  if (left === right) return true;
  if (!left || !right || left.size !== right.size) return false;
  for (const [signature, count] of left) {
    if (right.get(signature) !== count) return false;
  }
  return true;
}

export function createInitialLiveRosterState() {
  return {
    livePlayers: EMPTY_LIST,
    liveProvisionalRanking: EMPTY_LIST,
    players: EMPTY_LIST,
    provisionalRanking: EMPTY_LIST,
  };
}

export function createLiveRosterFeature({ scope }) {
  let playersFingerprint = null;
  let provisionalRankingFingerprint = null;
  let stopped = false;
  let feature = null;

  function setPlayers(nextOrUpdater) {
    if (stopped) return;
    const current = feature.store.getState().livePlayers;
    const resolved =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater;
    const livePlayers = Array.isArray(resolved) ? resolved : EMPTY_LIST;
    if (livePlayers === current) return;
    const patch = { livePlayers };
    const nextFingerprint = buildMetadataFingerprint(livePlayers);
    if (!fingerprintsMatch(nextFingerprint, playersFingerprint)) {
      playersFingerprint = nextFingerprint;
      patch.players = buildMetadataSnapshot(livePlayers);
    }
    feature.patch(patch);
  }

  function setProvisionalRanking(nextOrUpdater) {
    if (stopped) return;
    const current = feature.store.getState().liveProvisionalRanking;
    const resolved =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater;
    const liveProvisionalRanking = Array.isArray(resolved)
      ? resolved
      : EMPTY_LIST;
    if (liveProvisionalRanking === current) return;
    const patch = { liveProvisionalRanking };
    const nextFingerprint = buildMetadataFingerprint(liveProvisionalRanking);
    if (!fingerprintsMatch(nextFingerprint, provisionalRankingFingerprint)) {
      provisionalRankingFingerprint = nextFingerprint;
      patch.provisionalRanking = buildMetadataSnapshot(liveProvisionalRanking);
    }
    feature.patch(patch);
  }

  feature = createStateFeature({ scope }, createInitialLiveRosterState, {
    start: () => {
      stopped = false;
      scope.add(() => {
        stopped = true;
        playersFingerprint = null;
        provisionalRankingFingerprint = null;
        feature.patch(createInitialLiveRosterState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    setPlayers,
    setProvisionalRanking,
  });
}
