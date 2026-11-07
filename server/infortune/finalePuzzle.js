import { readFileSync } from "node:fs";
import { selectInfortuneFinalePuzzle } from "../../shared/infortuneFinaleCatalog.js";
import { RELEASE_SCOPE } from "../../shared/releaseScope.js";

let bank;
export function chooseTournamentFinalePuzzle({ local = false, recentIds = [] } = {}) {
  bank ||= JSON.parse(readFileSync(new URL("../../data/infortune-finale-bank.json", import.meta.url), "utf8"));
  return selectInfortuneFinalePuzzle(bank, { allowDrafts: local || RELEASE_SCOPE.infortuneFinaleDrafts, recentIds });
}
