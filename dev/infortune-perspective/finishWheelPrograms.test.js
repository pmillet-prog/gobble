import test from "node:test";
import assert from "node:assert/strict";
import { finishWheelPrograms } from "./finishWheelPrograms.js";

test("driver validation yields per program, reuses completed links and can be cancelled", async () => {
  const events = [], programs = [1, 2, 3].map(program => ({ program }));
  let stopped = false;
  const renderer = { info: { programs }, getContext: () => ({ LINK_STATUS: 1,
    getProgramParameter(program) { events.push(`link-${program}`); return true; } }) };
  const options = { isDisposed: () => stopped, yieldControl: async () => { events.push("yield"); } };
  assert.equal(await finishWheelPrograms(renderer, options), true);
  assert.deepEqual(events, ["yield", "link-1", "yield", "link-2", "yield", "link-3"]);
  events.length = 0; await finishWheelPrograms(renderer, options); assert.deepEqual(events, []);
  programs.push({ program: 4 }); stopped = true;
  assert.equal(await finishWheelPrograms(renderer, options), false); assert.deepEqual(events, ["yield"]);
});

test("a real link failure is reported instead of declaring the scene ready", async () => {
  const renderer = { info: { programs: [{ program: 1 }] }, getContext: () => ({ LINK_STATUS: 1,
    getProgramParameter: () => false, getProgramInfoLog: () => "invalid shader" }) };
  await assert.rejects(finishWheelPrograms(renderer, { yieldControl: async () => {} }), /invalid shader/);
});

test("a retained renderer validates newly created programs while reusing surviving links", async () => {
  const retained = { program: 1 }, replaced = { program: 2 }, checks = [];
  const renderer = { info: { programs: [retained, replaced] }, getContext: () => ({ LINK_STATUS: 1,
    getProgramParameter(program) { checks.push(program); return true; } }) };
  const options = { yieldControl: async () => {} };
  await finishWheelPrograms(renderer, options);
  renderer.info.programs = [retained, { program: 3 }];
  await finishWheelPrograms(renderer, options);
  await finishWheelPrograms(renderer, options);
  assert.deepEqual(checks, [1, 2, 3]);
});

test("driver stalls are distinguished from yielding without adding any GL queries", async () => {
  let time = 0, queries = 0; const measurements = [];
  const program = { program: 1, id: 8, name: "wheel-metal", type: "MeshPhysicalMaterial" };
  const renderer = { info: { programs: [program] }, getContext: () => ({ LINK_STATUS: 1,
    getProgramParameter() { queries++; time += 2150; return true; } }) };
  await finishWheelPrograms(renderer, { now: () => time, yieldControl: async () => { time += 4; },
    onProgramTiming: value => measurements.push(value), onProgress(done, total, current) {
      if (done < total) assert.equal(current, program);
    } });
  assert.equal(queries, 1);
  assert.deepEqual(measurements, [{ id: 8, name: "wheel-metal", type: "MeshPhysicalMaterial", checkMs: 2150, yieldMs: 4, linked: true }]);
});
