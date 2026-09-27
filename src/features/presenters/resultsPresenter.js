import { PIVOT_INTERVENTION_CONFIG } from "../../components/pivot/pivotAnimation.js";
import { BAFOUILLE_INTERVENTION_CONFIG } from "../../components/bafouille/bafouilleAnimation.js";

const PIVOT = Object.freeze({ key: "pivot", name: "Bernard Pinot", config: PIVOT_INTERVENTION_CONFIG,
  buttonScale: 1.4, buttonOffsetY: "15%" });
const BAFOUILLE = Object.freeze({ ...PIVOT, name: "Laurent Bafouille", config: BAFOUILLE_INTERVENTION_CONFIG });

// One physical slot and one request channel, with the identity chosen by the
// server's current intervention. A new identity remounts its animation owner.
export function getResultsPresenter(entry) {
  return entry?.presenterKey === "bafouille" ? BAFOUILLE : PIVOT;
}
