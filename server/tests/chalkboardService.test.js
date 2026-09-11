import test from "node:test";
import assert from "node:assert/strict";

import {
  createChalkboardService,
  getChalkboardWeekId,
} from "../chalkboard/chalkboardService.js";

function makeIntervention() {
  return {
    feedbackKind: "bug",
    elements: [
      {
        type: "stroke",
        id: "local-stroke",
        seed: 42,
        color: "#f7d154",
        size: 9,
        points: [
          { x: 12, y: 24, p: 0.4 },
          { x: 38, y: 45, p: 0.7 },
        ],
      },
    ],
  };
}

test("chalkboard week starts on Monday in Paris", () => {
  assert.equal(getChalkboardWeekId(Date.parse("2026-09-06T20:00:00Z")), "2026-08-31");
  assert.equal(getChalkboardWeekId(Date.parse("2026-09-07T08:00:00Z")), "2026-09-07");
});

test("published interventions stay anonymous in public snapshots", () => {
  let now = Date.parse("2026-09-09T12:00:00Z");
  const service = createChalkboardService({ now: () => now });
  const result = service.addIntervention("feedback", makeIntervention(), {
    userId: 123,
    user: { usernameDisplay: "Alice" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.intervention.feedbackKind, "bug");
  assert.equal("authorSeal" in result.intervention, false);
  assert.equal("userId" in result.intervention, false);

  const snapshot = service.getSnapshot("feedback");
  assert.equal(snapshot.interventions.length, 1);
  assert.equal("authorSeal" in snapshot.interventions[0], false);
  assert.equal("user" in snapshot.interventions[0], false);

  now = Date.parse("2026-09-14T08:00:00Z");
  assert.equal(service.getSnapshot("feedback").interventions.length, 0);
});

test("moderation deletion removes only the selected intervention", () => {
  const service = createChalkboardService({ now: () => Date.parse("2026-09-09T12:00:00Z") });
  const first = service.addIntervention("free", makeIntervention(), { userId: 1 });
  service.addIntervention("free", makeIntervention(), { userId: 2 });
  assert.equal(service.deleteIntervention(first.intervention.id).ok, true);
  assert.equal(service.getSnapshot("free").interventions.length, 1);
});
