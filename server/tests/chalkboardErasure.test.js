import test from "node:test";
import assert from "node:assert/strict";
import { createChalkboardService } from "../chalkboard/chalkboardService.js";
import { CHALKBOARD_ERASER } from "../../shared/chalkboardErasure.js";

const author = { userId: 1 }, other = { userId: 2 };
const drawing = { type: "stroke", size: 12, points: [{ x: 10, y: 80 }, { x: 300, y: 80 }] };
const text = { type: "text", text: "BONJOUR", cx: 200, cy: 100, width: 280, fontSize: 60, scale: 1, angle: .2 };
const mask = (targetIds, extra = {}) => ({ id: "mask", type: "erase", size: 40, points: [{ x: 100, y: 80 }], targetIds, ...extra });
function setup() {
  const service = createChalkboardService({ now: () => Date.parse("2026-09-09T12:00:00Z") });
  const mine = service.addIntervention("free", { elements: [drawing, text] }, author).intervention;
  const theirs = service.addIntervention("free", { elements: [drawing] }, other).intervention;
  const snapshot = service.getSnapshot("free", author);
  const publish = elements => service.addIntervention("free", { weekId: snapshot.weekId, elements }, author);
  return { service, mine, theirs, snapshot, publish };
}

test("a round mask persists on the author's existing strokes and texts, retaining their geometry and z-order", () => {
  const { service, mine, theirs, publish, snapshot } = setup();
  const result = publish([mask([mine.id])]);
  assert.equal(result.ok, true);
  assert.equal(result.intervention, null);
  assert.equal(result.revision, snapshot.revision + 1);
  const reloaded = service.getSnapshot("free", author).interventions;
  assert.equal(reloaded.length, 2);
  assert.deepEqual(reloaded[0].elements.slice(0, 2), mine.elements);
  assert.deepEqual(reloaded[0].bounds, mine.bounds);
  assert.equal(reloaded[0].z, mine.z);
  assert.equal(reloaded[0].elements[2].type, "erase");
  assert.equal("targetIds" in reloaded[0].elements[2], false);
  assert.deepEqual(reloaded[1], { ...theirs, canErase: false });
});

test("ownership is session-specific, anonymous, and cannot be forged in a publication", () => {
  const { service, mine, theirs, snapshot, publish } = setup();
  assert.deepEqual(snapshot.interventions.map(entry => entry.canErase), [true, false]);
  assert.deepEqual(service.getSnapshot("free", other).interventions.map(entry => entry.canErase), [false, true]);
  for (const entry of snapshot.interventions) {
    assert.equal("ownerId" in entry, false);
    assert.equal("userId" in entry, false);
  }
  const result = publish([drawing, mask([mine.id, theirs.id], { ownerId: author.userId, canErase: true })]);
  assert.equal(result.error, "erasure_forbidden");
  assert.deepEqual(service.getSnapshot("free", author), snapshot);
  assert.equal(service.addIntervention("free", { weekId: snapshot.weekId, elements: [mask([mine.id])] }, null).error, "erasure_forbidden");
});

test("drawing after an erasure retains chronological masks and updates existing contributions atomically", () => {
  const { mine, publish } = setup();
  const result = publish([drawing, mask([mine.id]), text]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.intervention.elements.map(element => element.type), ["stroke", "erase", "text"]);
  assert.deepEqual(result.interventions[0].elements.map(element => element.type), ["stroke", "text", "erase"]);
});

test("invalid, oversized and non-finite masks cannot partially modify the board", () => {
  const { service, mine, snapshot, publish } = setup();
  for (const invalid of [
    { points: null }, { points: [] }, { points: [{ x: NaN, y: 80 }] },
    { size: 0 }, { size: Infinity }, { size: CHALKBOARD_ERASER.max + 1 },
    { points: Array.from({ length: CHALKBOARD_ERASER.maxPoints + 1 }, () => ({ x: 80, y: 80 })) },
    { targetIds: null },
  ]) {
    assert.equal(publish([mask([mine.id]), mask([mine.id], invalid)]).ok, false);
    assert.deepEqual(service.getSnapshot("free", author), snapshot);
  }
});

test("a draft from the previous week cannot erase or publish into the renewed board", () => {
  const { service, mine, snapshot } = setup();
  const result = service.addIntervention("free", { weekId: "2026-08-31", elements: [drawing, mask([mine.id])] }, author);
  assert.equal(result.error, "stale_week");
  assert.deepEqual(service.getSnapshot("free", author), snapshot);
});

test("moderation deletion and undo preserve masks and the original erasing rights", () => {
  const { service, mine, publish } = setup();
  publish([mask([mine.id])]);
  const before = service.getSnapshot("free", author).interventions[0];
  service.deleteIntervention(mine.id, other);
  const restored = service.undoLastDeletion("free", other);
  assert.equal(restored.intervention.canErase, false);
  assert.deepEqual(service.getSnapshot("free", author).interventions[0], before);
});

test("missing targets are harmless and cumulative erasure storage is bounded", () => {
  const { service, mine, publish } = setup();
  assert.equal(publish([mask(["already-deleted"])]).ok, true);
  for (let index = 0; index < CHALKBOARD_ERASER.maxStrokes; index++) assert.equal(publish([mask([mine.id])]).ok, true);
  const before = service.getSnapshot("free", author);
  assert.equal(publish([mask([mine.id])]).error, "erasure_limit");
  assert.deepEqual(service.getSnapshot("free", author), before);
  const removed = service.addIntervention("free", { weekId: before.weekId, elements: [mask([mine.id])], removeIds: [mine.id] }, author);
  assert.equal(removed.ok, true);
  assert.equal(removed.interventions.some(entry => entry.id === mine.id), false);
});

test("cleaning up dust deletes the entire stored intervention and its masks, only for its author", () => {
  const { service, mine, theirs, snapshot, publish } = setup();
  publish([mask([mine.id])]);
  const before = service.getSnapshot("free", author);
  const rejected = service.addIntervention("free", { weekId: snapshot.weekId, elements: [], removeIds: [mine.id, theirs.id] }, author);
  assert.equal(rejected.error, "erasure_forbidden");
  assert.deepEqual(service.getSnapshot("free", author), before);
  const removed = service.addIntervention("free", { weekId: snapshot.weekId, elements: [], removeIds: [mine.id] }, author);
  assert.equal(removed.ok, true);
  assert.equal(removed.intervention, null);
  assert.deepEqual(removed.interventions, [{ ...theirs, canErase: false }]);
  assert.equal(service.deleteIntervention(mine.id, author).error, "not_found");
  assert.deepEqual(service.getSnapshot("free", author).interventions, removed.interventions);
});
