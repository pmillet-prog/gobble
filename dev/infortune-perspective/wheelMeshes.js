import * as THREE from "three";
import { PEG_COUNT, TAU, WHEEL_SECTORS } from "../../src/features/infortune/wheelConfig.js";
import { WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";
import { createPawlMesh } from "./pawlMesh.js";
import { createSectorLettering } from "./wheelTextures.js";
import { createTileShape, SECTOR_ANGLE, TILE_BASE, TILE_BEVEL, TILE_FIXINGS, tileExtrusion } from "./tileGeometry.js";
import { PEG_RADIUS, PEG_BASE, PEG_HEIGHT } from "./wheelDimensions.js";
import { createWheelRimGeometries } from "./wheelRimGeometry.js";
import { createWheelHub } from "./wheelHub.js";

export function createWheelMeshes() {
  const root = new THREE.Group(), rotor = new THREE.Group();
  root.name = "wheel"; rotor.name = "rotating-wheel"; root.add(rotor);
  const chrome = new THREE.MeshStandardMaterial({ color: "#9ea7b1", metalness: 1, roughness: 0.24 });
  const brass = new THREE.MeshStandardMaterial({ color: "#a77b3d", metalness: 1, roughness: 0.36 });
  const dark = new THREE.MeshStandardMaterial({ color: "#202a3a", metalness: 0.55, roughness: 0.4 });
  const gold = new THREE.MeshPhysicalMaterial({ color: "#edb32e", metalness: 1, roughness: 0.28, clearcoat: 0.2, clearcoatRoughness: 0.3 });
  const transform = new THREE.Object3D();

  const rim = createWheelRimGeometries();
  rotor.add(new THREE.Mesh(rim.dark, dark), new THREE.Mesh(rim.brass, brass));
  const edge = new THREE.Mesh(new THREE.TorusGeometry(289, 3, 12, 144), chrome);
  edge.rotation.x = -Math.PI / 2; edge.position.y = 3; rotor.add(edge);

  const shape = createTileShape(), lettering = new Map(), tiles = [];
  const fixings = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 1.4, 5.2, 10), chrome, WHEEL_SECTORS.length * 2);
  const washers = new THREE.InstancedMesh(new THREE.TorusGeometry(3.1, 0.4, 6, 16), chrome, WHEEL_SECTORS.length * 2);
  WHEEL_SECTORS.forEach((sector, index) => {
    const angle = (index + 0.5) * SECTOR_ANGLE;
    const golden = sector.kind === "bonus" || sector.amount === 1000;
    const extrusion = tileExtrusion(index, golden);
    const tile = new THREE.Group(); tile.rotation.y = -angle; rotor.add(tile);
    const paint = golden ? gold : new THREE.MeshPhysicalMaterial({
      color: sector.color, roughness: 0.34 + index % 3 * 0.02, metalness: 0,
      clearcoat: 0.42, clearcoatRoughness: 0.23, envMapIntensity: 0.85,
    });
    const tileGeometry = new THREE.ExtrudeGeometry(shape, extrusion);
    tileGeometry.rotateX(-Math.PI / 2);
    const tileMesh = new THREE.Mesh(tileGeometry, paint); tileMesh.position.y = TILE_BASE; tile.add(tileMesh);
    const top = TILE_BASE + extrusion.depth + TILE_BEVEL;
    if (golden) {
      const backingGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 10 });
      backingGeometry.rotateX(-Math.PI / 2);
      const backing = new THREE.Mesh(backingGeometry, brass); backing.position.y = 0.6; tile.add(backing);
    }
    const key = `${sector.kind}-${sector.amount}`;
    if (!lettering.has(key)) lettering.set(key, createSectorLettering(sector));
    const labelGeometry = new THREE.ShapeGeometry(shape, 10);
    const positions = labelGeometry.getAttribute("position"), uv = labelGeometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) uv.setXY(i, (positions.getX(i) + 36) / 72, (positions.getY(i) - 72) / 178);
    labelGeometry.rotateX(-Math.PI / 2);
    // A slope-dependent bias pulls the paint through an overlaid metal tile at
    // shallow camera angles. Keep only a small, angle-independent depth bias.
    const label = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ map: lettering.get(key), transparent: true, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1 }));
    label.position.y = top + 0.02; tile.add(label);
    tiles.push({ tile, label });
    TILE_FIXINGS.forEach((fixing, fixingIndex) => {
      const x = fixing.x * Math.cos(angle) + fixing.y * Math.sin(angle);
      const z = fixing.x * Math.sin(angle) - fixing.y * Math.cos(angle);
      transform.position.set(x, 2.6, z); transform.rotation.set(0, 0, 0); transform.updateMatrix();
      fixings.setMatrixAt(index * 2 + fixingIndex, transform.matrix);
      transform.position.y = top + 0.25; transform.rotation.x = -Math.PI / 2; transform.updateMatrix();
      washers.setMatrixAt(index * 2 + fixingIndex, transform.matrix);
    });
  });
  rotor.add(fixings, washers);

  // Cylindrical walls reflect mostly the dark horizon, unlike the upward
  // facing crowns. Longitudinal polishing stretches real specular highlights
  // along the stem; no painted highlight or emission. UV v is the shaft axis.
  const pegSteel = new THREE.MeshPhysicalMaterial({
    color: chrome.color, metalness: 1, roughness: 0.22,
    anisotropy: 0.65, anisotropyRotation: Math.PI / 2,
  });
  const pegGeometry = new THREE.CylinderGeometry(PEG_RADIUS, PEG_RADIUS, PEG_HEIGHT, 24, 1, true);
  pegGeometry.computeTangents();
  const pegs = new THREE.InstancedMesh(pegGeometry, pegSteel, PEG_COUNT);
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(PEG_RADIUS, 24, 8), chrome, PEG_COUNT);
  const sockets = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.6, 3, 1.2, 16), chrome, PEG_COUNT);
  pegs.name = "vertical-metal-pegs";
  for (let i = 0; i < PEG_COUNT; i++) {
    const angle = i * TAU / PEG_COUNT;
    transform.rotation.set(0, 0, 0); transform.scale.set(1, 1, 1);
    transform.position.set(Math.sin(angle) * WHEEL_GEOMETRY.pegOrbit, PEG_BASE + PEG_HEIGHT / 2, -Math.cos(angle) * WHEEL_GEOMETRY.pegOrbit);
    transform.updateMatrix(); pegs.setMatrixAt(i, transform.matrix);
    transform.position.y = PEG_BASE + PEG_HEIGHT; transform.scale.y = 0.28; transform.updateMatrix(); caps.setMatrixAt(i, transform.matrix);
    transform.position.y = PEG_BASE; transform.scale.y = 1; transform.updateMatrix(); sockets.setMatrixAt(i, transform.matrix);
  }
  rotor.add(pegs, caps, sockets);

  root.add(createWheelHub());
  const pawl = createPawlMesh(chrome, brass); root.add(pawl.group);
  root.traverse(object => {
    if (object.isMesh && !object.material.transparent) { object.castShadow = true; object.receiveShadow = true; }
  });
  return { root, rotor, pawl, tiles };
}
