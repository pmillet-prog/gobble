import assert from "node:assert/strict";
import test from "node:test";

import {
  MASSIVE_BOGGLE_TYPE,
  isRareBonusEnabledForSpecial,
} from "./specialRoundTypes.js";

test("rare bonuses stay disabled for speed and massive rounds", () => {
  assert.equal(isRareBonusEnabledForSpecial({ type: "speed" }), false);
  assert.equal(isRareBonusEnabledForSpecial({ type: MASSIVE_BOGGLE_TYPE }), false);
  assert.equal(isRareBonusEnabledForSpecial({ type: "target_long" }), true);
});
