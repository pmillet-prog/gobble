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
    players: EMPTY_LIST,
    provisionalRanking: EMPTY_LIST,
  };
}

export function createLiveRosterFeature({ getKernel, scope }) {
  let playersFingerprint = null;
  let provisionalRankingFingerprint = null;
  let playersSource = null;
  let provisionalRankingSource = null;
  return createStateFeature({ scope }, createInitialLiveRosterState, {
    start: ({ store }) => {
      const kernel = getKernel();
      const sync = () => {
        const realtime = kernel.getState().realtime;
        const patch = {};
        if (realtime.players !== playersSource) {
          playersSource = realtime.players;
          const nextFingerprint = buildMetadataFingerprint(realtime.players);
          if (!fingerprintsMatch(nextFingerprint, playersFingerprint)) {
            playersFingerprint = nextFingerprint;
            patch.players = buildMetadataSnapshot(realtime.players);
          }
        }
        if (realtime.provisionalRanking !== provisionalRankingSource) {
          provisionalRankingSource = realtime.provisionalRanking;
          const nextFingerprint = buildMetadataFingerprint(
            realtime.provisionalRanking
          );
          if (
            !fingerprintsMatch(
              nextFingerprint,
              provisionalRankingFingerprint
            )
          ) {
            provisionalRankingFingerprint = nextFingerprint;
            patch.provisionalRanking = buildMetadataSnapshot(
              realtime.provisionalRanking
            );
          }
        }
        if (Object.keys(patch).length > 0) store.patch(patch);
      };
      sync();
      const unsubscribe = kernel.subscribe(sync);
      scope.add(unsubscribe);
      scope.add(() => {
        playersFingerprint = null;
        provisionalRankingFingerprint = null;
        playersSource = null;
        provisionalRankingSource = null;
        store.patch(createInitialLiveRosterState());
      });
    },
  });
}
