import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { STAGE_CONTESTANTS, STAGE_HOST } from "./stageFixtures.js";
import { createProjection, projectPoint, STAGE_CAMERA } from "./projection.js";
import { collectStageAvatarFiles } from "./stageAvatarAssets.mjs";
import { Object3D, Vector3, SpotLight } from "three";
import { placeStageActor } from "./actorPlacement.js";
import { BACK_LIGHTS, BACK_LIGHT_BEAM } from "./createStageLighting.js";
import { createLightBeam } from "./lightBeam.js";
import { DESK_TOP_SURFACE_Y } from "./stageDeskDimensions.js";

test("the establishing shot includes the presenter and both candidates above the counter", () => {
  for (const width of [320, 760, 1000]) {
    const height = width / 1.3, projection = createProjection(width, height, STAGE_CAMERA);
    for (const actor of [STAGE_HOST, ...STAGE_CONTESTANTS]) {
      for (const side of [-1, 1]) {
        const top = projectPoint(320 + actor.position[0] + side * actor.height * 0.32, 334 + actor.position[2], projection, actor.position[1] + actor.height);
        assert.ok(top.x > 8 && top.x < width - 8 && top.y > 8 && top.y < height - 8, JSON.stringify({ width, actor, top }));
      }
    }
  }
});

test("side portraits foreshorten toward the wheel instead of broadening toward the camera", () => {
  for (const fixture of STAGE_CONTESTANTS) for (const focal of [14, 28, 85]) {
    const { camera } = createProjection(760, 760 / 1.3, { ...STAGE_CAMERA, focal });
    const radial = new Object3D(); placeStageActor(radial, fixture);
    const old = new Object3D(); old.position.copy(radial.position);
    old.lookAt(camera.position.x, old.position.y, camera.position.z); old.updateMatrixWorld(true);
    function faceRatio(actor) {
      const projected = (x, y) => actor.localToWorld(new Vector3(x, y, 0)).project(camera).multiply(new Vector3(760, 760 / 1.3, 0));
      return projected(-40, 80).distanceTo(projected(40, 80)) / projected(0, 40).distanceTo(projected(0, 120));
    }
    assert.ok(faceRatio(radial) < faceRatio(old) * 0.95, JSON.stringify({ fixture: fixture.id, focal, before: faceRatio(old), after: faceRatio(radial) }));
    assert.deepEqual(radial.scale.toArray(), [1, 1, 1], "Do not squash the artwork to compensate for a camera error");
  }
});

test("the spots cover their portraits and desk specular points, and their volumes read real light and shadow data", () => {
  // The taller desk changes the specular path; use a view above its new top.
  const { camera } = createProjection(760, 584, { ...STAGE_CAMERA, elevation: 30 });
  const mirroredEye = camera.position.clone(); mirroredEye.y = 2 * DESK_TOP_SURFACE_Y - mirroredEye.y;
  for (const [index, fixture] of BACK_LIGHTS.entries()) {
    const spot = new SpotLight(fixture.color, fixture.power, BACK_LIGHT_BEAM.distance, fixture.angle, BACK_LIGHT_BEAM.penumbra);
    spot.position.set(...fixture.position); spot.target.position.set(...fixture.target);
    spot.updateMatrixWorld(true); spot.target.updateMatrixWorld(true); spot.shadow.updateMatrices(spot);
    const actor = [STAGE_CONTESTANTS[1], STAGE_HOST, STAGE_CONTESTANTS[0]][index];
    const face = new Vector3(actor.position[0], actor.position[1] + actor.height * 0.75, actor.position[2]);
    const faceInShadow = face.clone().applyMatrix4(spot.shadow.matrix);
    assert.ok(faceInShadow.toArray().every(value => value > 0 && value < 1), "Each backlight must actually cover the corresponding portrait");
    const specularPoint = mirroredEye.clone().lerp(spot.position, (DESK_TOP_SURFACE_Y - mirroredEye.y) / (spot.position.y - mirroredEye.y));
    assert.ok(Math.hypot(specularPoint.x, specularPoint.z) > 318 && Math.hypot(specularPoint.x, specularPoint.z) < 435);
    const direction = spot.target.position.clone().sub(spot.position);
    for (const point of [face, specularPoint]) {
      assert.ok(point.clone().sub(spot.position).angleTo(direction) < spot.angle * (1 - spot.penumbra),
        "Portrait and visible desk highlight must receive the real spotlight's full beam, not an environment-only imitation");
    }
    const beam = createLightBeam(spot); beam.updateMatrixWorld(true);
    const length = spot.position.distanceTo(spot.target.position);
    const sample = beam.children[0]; sample.onBeforeRender(null, null, camera);
    assert.equal(beam.children.length, 1, "All samples use one draw call per source");
    assert.equal(sample.castShadow, false, "The haze must never enter its own shadow map");
    assert.equal(sample.material.depthWrite, false);
    assert.equal(sample.material.depthTest, true, "Scene surfaces must occlude atmospheric samples");
    assert.ok(sample.material.uniforms.source.value.distanceTo(spot.position) < 1e-6);
    assert.ok(Math.abs(sample.material.uniforms.beamLength.value - length) < 1e-6);
    assert.ok(sample.material.uniforms.beamDirection.value.distanceTo(direction.normalize()) < 1e-6);
    assert.equal(sample.material.uniforms.hasOcclusion.value, 0);
    const texture = {}; spot.shadow.map = { texture };
    sample.onBeforeRender(null, null, camera);
    assert.equal(sample.material.uniforms.occlusionMap.value, texture);
    assert.equal(sample.material.uniforms.occlusionMatrix.value, spot.shadow.matrix);
    assert.equal(sample.material.uniforms.hasOcclusion.value, 1);
    spot.intensity = 0; sample.onBeforeRender(null, null, camera);
    assert.equal(sample.material.uniforms.beamIntensity.value, 0, "Atmospheric light must extinguish with its source");
    sample.geometry.dispose();
    sample.material.dispose();
  }
});

test("the standalone build includes real, local assets for both game avatar fixtures", async () => {
  const root = new URL("../../public/avatars/v1/", import.meta.url);
  const catalog = JSON.parse(await readFile(new URL("catalog.json", root), "utf8"));
  const files = collectStageAvatarFiles(catalog);
  assert.ok(files.size > 10);
  for (const file of files) {
    assert.ok(!file.includes("..") && !file.startsWith("/"));
    assert.ok((await stat(new URL(file, root))).size > 0, file);
  }
  for (const fixture of STAGE_CONTESTANTS) {
    for (const family of ["hair", "eyes", "brows", "nose", "mouths", "clothes"]) {
      assert.ok(catalog.families[family].some(part => part.id === fixture.avatar[family]), `${fixture.id}: unknown ${family}`);
    }
  }
});
