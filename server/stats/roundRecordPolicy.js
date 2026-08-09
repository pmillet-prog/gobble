import { FINALE_TYPE } from "../../shared/finaleRules.js";

export function isScoreRecordEligibleRound(round) {
  return String(round?.special?.type || round?.type || "normal") !== FINALE_TYPE;
}
