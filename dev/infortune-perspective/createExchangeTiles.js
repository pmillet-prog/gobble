import * as THREE from "three";
import { EXCHANGE_SECTORS, EXCHANGE_SECTOR_INDICES } from "../../shared/infortuneWheel.js";
import { createTileShape, SECTOR_ANGLE, TILE_BASE, TILE_BEVEL, tileExtrusion } from "./tileGeometry.js";
import { createSectorLettering } from "./wheelTextures.js";
import { exchangeTilePose } from "./exchangeArrival.js";

export function createExchangeTiles(rotor, { underlays = [], createLettering = createSectorLettering } = {}) {
  const shape = createTileShape(), texture = createLettering(EXCHANGE_SECTORS[EXCHANGE_SECTOR_INDICES[0]]);
  const metal = new THREE.MeshPhysicalMaterial({ color: "#56d9e9", metalness: 0.5, roughness: 0.29, clearcoat: 0.45 });
  const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02, depthWrite: false });
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false, curveSegments: 10 });
  geometry.rotateX(-Math.PI / 2);
  const lettering = new THREE.ShapeGeometry(shape, 10), positions = lettering.getAttribute("position"), uv = lettering.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) uv.setXY(i, (positions.getX(i) + 36) / 72, (positions.getY(i) - 72) / 178);
  lettering.rotateX(-Math.PI / 2);
  const tiles = EXCHANGE_SECTOR_INDICES.map(index => {
    const pivot = new THREE.Group(), tile = new THREE.Group(); pivot.rotation.y = -(index + 0.5) * SECTOR_ANGLE;
    pivot.add(tile); rotor.add(pivot);
    const plate = new THREE.Mesh(geometry, metal), label = new THREE.Mesh(lettering, labelMaterial);
    plate.receiveShadow = true; label.position.y = 0.57; tile.add(plate, label);
    tile.userData.base = TILE_BASE + tileExtrusion(index).depth + TILE_BEVEL + 0.15;
    tile.visible = false;
    return tile;
  });
  return { tiles, update(progress) {
    tiles.forEach((tile, index) => {
      const pose = exchangeTilePose(progress, index);
      tile.visible = pose.visible; tile.position.y = tile.userData.base + pose.height; tile.rotation.z = pose.tilt;
      // The original metal plate stays underneath. Once covered, its painted
      // amount must never bleed through, regardless of camera/depth precision.
      const label = underlays[EXCHANGE_SECTOR_INDICES[index]]?.label;
      if (label) label.visible = !pose.landed;
    });
  } };
}
