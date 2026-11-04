import test from "node:test";
import assert from "node:assert/strict";
import { Color, Group, Mesh, MeshPhysicalMaterial, NoToneMapping, PlaneGeometry, Scene, ShaderLib, SpotLight, Texture, Vector3, Vector4 } from "three";
import { createActorReflections } from "./createActorReflections.js";
import { createSphericalReflections } from "./sphericalReflections.js";
import { createProjection, STAGE_CAMERA } from "./projection.js";
import { createDynamicActorHalo } from "./dynamicActorHalo.js";
import { DESK_TOP_SURFACE_Y } from "./stageDeskDimensions.js";

function fixture() {
  const scene = new Scene(), set = new Group(), actors = new Group(), lighting = new Group();
  const surface = new Mesh(new PlaneGeometry(1, 1), new MeshPhysicalMaterial()); set.add(surface);
  actors.add(new Mesh(new PlaneGeometry(1, 1), new MeshPhysicalMaterial()));
  const light = new SpotLight("#83b7ff", 260000); light.position.set(-600, 430, 690); lighting.add(light);
  scene.add(set, actors, lighting);
  let currentTarget = null, clearColor = new Color("#123456"), alpha = 1;
  const renderer = { xr: { enabled: false }, shadowMap: { autoUpdate: true }, autoClear: true,
    state: { buffers: { depth: { setMask() {} } } }, toneMapping: 4, draws: 0,
    getRenderTarget: () => currentTarget, setRenderTarget(value) { currentTarget = value; },
    getClearColor: target => target.copy(clearColor), getClearAlpha: () => alpha,
    setClearColor(color, value) { clearColor.set(color); alpha = value; },
    render(activeScene, camera) { this.draws++; this.reflectedCamera = camera.clone(); },
  };
  createSphericalReflections().apply(surface.material);
  const reflections = createActorReflections(renderer, scene, surface, actors, lighting); reflections.prepare();
  const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
  surface.material.onBeforeCompile(shader, renderer);
  return { reflections, renderer, shader, light, surface, actors, dispose() {
    reflections.dispose(); surface.geometry.dispose(); surface.material.dispose();
    actors.children[0].geometry.dispose(); actors.children[0].material.dispose();
  } };
}

test("the desk samples the real reflected actor position across focal lengths, crop and camera roll", () => {
  const app = fixture();
  for (const focal of [14, 28, 85]) for (const roll of [-20, 0, 20]) {
    const { camera } = createProjection(760, 584, { ...STAGE_CAMERA, elevation: 35, focal, roll, offsetX: 23, offsetY: -15 });
    app.reflections.invalidate(); app.reflections.render(camera);
    for (const point of [new Vector3(-345, 217, 355), new Vector3(345, 217, 355), new Vector3(0, 232, 490)]) {
      const mirror = point.clone(); mirror.y = 2 * DESK_TOP_SURFACE_Y - point.y;
      const onDesk = camera.position.clone().lerp(mirror, (DESK_TOP_SURFACE_Y - camera.position.y) / (mirror.y - camera.position.y));
      const lookup = new Vector4(onDesk.x, onDesk.y, onDesk.z, 1).applyMatrix4(app.shader.uniforms.stageActorProjection.value);
      const projected = point.clone().project(app.renderer.reflectedCamera);
      assert.ok(Math.abs(lookup.x / lookup.w - (projected.x + 1) / 2) < 1e-8);
      assert.ok(Math.abs(lookup.y / lookup.w - (projected.y + 1) / 2) < 1e-8);
    }
  }
  assert.equal(app.surface.layers.test(app.renderer.reflectedCamera.layers), false, "No self-sampling feedback in the reflection target");
  assert.equal(app.shader.uniforms.stageActorReflectionHeight.value, DESK_TOP_SURFACE_Y);
  assert.equal(app.actors.children[0].layers.test(app.renderer.reflectedCamera.layers), true);
  assert.ok(app.shader.fragmentShader.includes("return withActorReflection(envMapColor.rgb * envMapIntensity, roughness);"));
  assert.equal(app.renderer.shadowMap.autoUpdate, true); assert.equal(app.renderer.getClearAlpha(), 1);
  assert.equal(app.renderer.getRenderTarget(), null);
  app.dispose();
});

test("portrait reflection capture is cached until a camera or light change", () => {
  const app = fixture(), { camera } = createProjection(760, 584, STAGE_CAMERA);
  app.reflections.render(camera); app.reflections.render(camera);
  assert.equal(app.renderer.draws, 1);
  app.light.position.x += 50; app.reflections.render(camera);
  assert.equal(app.renderer.draws, 2);
  app.reflections.invalidate(); app.reflections.render(camera, false);
  assert.equal(app.renderer.draws, 2); assert.equal(app.shader.uniforms.stageActorsReflected.value, 0);
  app.reflections.render(camera, true); assert.equal(app.renderer.draws, 3);
  app.dispose();
});

test("reflection warmup compiles for its linear target and restores renderer state on success or failure", async () => {
  const app = fixture(), originalTarget = {};
  app.renderer.setRenderTarget(originalTarget);
  for (const fail of [false, true]) {
    app.renderer.compileAsync = async (scene, camera) => {
      assert.notEqual(app.renderer.getRenderTarget(), originalTarget);
      assert.equal(app.renderer.toneMapping, NoToneMapping);
      assert.equal(camera.layers.mask, 2);
      if (fail) throw new Error("Compilation interrupted");
    };
    if (fail) await assert.rejects(app.reflections.warmup(), /Compilation interrupted/);
    else await app.reflections.warmup();
    assert.equal(app.renderer.getRenderTarget(), originalTarget);
    assert.equal(app.renderer.toneMapping, 4);
  }
  assert.equal(app.renderer.draws, 0);
  app.dispose();
});

test("the halo follows current spot position, aim, colour and intensity without rebuilding its mask", () => {
  const texture = new Texture(), light = new SpotLight("#83b7ff", 260000);
  light.position.set(-600, 430, 690); light.target.position.set(-160, -150, -100);
  const halo = createDynamicActorHalo(texture, [light]); halo.update();
  const uniforms = halo.material.uniforms, firstDirection = uniforms.haloDirections.value[0].clone();
  light.position.set(600, 530, 300); light.color.set("#d9a0ef"); light.intensity = 320000;
  halo.update();
  assert.deepEqual(uniforms.haloSources.value[0].toArray(), [600, 530, 300]);
  assert.ok(!uniforms.haloDirections.value[0].equals(firstDirection));
  assert.ok(uniforms.haloColors.value[0].equals(light.color));
  assert.equal(uniforms.haloCones.value[0].x, 320000);
  assert.equal(uniforms.contourMap.value, texture);
  light.visible = false; halo.update(); assert.equal(uniforms.haloCones.value[0].x, 0);
  halo.material.dispose(); texture.dispose();
});
