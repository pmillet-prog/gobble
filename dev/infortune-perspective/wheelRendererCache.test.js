import test from "node:test";
import assert from "node:assert/strict";
import { createWheelRendererCache } from "./wheelRendererCache.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const renderers = [], events = [], timers = new Map(); let timerId = 0;
  const cache = createWheelRendererCache({
    createRenderer() {
      const renderer = { id: renderers.length, lost: false,
        getContext() { return { isContextLost: () => renderer.lost }; },
        dispose() { events.push(`renderer:${renderer.id}:dispose`); },
        forceContextLoss() { events.push(`renderer:${renderer.id}:lose`); },
      };
      renderers.push(renderer); return renderer;
    },
    schedule(task, ms) { assert.equal(ms, 300_000); timers.set(++timerId, task); return timerId; },
    cancel(id) { timers.delete(id); },
  });
  function scene(name, cleanup) {
    return { suspend() { events.push(`${name}:suspend`); }, async dispose() {
      events.push(`${name}:dispose`); await cleanup?.promise;
    } };
  }
  async function prepared(name, options) {
    const lease = await cache.acquire(options); lease.bind(scene(name)); await lease.ready(); return lease;
  }
  return { cache, renderers, events, timers, scene, prepared };
}

test("the previous scene holds programs through the next scene's complete warmup", async () => {
  const app = fixture(), first = await app.prepared("first");
  await first.release();
  assert.deepEqual(app.events, ["first:suspend"]);
  const next = await app.cache.acquire();
  assert.equal(next.reused, true); assert.equal(next.renderer, first.renderer);
  assert.equal(app.timers.size, 0);
  next.bind(app.scene("different-roster"));
  assert.deepEqual(app.events, ["first:suspend"], "No old program is released before all new passes are ready");
  await next.ready();
  assert.deepEqual(app.events, ["first:suspend", "first:dispose"]);
  await next.release(); await app.cache.clear();
  assert.equal(app.events.filter(value => value === "renderer:0:dispose").length, 1);
});

test("a cancelled warmup settles before its renderer is destroyed or a replacement is allocated", async () => {
  const app = fixture(), first = await app.prepared("first"); await first.release();
  const warmup = deferred(), next = await app.cache.acquire();
  next.bind(app.scene("cancelled", warmup));
  const releasing = next.release(), acquiring = app.cache.acquire();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(app.renderers.length, 1);
  assert.ok(!app.events.includes("renderer:0:dispose"));
  warmup.resolve(); await releasing;
  const replacement = await acquiring;
  assert.equal(replacement.reused, false); assert.equal(app.renderers.length, 2);
  assert.ok(app.events.indexOf("cancelled:dispose") < app.events.indexOf("renderer:0:dispose"));
  assert.equal(app.events.filter(value => value === "first:dispose").length, 1);
  await replacement.release();
});

test("fresh diagnostic contexts never consume or evict the idle session renderer", async () => {
  const app = fixture(), cached = await app.prepared("cached"); await cached.release();
  const diagnostic = await app.prepared("diagnostic", { retain: false });
  assert.notEqual(diagnostic.renderer, cached.renderer); assert.equal(diagnostic.reused, false);
  await diagnostic.release();
  assert.ok(app.events.includes("renderer:1:dispose"));
  assert.ok(!app.events.includes("cached:dispose"));
  const next = await app.cache.acquire(); assert.equal(next.renderer, cached.renderer);
  await next.release();
});

test("concurrent active wheels get separate renderers and only the latest released one stays idle", async () => {
  const app = fixture(), first = await app.prepared("first"), second = await app.prepared("second");
  assert.notEqual(first.renderer, second.renderer);
  await first.release(); await second.release();
  assert.ok(app.events.includes("first:dispose")); assert.ok(app.events.includes("renderer:0:dispose"));
  assert.ok(!app.events.includes("second:dispose")); assert.equal(app.timers.size, 1);
  const reused = await app.cache.acquire(); assert.equal(reused.renderer, second.renderer);
  await reused.release();
});

test("idle expiry disposes the suspended scene and loses its context", async () => {
  const app = fixture(), first = await app.prepared("first"); await first.release();
  const [expire] = app.timers.values(); expire();
  const next = await app.cache.acquire();
  assert.equal(next.reused, false);
  assert.deepEqual(app.events, ["first:suspend", "first:dispose", "renderer:0:dispose", "renderer:0:lose"]);
  await next.release();
});

test("clear leaves active play alone and prevents that lease from returning to the cache", async () => {
  const app = fixture(), first = await app.prepared("active");
  await app.cache.clear(); assert.deepEqual(app.events, []);
  await first.release(); assert.ok(app.events.includes("renderer:0:dispose"));
  assert.equal(app.timers.size, 0);
});

test("a context lost while idle is retired before a new renderer is created", async () => {
  const app = fixture(), first = await app.prepared("first"); await first.release(); first.renderer.lost = true;
  const next = await app.cache.acquire();
  assert.equal(next.reused, false); assert.notEqual(next.renderer, first.renderer);
  assert.ok(app.events.includes("renderer:0:dispose")); await next.release();
});

test("discard and repeated cleanup never leave a failed scene cached or dispose twice", async () => {
  const app = fixture(), first = await app.prepared("failed");
  const releasing = first.release({ discard: true });
  assert.equal(first.release(), releasing); await releasing; await first.ready(); await app.cache.clear();
  assert.deepEqual(app.events, ["failed:suspend", "failed:dispose", "renderer:0:dispose", "renderer:0:lose"]);
});

test("clear during a previous-scene cleanup prevents delayed idle admission", async () => {
  const app = fixture(), cleanup = deferred(), first = await app.cache.acquire();
  first.bind(app.scene("first", cleanup)); await first.ready(); await first.release();
  const next = await app.cache.acquire(); next.bind(app.scene("next"));
  const becomingReady = next.ready(), releasing = next.release();
  await app.cache.clear(); cleanup.resolve(); await becomingReady; await releasing;
  assert.equal(app.timers.size, 0); assert.ok(app.events.includes("renderer:0:dispose"));
});

test("renderer cleanup still runs when a scene disposal rejects", async () => {
  const app = fixture(), lease = await app.cache.acquire();
  lease.bind({ suspend() {}, dispose() { throw new Error("scene cleanup failed"); } });
  await assert.rejects(lease.release(), /Wheel renderer cleanup failed/);
  assert.deepEqual(app.events, ["renderer:0:dispose", "renderer:0:lose"]);
  const next = await app.cache.acquire(); assert.equal(next.reused, false); await next.release();
});
