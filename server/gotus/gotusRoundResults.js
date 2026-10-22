import { normalizeGotusSummary } from "../../shared/gotusRules.js";

export function recordGotusResult(context, snapshot) {
  const round = context.room?.currentRound;
  if (context.devPreview || round?.training || String(round?.id) !== String(context.publicRoundId)) return;
  round.gotusResults ??= new Map();
  round.gotusResults.set(context.playerKey, normalizeGotusSummary(snapshot.summary || snapshot));
}

export function getGotusResult(round, player) {
  const userId = Number(player?.userId);
  const key = Number.isSafeInteger(userId) && userId > 0 ? `user:${userId}` : `install:${player?.installId}`;
  return round?.gotusResults?.get(key) || null;
}

export function getTargetMiniGameMetadata(round) {
  if (round?.training || !["target_long", "target_score"].includes(round?.special?.type)) return null;
  return round?.targetMiniGame || { kind: "quiz" };
}
