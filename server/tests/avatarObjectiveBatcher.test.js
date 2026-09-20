import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarObjectiveBatcher } from "../avatars/avatarObjectiveBatcher.js";

function timers() {
  const jobs = new Map(); let id = 0;
  return { jobs, setTimer: (callback, delay) => { jobs.set(++id, { callback, delay }); return id; }, clearTimer: key => jobs.delete(key) };
}
const event = id => ({ userId: 1, objective: "lepers_correct_answers", eventKey: String(id), occurredAt: Date.now() });

test("many simultaneous answers are deduplicated and persisted in bounded serial batches", async () => {
  const clock = timers(), batches = [], sent = []; let resolve;
  const batcher = createAvatarObjectiveBatcher({ ...clock, persist: batch => { batches.push(batch); return new Promise(done => { resolve = done; }); }, onRewards: rewards => sent.push(...rewards) });
  for (let i = 0; i < 200; i++) { batcher.record(event(i)); batcher.record(event(i)); }
  assert.equal(clock.jobs.size, 1);
  const first = batcher.flush(); await Promise.resolve();
  assert.equal(batches[0].length, 128);
  batcher.record(event(200));
  assert.equal(batcher.flush(), first);
  assert.equal(clock.jobs.size, 0, "no timer while a batch is in flight");
  resolve({ rewards: [{ userId: 1, reward: { key: "accessories:participant_tag" } }] }); await first;
  assert.equal(sent.length, 1);
  assert.equal(clock.jobs.size, 1);
  const second = batcher.flush(); await Promise.resolve();
  assert.equal(batches[1].length, 73);
  resolve({ rewards: [] }); await second;
  assert.equal(clock.jobs.size, 0, "no polling once the queue is empty");
  batcher.stop();
});

test("failed writes keep their event identifiers and retry with backoff", async () => {
  const clock = timers(), batches = []; let fail = true;
  const batcher = createAvatarObjectiveBatcher({ ...clock, onError() {}, onRewards() {}, persist: async batch => { batches.push(batch); if (fail) throw Error("busy"); return { rewards: [] }; } });
  batcher.record(event("question")); await batcher.flush();
  assert.equal([...clock.jobs.values()][0].delay, 1000);
  fail = false; await batcher.flush();
  assert.deepEqual(batches[1], batches[0]);
  assert.equal(clock.jobs.size, 0);
  batcher.stop(); batcher.record(event("ignored"));
  assert.equal(clock.jobs.size, 0);
});
