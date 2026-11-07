import * as THREE from "three";
import { STAGE_CONTESTANTS, STAGE_FLOOR } from "./stageFixtures.js";
import { createStageLedBand } from "./createStageLedBand.js";
import { createDeskScreen } from "./stageDeskScreen.js";
import { createDeskTopGeometry, createDeskWallGeometry, createDeskTrimGeometry, DESK_OUTER_TRIM } from "./stageDeskGeometry.js";
import { DESK, DESK_TOP_SURFACE_Y, DESK_FRONT_TOP_SURFACE_Y } from "./stageDeskDimensions.js";

export function createStageSet(contestants = STAGE_CONTESTANTS, { screenTextureWidth = 4096 } = {}) {
  const root = new THREE.Group(); root.name = "infortune-studio";
  const navy = new THREE.MeshStandardMaterial({ color: "#172c3b", roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: "#aa8752", metalness: 0.85, roughness: 0.34 });
  const top = new THREE.MeshPhysicalMaterial({ color: "#203b49", roughness: 0.38, metalness: 0.12, clearcoat: 0.2 });
  function mesh(geometry, material, position = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material); object.position.set(...position);
    object.castShadow = true; object.receiveShadow = true; root.add(object); return object;
  }
  function torus(radius, tube, y, material) {
    const object = mesh(new THREE.TorusGeometry(radius, tube, 8, 128), material, [0, y, 0]);
    object.rotation.x = Math.PI / 2; return object;
  }
  const floor = mesh(new THREE.CircleGeometry(1600, 128), new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.94, metalness: 0 }), [0, STAGE_FLOOR, 0]);
  floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  mesh(new THREE.CylinderGeometry(135, 180, 128, 64), navy, [0, -86, 0]);
  torus(176, 3, STAGE_FLOOR + 4, trim);

  // Full annular desk: the front can deliberately leave the frame. Its rear
  // section occludes the bottom of the cutouts through ordinary depth testing.
  const frontMaterial = top.clone(), shoulderMaterial = top.clone();
  const rearSurface = mesh(createDeskTopGeometry("rear"), top, [0, DESK.topBaseY, 0]);
  const frontSurface = mesh(createDeskTopGeometry("front"), frontMaterial, [0, DESK.topBaseY, 0]);
  mesh(createDeskTopGeometry("shoulders"), shoulderMaterial, [0, DESK.topBaseY, 0]);
  mesh(createDeskWallGeometry("outer"), navy);
  const screen = createDeskScreen(contestants, { textureWidth: screenTextureWidth });
  root.add(screen.mesh);
  mesh(createDeskTrimGeometry(DESK.openingRadius, 2), trim);
  mesh(createDeskTrimGeometry(DESK_OUTER_TRIM.radius, DESK_OUTER_TRIM.tube), trim);
  torus(426, 2, -137, trim);
  const underglow = new THREE.MeshBasicMaterial({ color: "#45b6b8", toneMapped: false });
  torus(430, 1.2, 18, underglow);
  root.add(createStageLedBand());

  // No lit wall, slats or title board behind the portraits: only the lights
  // and their atmospheric glow will be visible against the black background.
  return { root, setBanks: screen.setBanks, setSelected: screen.setSelected, reflectiveMaterials: [top, frontMaterial, shoulderMaterial, trim], reflectionSurfaces: [
    { surface: frontSurface, height: DESK_FRONT_TOP_SURFACE_Y, resolution: 512 },
    { surface: rearSurface, height: DESK_TOP_SURFACE_Y, resolution: 256 },
  ] };
}
