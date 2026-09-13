import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPersistentChalkboard } from "../chalkboard/chalkboardRuntime.js";
import { openChalkboardRepository } from "../chalkboard/chalkboardRepository.js";

const author = { userId: 8 }, moderator = { userId: 9 };
const draft = { elements: [{ type: "stroke", size: 12, color: "#ffffff", points: [{ x: 20, y: 20 }, { x: 300, y: 40 }] }] };
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gobble-chalkboard-"));
  const opened = new Set();
  let time = Date.parse("2026-09-12T12:00:00Z");
  t.after(async () => {
    for (const service of opened) await service.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-chalkboard-"));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory, now: () => time, advance: value => { time = Date.parse(value); },
    async open(options = {}) { const service = await createPersistentChalkboard({ dataDir: directory, now: () => time, ...options }); opened.add(service); return service; },
    async close(service) { opened.delete(service); await service.close(); },
  };
}

test("reopening the persisted board restores geometry, author rights, masks and moderation undo", async t => {
  const f = await fixture(t);
  let service = await f.open();
  const item = (await service.addIntervention("free", draft, author)).intervention;
  const before = await service.getSnapshot("free", author);
  await service.addIntervention("free", { weekId: before.weekId, elements: [{ type: "erase", size: 40, points: [{ x: 50, y: 25 }], targetIds: [item.id] }] }, author);
  const masked = await service.getSnapshot("free", author);
  await service.deleteIntervention(item.id, moderator);
  await f.close(service);
  service = await f.open();
  assert.equal((await service.getSnapshot("free", author)).interventions.length, 0);
  assert.equal(await service.canUndoDeletion("free", moderator), true);
  await service.undoLastDeletion("free", moderator);
  assert.deepEqual((await service.getSnapshot("free", author)).interventions, masked.interventions);
  assert.equal((await service.getSnapshot("free", moderator)).interventions[0].canErase, false);
  await f.close(service);
  service = await f.open();
  assert.deepEqual((await service.getSnapshot("free", author)).interventions, masked.interventions);
});

test("crossing Monday offline archives the old board atomically, resets once and preserves the outbox on restart", async t => {
  const f = await fixture(t);
  let service = await f.open();
  await service.addIntervention("free", draft, author);
  const old = await service.getSnapshot("free", author);
  await f.close(service);
  f.advance("2026-09-14T00:01:00+02:00");
  service = await f.open();
  const fresh = await service.getSnapshot("free", author);
  assert.equal(fresh.weekId, "2026-09-14");
  assert.equal(fresh.revision, old.revision + 1);
  assert.equal(fresh.interventions.length, 0);
  const archived = await service.repository.nextExport(f.now());
  assert.equal(archived.id, "weekly-2026-09-07");
  const snapshot = JSON.parse(archived.snapshot);
  assert.equal(snapshot.interventions[0].id, old.interventions[0].id);
  assert.equal("ownerId" in snapshot.interventions[0], false);
  assert.equal("authorSeal" in snapshot.interventions[0], false);
  await f.close(service);
  service = await f.open();
  assert.equal((await service.getSnapshot("free")).revision, fresh.revision);
  assert.equal((await service.repository.nextExport(f.now())).id, archived.id);
});

test("simultaneous publications are serialized and none disappear after reopening", async t => {
  const f = await fixture(t);
  let service = await f.open();
  const results = await Promise.all(Array.from({ length: 20 }, () => service.addIntervention("free", draft, author)));
  await f.close(service);
  service = await f.open();
  assert.deepEqual((await service.getSnapshot("free", author)).interventions.map(entry => entry.id), results.map(result => result.intervention.id));
});

test("failed durable writes roll back in-memory edits instead of acknowledging lost data", async t => {
  const f = await fixture(t);
  const repository = await openChalkboardRepository(path.join(f.directory, "chalkboard.sqlite"));
  let fail = false;
  const service = await f.open({ repository: { ...repository, save: (...args) => { if (fail) throw new Error("disk_full"); return repository.save(...args); } } });
  const item = (await service.addIntervention("free", draft, author)).intervention;
  const before = await service.getSnapshot("free", author);
  fail = true;
  await assert.rejects(service.addIntervention("free", { weekId: before.weekId, elements: [{ type: "erase", size: 40, points: [{ x: 30, y: 25 }], targetIds: [item.id] }] }, author), /disk_full/);
  assert.deepEqual(await service.getSnapshot("free", author), before);
  fail = false;
  await f.close(service);
  const reopened = await f.open();
  assert.deepEqual(await reopened.getSnapshot("free", author), before);
});

test("manual copies retain the exact requested revision and survive a later erasure", async t => {
  const f = await fixture(t);
  const service = await f.open();
  const item = (await service.addIntervention("free", draft, author)).intervention;
  const job = await service.queueExport(moderator);
  await service.deleteIntervention(item.id, moderator);
  const pending = await service.repository.nextExport(f.now());
  assert.equal(pending.id, job.id);
  assert.equal(JSON.parse(pending.snapshot).interventions[0].id, item.id);
  assert.equal((await service.getSnapshot("free")).interventions.length, 0);
});
