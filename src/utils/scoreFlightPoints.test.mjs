import test from "node:test";
import assert from "node:assert/strict";

import { resolveScoreFlightPoints } from "./scoreFlightPoints.js";

test("speed score flights use the fixed awarded score instead of tile values", () => {
  assert.equal(
    resolveScoreFlightPoints({
      awardedPoints: 11,
      candidatePoints: 27,
      specialRound: { type: "speed", fixedWordScore: 11 },
    }),
    11
  );
});

test("other rounds retain the traced candidate score", () => {
  assert.equal(
    resolveScoreFlightPoints({
      awardedPoints: 18,
      candidatePoints: 14,
      specialRound: { type: "classic" },
    }),
    14
  );
});
