import test from "node:test";
import assert from "node:assert/strict";
import { Texture, Vector3 } from "three";
import { createStageLighting, BACK_LIGHTS, BACK_LIGHT_POWER_GAIN } from "./createStageLighting.js";
import { createDynamicActorHalo } from "./dynamicActorHalo.js";
import { createProjection, STAGE_CAMERA } from "./projection.js";
import { createLightBeam } from "./lightBeam.js";
import { LIGHT_VOLUME_SLICES } from "./lightVolumeGeometry.js";

test("lower quality reduces shadow maps and haze samples while retaining real lights and integrated brightness", () => {
  const lighting = createStageLighting();
  const before = lighting.backLights.map(light => ({ intensity: light.intensity, angle: light.angle }));
  lighting.setQuality({ shadowSize: 256, slices: 8 });
  const { camera } = createProjection(390, 300, STAGE_CAMERA);
  let volumes = 0;
  lighting.root.traverse(object => {
    if (object.name !== "spot-scattering-volume") return;
    volumes++; object.onBeforeRender(null, null, camera);
    assert.equal(object.geometry.getAttribute("position").count, 8 * 4);
    const uniforms = object.material.uniforms;
    assert.ok(Math.abs(uniforms.sampleSpacing.value * 8 - uniforms.volumeHalfSize.value.z * 2) < 1e-8);
  });
  assert.equal(volumes, 3);
  lighting.backLights.forEach((light, index) => {
    assert.equal(light.isSpotLight, true); assert.equal(light.shadow.mapSize.x, 256);
    assert.equal(light.intensity, before[index].intensity); assert.equal(light.angle, before[index].angle);
  });
  lighting.dispose(); lighting.root.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test("stronger physical spots preserve the previous avatar halos and still extinguish together", () => {
  const lighting = createStageLighting(), texture = new Texture();
  const halo = createDynamicActorHalo(texture, lighting.backLights);
  halo.update();
  lighting.backLights.forEach((light, i) => {
    assert.equal(light.intensity, BACK_LIGHTS[i].power * BACK_LIGHT_POWER_GAIN);
    assert.equal(halo.material.uniforms.haloCones.value[i].x, BACK_LIGHTS[i].power);
  });
  lighting.backLights[0].intensity = 0; halo.update();
  assert.equal(halo.material.uniforms.haloCones.value[0].x, 0);
  lighting.backLights[1].visible = false; halo.update();
  assert.equal(halo.material.uniforms.haloCones.value[1].x, 0);
  halo.material.dispose(); texture.dispose();
  lighting.dispose(); lighting.root.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test("the entire cone stays sampled through camera focal, roll and source changes without reallocating geometry", () => {
  const lighting = createStageLighting(), light = lighting.backLights[0];
  const beam = createLightBeam(light), volume = beam.children[0], uniforms = volume.material.uniforms;
  const buffer = volume.geometry.getAttribute("position").array;
  for (const focal of [14, 28, 85]) for (const roll of [-35, 0, 35]) {
    const { camera } = createProjection(760, 584, { ...STAGE_CAMERA, focal, roll });
    light.position.x += 15; light.target.position.z -= 10; light.angle += 0.005;
    volume.onBeforeRender(null, null, camera);
    assert.equal(volume.geometry.getAttribute("position").array, buffer);
    const axes = [uniforms.volumeRight.value, uniforms.volumeUp.value, uniforms.volumeForward.value];
    const center = uniforms.volumeCenter.value, halfSize = uniforms.volumeHalfSize.value;
    const source = uniforms.source.value, direction = uniforms.beamDirection.value;
    const length = uniforms.beamLength.value;
    assert.ok(Math.abs(uniforms.sampleSpacing.value * LIGHT_VOLUME_SLICES - halfSize.z * 2) < 1e-8,
      "Scattering weights must follow actual sample spacing as the camera moves");
    const tangent = new Vector3().crossVectors(direction, new Vector3(0, 1, 0)).normalize();
    const bitangent = new Vector3().crossVectors(direction, tangent).normalize();
    for (let i = 0; i < 72; i++) for (const fraction of [0, 0.3, 1]) {
      const angle = i * Math.PI * 2 / 72, radius = Math.tan(light.angle) * length * fraction;
      const point = source.clone().addScaledVector(direction, length * fraction)
        .addScaledVector(tangent, radius * Math.cos(angle)).addScaledVector(bitangent, radius * Math.sin(angle)).sub(center);
      axes.forEach((axis, dimension) => {
        assert.ok(Math.abs(point.dot(axis)) <= halfSize.getComponent(dimension) + 1e-6, "No clipped cone edges");
      });
    }
    const normal = new Vector3().crossVectors(axes[0], axes[1]);
    assert.ok(normal.dot(axes[2]) < -0.999, "Front-facing slices must remain visible from each camera");
  }
  volume.geometry.dispose(); volume.material.dispose();
  lighting.dispose(); lighting.root.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});
