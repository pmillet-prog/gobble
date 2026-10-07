import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTournamentCelebrationPresenterLines,
  createTournamentRecords,
  recordTournamentWordAchievement,
} from "./tournamentCelebrationInterventions.js";

for (const specialType of ["target_long", "target_score"]) {
  test(`longest word recap excludes ${specialType} records and tied finders`, () => {
    const records = createTournamentRecords();
    recordTournamentWordAchievement(records, {
      nick: "Indice avant",
      word: "robotisation",
      round: 1,
      specialType,
    });
    recordTournamentWordAchievement(records, {
      nick: "Alice",
      word: "allocution",
      round: 2,
    });
    recordTournamentWordAchievement(records, {
      nick: "Indice après",
      word: "extraordinaire",
      round: 3,
      specialType,
    });
    recordTournamentWordAchievement(records, {
      nick: "Indice ex aequo",
      word: "allocution",
      round: 4,
      specialType,
    });
    recordTournamentWordAchievement(records, {
      nick: "Bob",
      word: "allocution",
      round: 5,
    });

    assert.deepEqual(records.longestHumanWords, {
      len: 10,
      words: [{ word: "ALLOCUTION", round: 2, finders: ["Alice", "Bob"] }],
    });
    const line = buildTournamentCelebrationPresenterLines({ records })
      .find((entry) => entry.botKey === "statistician");
    assert.match(line.text, /ALLOCUTION.*Alice et Bob/);
    assert.doesNotMatch(line.text, /Indice/);
  });

  test(`no longest word recap when players only found words in ${specialType}`, () => {
    const records = createTournamentRecords();
    recordTournamentWordAchievement(records, {
      nick: "Alice",
      word: "robotisation",
      round: 2,
      specialType,
    });

    assert.equal(
      buildTournamentCelebrationPresenterLines({ records })
        .some((entry) => entry.botKey === "statistician"),
      false
    );
  });
}
