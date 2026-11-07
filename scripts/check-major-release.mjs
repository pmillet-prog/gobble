import assert from "node:assert/strict";
import { RELEASE_SCOPE, infortuneTournamentEnabled } from "../shared/releaseScope.js";
import { chooseTournamentFinalePuzzle } from "../server/infortune/finalePuzzle.js";

assert.equal(RELEASE_SCOPE.avatarRenderAssets, true, "Les portraits optimises doivent etre actives pour cette majeure.");
assert.equal(infortuneTournamentEnabled({ NODE_ENV: "production", GOBBLE_INFORTUNE_ENABLED: "1" }), true,
  "La roue du mini-tournoi doit etre disponible en production.");
assert.ok(chooseTournamentFinalePuzzle(), "Aucune enigme de finale n'est publiable en production.");
console.log("Majeure prete : roue, finale avec catalogue disponible et avatars optimises.");
