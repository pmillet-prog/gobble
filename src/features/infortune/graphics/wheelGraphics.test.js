import test from "node:test";
import assert from "node:assert/strict";
import { createWheelGraphicsSetup } from "./createWheelGraphicsSetup.js";
import { WHEEL_GRAPHICS_KEY, beginWheelGraphicsCheck, readWheelGraphics, saveWheelGraphics, setWheelGraphicsPreference,
  readWheelGraphicsPreference, wheelGraphicsDevice, rememberWheelDiagnostic } from "./wheelGraphicsStorage.js";
import { isWheelGraphicsFallback } from "./wheelGraphicsStorage.js";
import { createWheelPerformance, readWheelPerformance } from "../../../../dev/infortune-perspective/wheelPerformance.js";
function memory() { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; }
function harness(options = {}) {
  const storage = options.storage || memory(), known = [], changes = [], intervals = new Map(), timeouts = new Map(); let clock = 0, id = 0, shown = true;
  const timers = { setInterval(fn) { intervals.set(++id, fn); return id; }, clearInterval(key) { intervals.delete(key); },
    setTimeout(fn) { timeouts.set(++id, fn); return id; }, clearTimeout(key) { timeouts.delete(key); } };
  const setup = createWheelGraphicsSetup({ storage, timers, now: () => clock, visible: () => shown,
    fetcher: async () => ({ ok: true, json: async () => ({}) }), ...options,
    onKnown: value => known.push(value), onChange: value => changes.push(value) });
  return { setup, storage, known, changes, intervals, timeouts, visible(value) { shown = value; },
    tick(ms) { clock += ms; for (const fn of [...intervals.values()]) fn(); } };
}
const phase = fps => ({ fps, p95: 1000 / fps, samples: 200, durationMs: 5000 });
const run = (profile, fps = 30) => ({ profile, status: "complete", phases: { intro: phase(fps), spin: phase(fps) } });

test("setup picks the first stable quality and the game keeps it at 30 FPS", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin();
  h.setup.receive(run("detailed", 24)); assert.equal(h.setup.snapshot().profile, "balanced");
  h.setup.receive(run("balanced", 30)); assert.equal(h.setup.snapshot().phase, "done");
  assert.equal(readWheelGraphics(h.storage).profile, "balanced"); assert.equal(h.intervals.size, 0);
  const initial = readWheelPerformance(h.storage); assert.equal(initial.profile, "balanced");
  const monitor = createWheelPerformance({ initial, storage: h.storage });
  for (let time = 0; time < 10000; time += 1000 / 30) monitor.frame(time, 2, true);
  assert.equal(monitor.snapshot().profile, "balanced");
});
test("measurement failures reach 2D and manual preference overrides the recommendation", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin();
  for (const profile of ["detailed", "balanced", "light"]) h.setup.receive({ profile, status: "error" });
  assert.equal(readWheelPerformance(h.storage).profile, "flat");
  h.setup.chooseManual("detailed"); assert.equal(readWheelPerformance(h.storage).profile, "detailed");
  assert.equal(readWheelGraphics(h.storage).profile, "flat", "Manual choice must not masquerade as measured capacity");
  assert.equal(readWheelGraphicsPreference(h.storage), "detailed");
});
test("manual selection can bypass setup and ends the current measurement", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin(); h.setup.chooseManual("light");
  h.setup.receive(run("detailed")); assert.equal(h.setup.snapshot().recommendation.profile, "light");
  assert.equal(h.intervals.size, 0); assert.equal(readWheelGraphics(h.storage), null);
  const next = harness({ storage: h.storage }); await next.setup.start(); assert.equal(next.known[0].profile, "light");
});
test("saved results skip setup and an interrupted recheck preserves the previous measured quality", async () => {
  const storage = memory(); saveWheelGraphics({ profile: "detailed", reason: "measured" }, { storage });
  let h = harness({ storage }); await h.setup.start(); assert.equal(h.known[0].profile, "detailed");
  beginWheelGraphicsCheck(storage); h = harness({ storage }); await h.setup.start();
  assert.equal(h.known[0].profile, "detailed"); assert.equal(h.known[0].reason, "measured");
  assert.equal(h.known[0].lastCheck.reason, "interrupted");
  assert.equal(JSON.parse(storage.getItem(WHEEL_GRAPHICS_KEY)).pending, false);
});

test("an interrupted first check uses a provisional fallback and can retry without altering manual preferences", async () => {
  const storage = memory(); beginWheelGraphicsCheck(storage);
  const h = harness({ storage }); await h.setup.start();
  assert.equal(h.known[0].profile, "flat"); assert.equal(isWheelGraphicsFallback(h.known[0]), true);
  assert.equal(h.intervals.size, 0, "a reload never starts the GPU again automatically");
  h.setup.retry();
  assert.equal(h.setup.snapshot().phase, "running");
  assert.equal(h.setup.snapshot().profile, "detailed");
  h.setup.receive(run("detailed", 60));
  assert.equal(readWheelGraphics(storage).profile, "detailed");
  assert.equal(isWheelGraphicsFallback(readWheelGraphics(storage)), false);
  assert.equal(readWheelGraphicsPreference(storage), "auto");
});

test("a timeout never downgrades a completed measurement and retry resets the whole sequence", async () => {
  const h = harness(); saveWheelGraphics({ profile: "detailed", reason: "measured" }, { storage: h.storage, now: 123 });
  await h.setup.start({ force: true }); h.setup.begin();
  for (let index = 0; index < 3; index++) h.tick(45000);
  assert.equal(h.setup.snapshot().recommendation.profile, "detailed");
  assert.equal(readWheelGraphics(h.storage).at, 123);
  h.setup.retry();
  assert.equal(h.setup.snapshot().profile, "detailed"); assert.deepEqual(h.setup.snapshot().runs, []);
  h.tick(1000); assert.equal(h.setup.snapshot().phase, "running");
  h.setup.receive(run("detailed", 60));
  assert.equal(readWheelGraphics(h.storage).lastCheck, undefined);
});

test("a check that times out on each level is not presented as measured 3D incapacity", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin();
  for (const profile of ["detailed", "balanced", "light"]) h.setup.receive({ profile, status: "timeout" });
  assert.equal(readWheelGraphics(h.storage).reason, "timeout");
  assert.equal(isWheelGraphicsFallback(readWheelGraphics(h.storage)), true);
});
test("background time is excluded and stalled setup has a finite foreground deadline", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin();
  h.visible(false); h.tick(120000); h.visible(true); h.tick(1000);
  assert.equal(h.setup.snapshot().profile, "detailed"); h.tick(45000);
  assert.equal(h.setup.snapshot().profile, "balanced"); h.tick(45000);
  assert.equal(h.setup.snapshot().profile, "light"); h.tick(45000);
  assert.equal(h.setup.snapshot().recommendation.profile, "flat"); assert.equal(h.intervals.size, 0);
});
test("a single long stall cannot skip medium or light", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin();
  h.tick(95000);
  assert.equal(h.setup.snapshot().phase, "running"); assert.equal(h.setup.snapshot().profile, "balanced");
  assert.deepEqual(h.setup.snapshot().runs.map(run => run.profile), ["detailed"]);
  h.tick(44000); assert.equal(h.setup.snapshot().profile, "balanced");
  h.setup.ready("balanced"); h.tick(8000); h.setup.receive(run("balanced"));
  assert.equal(readWheelGraphics(h.storage).profile, "balanced");
});
test("cold loading leaves a full animation budget, with stale or duplicate ready signals ignored", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin();
  h.tick(44000); h.setup.ready("detailed"); h.tick(10000);
  assert.equal(h.setup.snapshot().profile, "detailed");
  h.setup.ready("detailed"); h.tick(5000);
  assert.equal(h.setup.snapshot().profile, "balanced");
  h.tick(44000); h.setup.ready("detailed"); h.tick(1000);
  assert.equal(h.setup.snapshot().profile, "light");
  h.setup.ready("light"); h.tick(8000); h.setup.receive(run("light"));
  assert.equal(readWheelGraphics(h.storage).profile, "light");
});
test("a stable high spin completes after a slow preparation without downgrading", async () => {
  const h = harness(); await h.setup.start({ force: true }); h.setup.begin();
  h.tick(44000); h.setup.ready("detailed"); h.tick(9000); h.setup.receive(run("detailed", 60));
  assert.equal(readWheelGraphics(h.storage).profile, "detailed");
  assert.deepEqual(h.setup.snapshot().runs.map(run => run.profile), ["detailed"]);
});
test("disposing lookup/measurement releases timers and suppresses late replies", async () => {
  let reply; const h = harness({ fetcher: () => new Promise(resolve => { reply = resolve; }) });
  const pending = h.setup.start(); h.setup.dispose();
  reply({ ok: true, json: async () => ({ recommendation: { profile: "detailed" } }) }); await pending;
  assert.equal(h.changes.length, 0); assert.equal(h.known.length, 0); assert.equal(h.timeouts.size, 0);
});
test("legacy reports need confirmation while an exact device result can be reused", async () => {
  const legacy = [{ reportId: "legacy-report-12345", recommendation: { profile: "light", reason: "measured" } }];
  const h = harness({ fetcher: async () => ({ ok: true, json: async () => ({ legacy }) }) });
  await h.setup.start(); assert.equal(h.setup.snapshot().phase, "welcome"); assert.equal(readWheelGraphics(h.storage), null);
  h.setup.useLegacy("unknown"); assert.equal(h.setup.snapshot().phase, "welcome");
  h.setup.useLegacy(legacy[0].reportId); assert.equal(readWheelGraphics(h.storage).profile, "light");
  const exact = harness({ fetcher: async () => ({ ok: true, json: async () => ({ recommendation: { profile: "detailed" }, reportId: "report-123456789" }) }) });
  await exact.setup.start(); assert.equal(exact.known[0].profile, "detailed");
});
test("a submitted survey choice is reused without another test and remains distinct from measured capacity", async () => {
  const storage = memory();
  rememberWheelDiagnostic({ id: "diagnostic-12345678", runs: [run("detailed")], survey: { preferred: "balanced" } }, storage);
  assert.equal(readWheelGraphics(storage).profile, "detailed");
  assert.equal(readWheelPerformance(storage).profile, "balanced");
  const h = harness({ storage, fetcher() { assert.fail("local choice needs no lookup"); } }); await h.setup.start();
  assert.equal(h.known[0].profile, "balanced"); assert.equal(h.known[0].reason, "manual"); assert.equal(h.intervals.size, 0);
});
test("an exact account report restores a preference even without usable measurements", async () => {
  const h = harness({ fetcher: async () => ({ ok: true, json: async () => ({ preference: "detailed", recommendation: { profile: null } }) }) });
  await h.setup.start();
  assert.equal(h.known[0].profile, "detailed"); assert.equal(h.known[0].reason, "manual");
  assert.equal(readWheelGraphics(h.storage), null); assert.equal(readWheelPerformance(h.storage).profile, "detailed");
  assert.equal(h.intervals.size, 0);
});
test("a legacy survey choice is restored without confirmation or measurement, including 2D", async () => {
  for (const preference of ["detailed", "flat"]) {
    const legacy = [{ reportId: "legacy-choice-12345", preference, recommendation: { profile: null } }];
    const h = harness({ fetcher: async () => ({ ok: true, json: async () => ({ legacy }) }) });
    await h.setup.start();
    assert.equal(h.setup.snapshot().phase, 'done');
    assert.equal(h.known[0].profile, preference);
    assert.equal(h.setup.snapshot().recommendation.profile, preference);
    assert.equal(readWheelGraphicsPreference(h.storage), preference); assert.equal(h.intervals.size, 0);
    assert.equal(readWheelGraphics(h.storage), null, 'an account choice is not a measurement of this device');
    const restarted = harness({storage:h.storage,fetcher(){assert.fail('a saved choice must survive a server restart without another lookup');}});
    await restarted.setup.start(); assert.equal(restarted.known[0].profile,preference);
  }
});

test('a legacy explicit choice wins over older reports without importing their device measurements', async () => {
  const legacy = [
    {reportId:'latest-undecided',recommendation:{profile:'flat'}},
    {reportId:'latest-choice',preference:'balanced',recommendation:{profile:'detailed'}},
    {reportId:'older-choice',preference:'light',recommendation:{profile:'light'}},
  ];
  const h=harness({fetcher:async()=>({ok:true,json:async()=>({legacy})})});
  await h.setup.start();assert.equal(h.known[0].profile,'balanced');assert.equal(readWheelGraphics(h.storage),null);
});
test("an undecided survey never overrides an existing manual choice", () => {
  const storage = memory(); setWheelGraphicsPreference("light", storage);
  for (const preferred of ["unsure", "none", undefined]) rememberWheelDiagnostic({ runs: [run("detailed")], survey: { preferred } }, storage);
  assert.equal(readWheelGraphicsPreference(storage), "light");
});
test("denied storage keeps a session result and a separate browser gets a separate id", () => {
  const storage = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
  saveWheelGraphics({ profile: "flat", reason: "measured" }, { storage });
  assert.equal(readWheelPerformance(storage).profile, "flat");
  setWheelGraphicsPreference("light", storage); assert.equal(readWheelPerformance(storage).profile, "light");
  assert.notEqual(wheelGraphicsDevice(memory()), wheelGraphicsDevice(memory()));
});
