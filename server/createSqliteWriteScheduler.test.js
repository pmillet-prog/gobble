import test from "node:test";
import assert from "node:assert/strict";
import { createSqliteWriteScheduler } from "./createSqliteWriteScheduler.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("a vault action passes queued round jobs only after the active transaction finishes", async () => {
  const schedule = createSqliteWriteScheduler(), started = deferred(), release = deferred(), events = [];
  const active = schedule(async () => { events.push("begin"); started.resolve(); await release.promise; events.push("commit"); });
  await started.promise;
  const rounds = Array.from({ length: 20 }, (_, index) => schedule(() => events.push(`round-${index}`)));
  const vault = schedule(() => events.push("vault"), { priority: "interactive" });
  await Promise.resolve();
  assert.deepEqual(events, ["begin"]);
  release.resolve();
  await Promise.all([active, ...rounds, vault]);
  assert.deepEqual(events, ["begin", "commit", "vault", ...rounds.map((_, index) => `round-${index}`)]);
});

test("a burst of interactive requests preserves FIFO in each lane and cannot starve round writes", async () => {
  const schedule = createSqliteWriteScheduler(), events = [];
  const normal = Array.from({ length: 3 }, (_, index) => schedule(() => events.push(`round-${index}`)));
  const urgent = Array.from({ length: 10 }, (_, index) => schedule(() => events.push(`vault-${index}`), { priority: "interactive" }));
  await Promise.all([...normal, ...urgent]);
  assert.deepEqual(events, ["vault-0", "vault-1", "vault-2", "vault-3", "round-0",
    "vault-4", "vault-5", "vault-6", "vault-7", "round-1", "vault-8", "vault-9", "round-2"]);
});

test("failed jobs reject their callers without blocking later writes", async () => {
  const schedule = createSqliteWriteScheduler();
  const failed = schedule(() => { throw new Error("write failed"); });
  const next = schedule(() => 42);
  await assert.rejects(failed, /write failed/);
  assert.equal(await next, 42);
  assert.equal(await schedule(() => 43), 43);
});
