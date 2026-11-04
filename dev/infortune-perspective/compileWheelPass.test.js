import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, SpotLight } from "three";
import { compileWheelPass } from "./compileWheelPass.js";

test("mirror/cube compilation excludes invisible meshes and other layers without moving live objects", async () => {
  const scene = new Scene(), camera = new PerspectiveCamera(), parent = new Group(); scene.add(parent);
  camera.layers.set(1);
  const geometry = new PlaneGeometry(), material = new MeshBasicMaterial();
  const visible = new Mesh(geometry, material), wheel = new Mesh(geometry, material), hidden = new Group();
  visible.layers.set(1); parent.add(visible, wheel, hidden); hidden.visible = false;
  const excluded = new Mesh(geometry, material); excluded.layers.set(1); hidden.add(excluded);
  const light = new SpotLight(); light.layers.enable(1); scene.add(light);
  const compiled = [];
  const renderer = { info: { programs: [] }, extensions: { has: () => true, get: () => ({ COMPLETION_STATUS_KHR: 2 }) },
    getContext: () => ({ isContextLost: () => false }), compile(batch, activeCamera, target) {
    assert.equal(target, scene); assert.equal(activeCamera, camera);
    batch.traverse(object => { if (object.isMesh) compiled.push(object); });
  } };
  await compileWheelPass(renderer, scene, camera, { yieldControl: async () => {} });
  assert.equal(compiled.length, 1); assert.notEqual(compiled[0], visible);
  assert.equal(compiled[0].geometry, geometry); assert.equal(compiled[0].material, material);
  assert.equal(visible.parent, parent); assert.equal(wheel.parent, parent); assert.equal(excluded.parent, hidden);
  assert.equal(hidden.visible, false); geometry.dispose(); material.dispose();
});

test("parallel compilation polls new links without blocking, and reuses completed renderer programs", async () => {
  const scene = new Scene(), camera = new PerspectiveCamera(), geometry = new PlaneGeometry(), material = new MeshBasicMaterial();
  scene.add(new Mesh(geometry, material));
  const cached = { program: 1 }, added = { program: 2 }, queries = [];
  let polls = 0, yields = 0;
  const gl = { isContextLost: () => false, getProgramParameter(program, flag) {
    assert.equal(flag, 9); queries.push(program); return ++polls >= 3;
  } };
  const renderer = { info: { programs: [cached] }, extensions: { has: () => true, get: () => ({ COMPLETION_STATUS_KHR: 9 }) },
    getContext: () => gl, compile() { if (!this.info.programs.includes(added)) this.info.programs.push(added); },
    compileAsync() { assert.fail("The renderer must not own an uncancellable timer"); } };
  const options = { yieldControl: async () => { yields++; } };
  assert.equal(await compileWheelPass(renderer, scene, camera, options), true);
  assert.equal(await compileWheelPass(renderer, scene, camera, options), true);
  assert.deepEqual(queries, [2, 2, 2]); assert.equal(yields, 4);
  geometry.dispose(); material.dispose();
});

test("parallel polling stops on disposal or a lost context even if completion never arrives", async () => {
  for (const reason of ["dispose", "lost"]) {
    const scene = new Scene(), camera = new PerspectiveCamera(), geometry = new PlaneGeometry(), material = new MeshBasicMaterial();
    scene.add(new Mesh(geometry, material));
    let stopped = false, lost = false, queries = 0, yields = 0;
    const renderer = { info: { programs: [] }, extensions: { has: () => true, get: () => ({ COMPLETION_STATUS_KHR: 9 }) },
      getContext: () => ({ isContextLost: () => lost, getProgramParameter() { queries++; return false; } }),
      compile() { this.info.programs.push({ program: 1 }); } };
    assert.equal(await compileWheelPass(renderer, scene, camera, {
      isDisposed: () => stopped, yieldControl: async () => { yields++; stopped = reason === "dispose"; lost = reason === "lost"; },
    }), false);
    assert.equal(queries, 1); assert.equal(yields, 1);
    geometry.dispose(); material.dispose();
  }
});

test("a context lost during the completion query cannot leave a permanent poll", async () => {
  const scene = new Scene(), camera = new PerspectiveCamera(), geometry = new PlaneGeometry(), material = new MeshBasicMaterial();
  scene.add(new Mesh(geometry, material));
  let lost = false;
  const renderer = { info: { programs: [] }, extensions: { has: () => true, get: () => ({ COMPLETION_STATUS_KHR: 9 }) },
    getContext: () => ({ isContextLost: () => lost, getProgramParameter() { lost = true; return null; } }),
    compile() { this.info.programs.push({ program: 1 }); } };
  assert.equal(await compileWheelPass(renderer, scene, camera, { yieldControl: async () => assert.fail("No timer after context loss") }), false);
  geometry.dispose(); material.dispose();
});

test("without parallel compilation, bounded batches yield and stop on cancellation; exchange overlays can be explicitly warmed", async () => {
  const scene = new Scene(), camera = new PerspectiveCamera(), overlay = new Group();
  const geometry = new PlaneGeometry(), material = new MeshBasicMaterial();
  for (let i = 0; i < 9; i++) scene.add(new Mesh(geometry, material));
  overlay.add(new Mesh(geometry, material)); overlay.visible = false; scene.add(overlay);
  let count = 0, yields = 0, stopped = false;
  const renderer = { extensions: { has: () => false }, compile(batch, _camera, target) {
    assert.equal(target, scene); assert.ok(batch.children.length <= 4); count += batch.children.length;
  }, compileAsync() { assert.fail("Do not invoke the unsupported parallel path"); } };
  assert.equal(await compileWheelPass(renderer, scene, camera, { include: [overlay],
    isDisposed: () => stopped, yieldControl: async () => { yields++; if (yields === 2) stopped = true; } }), false);
  assert.equal(count, 8); assert.equal(yields, 2);
  count = 0;
  await compileWheelPass(renderer, scene, camera, { include: [overlay], yieldControl: async () => {} });
  assert.equal(count, 10); assert.equal(overlay.visible, false); geometry.dispose(); material.dispose();
});
