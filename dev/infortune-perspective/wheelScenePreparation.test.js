import test from "node:test";
import assert from "node:assert/strict";
import { deferWheelSetup, prepareWheelRendering } from "./wheelScenePreparation.js";

test("a cancelled rehearsal mount never allocates a scene, and the real mount cleans up once", () => {
  const tasks = new Map(); let id = 0, setups = 0, disposals = 0;
  const scheduler = { schedule(fn) { tasks.set(++id, fn); return id; }, cancel(key) { tasks.delete(key); } };
  const setup = () => { setups++; return () => disposals++; };
  const rehearsal = deferWheelSetup(setup, scheduler); rehearsal();
  const real = deferWheelSetup(setup, scheduler);
  for (const task of tasks.values()) task();
  assert.equal(setups, 1); assert.equal(disposals, 0);
  real(); real(); assert.equal(disposals, 1);
});

function fixture() {
  const events = [], image = { isTexture: true }, target = { isTexture: true, isRenderTargetTexture: true };
  let disposed = false;
  const options = {
    renderer: { initTexture(texture) { assert.equal(texture, image); events.push("texture"); }, async compileAsync() { events.push("compile"); } },
    scene: { traverse(visit) { visit({ material: { map: image, emissiveMap: image, envMap: target } }); } },
    camera: {}, isDisposed: () => disposed,
    prepareEnvironment: () => events.push("environment"), prepareShadows: () => events.push("shadows"),
    captureShadows: () => events.push("shadow-pass"), captureReflections: async () => events.push("cube-pass"),
    prepareActorReflections: () => events.push("final-materials"), warmActorReflections: async () => events.push("mirror-compile"),
    draw: () => events.push("first-frame"), onStatus: () => {}, yieldControl: async () => events.push("yield"),
  };
  return { events, options, dispose() { disposed = true; } };
}

test("the intro becomes ready only after textures, final shader variants and the first full frame", async () => {
  const app = fixture();
  assert.equal(await prepareWheelRendering(app.options), true);
  assert.deepEqual(app.events.filter(event => event !== "yield"), ["environment", "texture", "shadows", "final-materials", "compile",
    "shadow-pass", "cube-pass", "mirror-compile", "first-frame"]);
  assert.equal(app.events.at(-1), "yield", "Return to the browser after the first full render before starting the intro");
});

test("unmount during asynchronous compilation waits for it but never starts capture or intro", async () => {
  const app = fixture(); let finish, started;
  const compiling = new Promise(resolve => { started = resolve; });
  app.options.renderer.compileAsync = () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const preparation = prepareWheelRendering(app.options);
  await compiling; app.dispose(); finish();
  assert.equal(await preparation, false);
  assert.ok(!app.events.includes("shadow-pass")); assert.ok(!app.events.includes("first-frame"));
});

test("a compilation failure cannot advertise a ready stage", async () => {
  const app = fixture();
  app.options.renderer.compileAsync = async () => { throw new Error("GPU unavailable"); };
  await assert.rejects(prepareWheelRendering(app.options), /GPU unavailable/);
  assert.ok(!app.events.includes("first-frame"));
});
