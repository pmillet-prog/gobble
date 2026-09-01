import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_FAKE_TWINS_MODE,
  DAILY_MONSTROUS_MODE,
  DAILY_SPECIAL_MODE,
} from "../../components/daily/dailyModes.js";
import {
  DAILY_PLAYABLE_MODES,
  filterDailyEntriesForMode,
  getDailyModeDefinition,
  getDailyModeResult,
  getDailyModeStatusPatch,
  normalizeDailyMode,
} from "./dailyModePolicy.js";

test("daily mode policy exposes the three distinct gameplay contracts", () => {
  assert.deepEqual(DAILY_PLAYABLE_MODES, [
    DAILY_MONSTROUS_MODE,
    DAILY_SPECIAL_MODE,
    DAILY_FAKE_TWINS_MODE,
  ]);
  assert.equal(getDailyModeDefinition(DAILY_MONSTROUS_MODE).playedField, "hasPlayedMonstrous");
  assert.equal(getDailyModeDefinition(DAILY_SPECIAL_MODE).resultField, "mySpecialResult");
  assert.equal(
    getDailyModeDefinition(DAILY_FAKE_TWINS_MODE).alreadyPlayedLabel,
    "Faux jumeaux déjà joué"
  );
  assert.equal(normalizeDailyMode("unknown"), DAILY_MONSTROUS_MODE);
});

test("daily mode policy resolves results without crossing modes", () => {
  const specialResult = { mode: DAILY_SPECIAL_MODE, score: 12 };
  assert.strictEqual(
    getDailyModeResult(DAILY_SPECIAL_MODE, { dailyResult: specialResult }),
    specialResult
  );
  assert.equal(
    getDailyModeResult(DAILY_MONSTROUS_MODE, { dailyResult: specialResult }),
    null
  );
  const statusResult = { score: 45 };
  assert.strictEqual(
    getDailyModeResult(DAILY_FAKE_TWINS_MODE, {
      dailyStatus: { myFakeTwinsResult: statusResult },
    }),
    statusResult
  );
});

test("daily mode policy patches only the active mode and filters its ranking", () => {
  assert.deepEqual(
    getDailyModeStatusPatch(
      DAILY_SPECIAL_MODE,
      { score: 18 },
      { hasPlayed: false }
    ),
    {
      hasPlayed: false,
      hasPlayedSpecial: true,
      myResult: { score: 18 },
      mySpecialResult: { score: 18 },
    }
  );
  assert.deepEqual(
    filterDailyEntriesForMode(
      [
        { mode: DAILY_SPECIAL_MODE, nick: "A" },
        { mode: DAILY_MONSTROUS_MODE, nick: "B" },
        { isPalier: true, nick: "Palier" },
      ],
      DAILY_SPECIAL_MODE,
      { keepThresholds: true }
    ).map((entry) => entry.nick),
    ["A", "Palier"]
  );
});
