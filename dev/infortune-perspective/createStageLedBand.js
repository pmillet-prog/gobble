import { AdditiveBlending, BackSide, CanvasTexture, CylinderGeometry, FrontSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "three";
import { deskWallRadius } from "./stageDeskDimensions.js";

export const LED_BANDS = Object.freeze([
  { name: "inner", centerY: 14, side: BackSide, direction: -1, radius: (y, angle = 0) => deskWallRadius(y, "inner", angle) },
  { name: "outer", centerY: -16, side: FrontSide, direction: 1, radius: (y, angle = 0) => deskWallRadius(y, "outer", angle) },
]);
export const LED_EMISSION = 5;

export function ledBandGeometry(face, height, offset) {
  const geometry = new CylinderGeometry(face.radius(face.centerY + height / 2) + face.direction * offset,
    face.radius(face.centerY - height / 2) + face.direction * offset, height, 192, 1, true);
  geometry.translate(0, face.centerY, 0);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const angle = Math.atan2(positions.getX(i), positions.getZ(i));
    const radius = face.radius(positions.getY(i), angle) + face.direction * offset;
    positions.setXYZ(i, Math.sin(angle) * radius, positions.getY(i), Math.cos(angle) * radius);
  }
  geometry.computeVertexNormals(); return geometry;
}

function stripTexture() {
  const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const context = canvas.getContext("2d"), halo = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  halo.addColorStop(0, "#ffffff"); halo.addColorStop(0.18, "#d9ffff");
  halo.addColorStop(0.4, "rgba(96,238,242,0.9)"); halo.addColorStop(1, "rgba(27,154,169,0)");
  context.fillStyle = halo; context.fillRect(0, 0, 64, 64);
  context.fillStyle = "#efffff"; context.fillRect(26, 21, 12, 22);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping; texture.repeat.set(224, 1); texture.anisotropy = 4; return texture;
}

function spillTexture() {
  const canvas = Object.assign(document.createElement("canvas"), { width: 1, height: 128 });
  const context = canvas.getContext("2d"), gradient = context.createLinearGradient(0, 0, 0, 128);
  for (const [stop, alpha] of [[0, 0], [0.25, 0.12], [0.5, 0.65], [0.75, 0.12], [1, 0]]) gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  context.fillStyle = gradient; context.fillRect(0, 0, 1, 128);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}

export function createStageLedBand() {
  const root = new Group(); root.name = "desk-led-band";
  const diodeTexture = stripTexture(), washTexture = spillTexture();
  for (const face of LED_BANDS) {
    function band(height, offset, material, name) {
      const mesh = new Mesh(ledBandGeometry(face, height, offset), material); mesh.name = `${face.name}-${name}`;
      root.add(mesh); return mesh;
    }
    band(17, 0.45, new MeshStandardMaterial({ color: "#061218", side: face.side, metalness: 0.65, roughness: 0.36 }), "led-recess");
    const spill = band(40, 0.85, new MeshBasicMaterial({ map: washTexture, color: "#46cfdb", side: face.side, opacity: 0.6,
      transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), "led-light-spill");
    const diodes = band(13, 1.1, new MeshStandardMaterial({ map: diodeTexture, color: "#000000",
      emissive: "#ffffff", emissiveMap: diodeTexture, emissiveIntensity: LED_EMISSION, side: face.side,
      transparent: true, blending: AdditiveBlending, depthWrite: false }), "led-diodes");
    spill.renderOrder = 1; diodes.renderOrder = 2;
  }
  // HDR emission enters the environment capture. Direct illumination of nearby
  // geometry comes from the matching area lights in stageLedLighting.js.
  return root;
}
