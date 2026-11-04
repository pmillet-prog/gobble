import { BoxGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, TorusGeometry, Vector2 } from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import fontData from "three/examples/fonts/helvetiker_bold.typeface.json" with { type: "json" };

const font = new FontLoader().parse(fontData);
const FACE_HEIGHT = 15.9;

function lettering(text, width, height, centerY) {
  const geometry = new TextGeometry(text, {
    font, size: 10, depth: 0.6, curveSegments: 4, steps: 1,
    bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 1,
  });
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const scale = Math.min(width / (max.x - min.x), height / (max.y - min.y));
  geometry.translate(-(min.x + max.x) / 2, -(min.y + max.y) / 2, 0);
  geometry.scale(scale, scale, 1);
  geometry.translate(0, centerY, 0);
  // Readable from the pawl/camera side (-Z), with the letter fronts facing up.
  geometry.rotateZ(Math.PI); geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, FACE_HEIGHT + 0.1, 0);
  return geometry;
}

function revolved(profile) {
  return new LatheGeometry(profile.map(([radius, height]) => new Vector2(radius, height)), 96);
}

export function createWheelHub() {
  const root = new Group(); root.name = "wheel-hub";
  const brass = new MeshStandardMaterial({ color: "#b88b48", metalness: 1, roughness: 0.3 });
  const gold = new MeshStandardMaterial({ color: "#edc471", metalness: 1, roughness: 0.26 });
  const enamel = new MeshPhysicalMaterial({
    color: "#0d2232", metalness: 0, roughness: 0.32,
    clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.65,
  });
  const ivory = new MeshPhysicalMaterial({
    color: "#f0e6ce", metalness: 0, roughness: 0.28,
    clearcoat: 0.45, clearcoatRoughness: 0.2,
  });
  function add(geometry, material, name) {
    const mesh = new Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  }

  // The bezel and its inset meet at r=69: no full metal cap underneath the
  // enamel face. The original hub footprint and stationary mounting remain.
  add(revolved([
    [0, 3.5], [74.5, 3.5], [77, 5.5], [77, 11.5],
    [75.5, 13], [70.5, 15.4], [69, 15.4],
  ]), brass, "hub-brass-bezel");
  add(revolved([[69, 15.4], [68, FACE_HEIGHT], [0, FACE_HEIGHT]]), enamel, "hub-navy-enamel");

  const title = [lettering("ROUE DE", 86, 13, 25), lettering("L'INFORTUNE", 116, 13, 3)];
  const fillet = new TorusGeometry(65.5, 0.28, 8, 96);
  fillet.rotateX(-Math.PI / 2); fillet.translate(0, FACE_HEIGHT + 0.28, 0);
  const divider = new BoxGeometry(34, 0.3, 0.5); divider.translate(0, FACE_HEIGHT + 0.15, -13);
  const ornaments = [...title, fillet.toNonIndexed(), divider.toNonIndexed()];
  add(mergeGeometries(ornaments), gold, "hub-gold-title");
  ornaments.forEach(geometry => geometry.dispose()); fillet.dispose(); divider.dispose();
  add(lettering("GOBBLE", 72, 13, -32), ivory, "hub-gobble-enamel");
  return root;
}
