import * as THREE from "three";
import { createLightBeam } from "./lightBeam.js";
import { createSpotFixture } from "./spotFixture.js";
import { createStageLedLighting } from "./stageLedLighting.js";

export const BACK_LIGHTS = Object.freeze([
  { color: "#83b7ff", position: [-560, 1040, 620], target: [-140, -150, -110], power: 520000, angle: 0.29 },
  { color: "#ffd6a0", position: [0, 1160, 690], target: [0, -150, -15], power: 640000, angle: 0.34 },
  { color: "#d9a0ef", position: [560, 1040, 620], target: [140, -150, -110], power: 520000, angle: 0.29 },
]);
// Aim includes both the portrait and the desk's specular point in the
// establishing shot. Each source owns its opening; no camera-facing glow card.
export const BACK_LIGHT_BEAM = Object.freeze({ distance: 2600, penumbra: 0.15 });
export const BACK_LIGHT_POWER_GAIN = 2.5;

export function createStageLighting({ ledSegments = 6 } = {}) {
  const root = new THREE.Group(); root.name = "black-stage-lighting";
  root.add(new THREE.HemisphereLight("#e8edf7", "#15121b", 0.14));
  const key = new THREE.DirectionalLight("#fff5e5", 1.6); key.position.set(-330, 600, -360); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -580, right: 580, top: 580, bottom: -580, near: 1, far: 2200 });
  key.shadow.normalBias = 0.35; key.shadow.bias = -0.0001; root.add(key);
  const fill = new THREE.DirectionalLight("#d5e5ff", 0.4); fill.position.set(350, 250, -300); root.add(fill);
  const leds = createStageLedLighting(ledSegments); root.add(leds.root);
  const spots = [];
  for (const fixture of BACK_LIGHTS) {
    const spot = new THREE.SpotLight(fixture.color, fixture.power * BACK_LIGHT_POWER_GAIN, BACK_LIGHT_BEAM.distance, fixture.angle, BACK_LIGHT_BEAM.penumbra, 2);
    // Preserve the artistic contour while boosting real lighting and haze.
    spot.userData.actorHaloPowerGain = BACK_LIGHT_POWER_GAIN;
    spot.name = "back-light"; spot.position.set(...fixture.position); spot.target.position.set(...fixture.target);
    spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 10;
    spot.shadow.bias = -0.00015; spot.shadow.normalBias = 0.25;
    // Enable once the portraits are ready, then capture their static shadows
    // with the wheel hidden during the environment probe. No per-spin refresh.
    spot.castShadow = false; spot.shadow.autoUpdate = false;
    spots.push(spot); root.add(spot, spot.target, createSpotFixture(spot), createLightBeam(spot));
  }
  return { root, backLights: spots,
    setQuality({ shadowSize, slices }) {
      for (const light of [key, ...spots]) if (light.shadow.mapSize.x !== shadowSize) {
        light.shadow.mapSize.set(shadowSize, shadowSize);
        light.shadow.map?.dispose(); light.shadow.map = null;
        light.shadow.needsUpdate = true;
      }
      root.traverse(object => object.userData.setVolumeSlices?.(slices));
    },
    prepareActorShadows() { for (const spot of spots) { spot.castShadow = true; spot.shadow.needsUpdate = true; } },
    dispose() { leds.dispose(); key.shadow.dispose(); for (const spot of spots) spot.shadow.dispose(); },
  };
}
