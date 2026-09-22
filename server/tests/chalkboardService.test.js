import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { CHALKBOARD_LIMITS } from "../../shared/chalkboardLimits.js";

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

test("large chalk drawings are saved completely, including an empty legacy cleanup list", () => {
  const service = createChalkboardService();
  const raw = makeIntervention();
  const points = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: i * 3, p: .5 }));
  raw.elements = Array.from({ length: 240 }, (_, i) => ({ ...raw.elements[0], id: `stroke-${i}`, points }));
  raw.removeIds = [];
  const result = service.addIntervention("free", raw, { userId: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.intervention.elements.length, 240);
  assert.equal(result.intervention.elements.reduce((sum, item) => sum + item.points.length, 0), 12000);
  assert.ok(Buffer.byteLength(JSON.stringify(raw)) < 1024 * 1024);
});

test("over-budget drawings are rejected atomically instead of truncated or reported as sponge errors", () => {
  const service = createChalkboardService();
  const raw = makeIntervention();
  const cases = [
    Array.from({ length: CHALKBOARD_LIMITS.maxElements + 1 }, () => raw.elements[0]),
    [{ ...raw.elements[0], points: Array.from({ length: CHALKBOARD_LIMITS.maxStrokePoints + 1 }, () => ({ x: 10, y: 10 })) }],
    Array.from({ length: 20 }, () => ({ ...raw.elements[0], points: Array.from({ length: 1000 }, () => ({ x: 10, y: 10 })) })),
  ];
  for (const elements of cases) {
    const before = service.getSnapshot("free");
    assert.equal(service.addIntervention("free", { elements, removeIds: [] }, { userId: 1 }).error, "drawing_limit");
    assert.deepEqual(service.getSnapshot("free"), before);
  }
});

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
  assert.equal("feedbackKind" in result.intervention, false);
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

test("undo restores the original identity seal, timestamp, geometry and stacking order exactly once", () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const service = createChalkboardService({ now: () => Date.parse("2026-09-09T12:00:00Z"), auditPublicKey: publicKey });
  const first = service.addIntervention("free", makeIntervention(), { userId: 1 }).intervention;
  const second = service.addIntervention("free", makeIntervention(), { userId: 2 }).intervention;
  const auditBefore = service.exportSealedAudit();
  const admin = { userId: 17 };
  service.deleteIntervention(first.id, admin);
  const third = service.addIntervention("free", makeIntervention(), { userId: 3 }).intervention;
  const restored = service.undoLastDeletion("free", admin);
  assert.deepEqual(restored.intervention, { ...first, canErase: false });
  assert.deepEqual(service.getSnapshot("free").interventions, [first, second, third].map(entry => ({ ...entry, canErase: false })));
  assert.deepEqual(service.exportSealedAudit().entries.slice(0, 2), auditBefore.entries);
  assert.equal(service.canUndoDeletion("free", admin), false);
  assert.equal(service.undoLastDeletion("free", admin).error, "undo_not_available");
});

test("undo belongs to the deleting moderator and remembers only the latest successful deletion", () => {
  const service = createChalkboardService({ now: () => Date.parse("2026-09-09T12:00:00Z") });
  const admin = { userId: 17 }, other = { userId: 18 };
  const first = service.addIntervention("free", makeIntervention(), { userId: 1 }).intervention;
  const second = service.addIntervention("free", makeIntervention(), { userId: 2 }).intervention;
  service.deleteIntervention(first.id, admin);
  service.deleteIntervention(second.id, admin);
  assert.equal(service.undoLastDeletion("missing-board", admin).error, "invalid_board");
  assert.equal(service.undoLastDeletion("free", other).error, "undo_not_available");
  assert.equal(service.undoLastDeletion("free", null).error, "undo_not_available");
  assert.equal(service.deleteIntervention("missing", admin).error, "not_found");
  assert.deepEqual(service.undoLastDeletion("free", admin).intervention, { ...second, canErase: false });
  assert.deepEqual(service.getSnapshot("free").interventions, [{ ...second, canErase: false }]);
});

test("weekly clearing also expires deletion undo", () => {
  let now = Date.parse("2026-09-13T20:00:00Z");
  const service = createChalkboardService({ now: () => now });
  const admin = { userId: 17 };
  const item = service.addIntervention("free", makeIntervention(), { userId: 1 }).intervention;
  service.deleteIntervention(item.id, admin);
  now = Date.parse("2026-09-14T08:00:00Z");
  assert.equal(service.canUndoDeletion("free", admin), false);
  assert.equal(service.undoLastDeletion("free", admin).error, "undo_not_available");
  assert.deepEqual(service.getSnapshot("free").interventions, []);
});

test("text is stored in uppercase and only the bundled font choices are accepted", () => {
  const service = createChalkboardService();
  const text = { type: "text", text: "  idée à tester éèç œ  ", cx: 200, cy: 200, width: 500, fontSize: 68, scale: 1, angle: 0 };
  for (const font of ["chalk", "white-chalk", "external-font"]) {
    const result = service.addIntervention("feedback", { elements: [{ ...text, font }] }, { userId: 17 });
    assert.equal(result.intervention.elements[0].text, "IDEE A TESTER EEC OE");
    assert.equal(result.intervention.elements[0].font, font === "external-font" ? "chalk" : font);
  }
});

test("the former board addresses publish to the same board without message categories", () => {
  const service = createChalkboardService();
  const first = service.addIntervention("feedback", makeIntervention(), { userId: 1 }).intervention;
  const second = service.addIntervention("free", makeIntervention(), { userId: 2 }).intervention;
  assert.equal(first.board, "free");
  assert.deepEqual(service.getSnapshot("feedback"), service.getSnapshot("free"));
  assert.deepEqual(service.getSnapshot("free").interventions, [first, second].map(entry => ({ ...entry, canErase: false })));
  assert.equal("feedbackKind" in first, false);
  const moderator = { userId: 17 };
  service.deleteIntervention(first.id, moderator);
  assert.equal(service.canUndoDeletion("feedback", moderator), true);
  assert.deepEqual(service.undoLastDeletion("free", moderator).intervention, { ...first, canErase: false });
});

test("the chosen typeface and color survive publication, fresh snapshots, deletion and undo", () => {
  const service = createChalkboardService();
  const moderator = { userId: 17 };
  for (const font of ["chalk", "white-chalk"]) {
    const published = service.addIntervention("free", { elements: [
      { type: "text", id: font, text: "UN MOT SUR LE TABLEAU", font, color: "#81D4FA", cx: 600, cy: 400, width: 800, fontSize: 68, scale: 1, angle: 0 },
    ] }, moderator).intervention;
    assert.equal(published.elements[0].font, font);
    assert.equal(published.elements[0].color, "#81d4fa");
    const received = JSON.parse(JSON.stringify(service.getSnapshot("free"))).interventions.at(-1).elements[0];
    assert.equal(received.font, font);
    assert.equal(received.color, "#81d4fa");
    service.deleteIntervention(published.id, moderator);
    const restored = service.undoLastDeletion("free", moderator).intervention.elements[0];
    assert.equal(restored.font, font);
    assert.equal(restored.color, "#81d4fa");
  }
});

test("legacy text and invalid colors retain the original white chalk", () => {
  const service = createChalkboardService();
  for (const color of [undefined, "red", "#123", "url(https://invalid)", {}]) {
    const result = service.addIntervention("free", { elements: [{ type: "text", text: "BONJOUR", color }] }, { userId: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.intervention.elements[0].color, "#f5f2e8");
  }
});
