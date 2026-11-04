import { BufferAttribute, BufferGeometry, CylinderGeometry, BoxGeometry, DynamicDrawUsage, Group, Mesh, MeshPhysicalMaterial } from "three";
import { pawlPoint, pawlPivotDistance, WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";
import { CLASSIC_PAWL, pawlHalfWidth } from "../../src/features/infortune/wheelPawlModels.js";
import { createPivotPawlMesh } from "./pivotPawlMesh.js";

const SEGMENTS = 48;
const CROSS_SECTION = [[-1.4, -3], [1.4, -3], [2, -2.4], [2, 2.4], [1.4, 3], [-1.4, 3], [-2, 2.4], [-2, -2.4]];
export const BLADE_HEIGHT = 18;

export function createBladeGeometry(model = CLASSIC_PAWL) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array((SEGMENTS + 1) * CROSS_SECTION.length * 3), 3).setUsage(DynamicDrawUsage));
  const indices = [], ring = CROSS_SECTION.length;
  for (let segment = 0; segment < SEGMENTS; segment++) for (let j = 0; j < ring; j++) {
    const a = segment * ring + j, b = segment * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    indices.push(a, b, c, b, d, c);
  }
  for (let j = 1; j < ring - 1; j++) {
    indices.push(0, j + 1, j);
    const last = SEGMENTS * ring; indices.push(last, last + j, last + j + 1);
  }
  geometry.setIndex(indices); updateBladeGeometry(geometry, 0, model);
  return geometry;
}

export function updateBladeGeometry(geometry, bend, model = CLASSIC_PAWL) {
  const positions = geometry.getAttribute("position"), baseZ = WHEEL_GEOMETRY.pivotY - WHEEL_GEOMETRY.centerY;
  for (let i = 0; i <= SEGMENTS; i++) {
    const fraction = i / SEGMENTS, point = pawlPoint(bend, fraction, model), angle = bend * fraction;
    const widthScale = pawlHalfWidth(fraction, model) / 2;
    for (let j = 0; j < CROSS_SECTION.length; j++) {
      const side = CROSS_SECTION[j][0] * widthScale, height = CROSS_SECTION[j][1] * model.thickness / 6;
      positions.setXYZ(i * CROSS_SECTION.length + j, point.x + Math.cos(angle) * side, BLADE_HEIGHT + height, baseZ + point.y + Math.sin(angle) * side);
    }
  }
  positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
}

export function createPawlMesh(chrome, brass) {
  const group = new Group(); group.name = "fixed-pawl-support";
  const baseZ = WHEEL_GEOMETRY.pivotY - WHEEL_GEOMETRY.centerY;
  const foot = new Mesh(new BoxGeometry(32, 14, 30), chrome);
  foot.position.set(0, -14, baseZ - 4); group.add(foot);
  const post = new Mesh(new CylinderGeometry(7, 9, 28, 20), chrome);
  post.position.set(0, 3, baseZ); group.add(post);
  const housing = new Mesh(new CylinderGeometry(12, 14, 7, 32), brass);
  housing.position.set(0, 18, baseZ); group.add(housing);
  const bolt = new Mesh(new CylinderGeometry(5, 5, 3, 16), chrome);
  bolt.position.set(0, 23, baseZ); group.add(bolt);
  const slot = new Mesh(new BoxGeometry(5.5, 0.2, 0.9), new MeshPhysicalMaterial({ color: "#202734", roughness: 0.8 }));
  slot.position.set(0, 24.6, baseZ); group.add(slot);
  const support = [foot, post, housing, bolt, slot].map(mesh => ({ mesh, position: mesh.position.clone() }));
  const geometry = createBladeGeometry();
  const blade = new Mesh(geometry, new MeshPhysicalMaterial({ color: "#de3028", metalness: 0.35, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
  blade.name = "flexible-pawl"; group.add(blade);
  const tip = new Mesh(new CylinderGeometry(WHEEL_GEOMETRY.pawlRadius, WHEEL_GEOMETRY.pawlRadius, 6, 16, 1, false, -Math.PI / 2, Math.PI), blade.material);
  tip.position.set(0, BLADE_HEIGHT, baseZ + WHEEL_GEOMETRY.pawlLength); group.add(tip);
  const pivot = createPivotPawlMesh(); pivot.position.set(0, BLADE_HEIGHT, baseZ); group.add(pivot);
  group.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  let lastBend = 0, lastModel = CLASSIC_PAWL;
  return { group, update(bend, model = CLASSIC_PAWL) {
    if (bend === lastBend && model === lastModel) return;
    const rigid = model.motion === "pivot";
    const scale = model.supportScale || 1;
    group.position.set(0, (model.height ?? BLADE_HEIGHT) - BLADE_HEIGHT, -pawlPivotDistance(model) - baseZ);
    for (const { mesh, position } of support) {
      const upright = mesh === foot || mesh === post;
      mesh.scale.set(scale, upright ? 1 : scale, scale);
      mesh.position.set(position.x * scale, upright ? position.y : BLADE_HEIGHT + (position.y - BLADE_HEIGHT) * scale,
        baseZ + (position.z - baseZ) * scale);
    }
    pivot.visible = rigid; blade.visible = tip.visible = !rigid;
    if (rigid) pivot.rotation.y = -bend;
    else {
      updateBladeGeometry(geometry, bend, model);
      const point = pawlPoint(bend, 1, model); tip.position.set(point.x, BLADE_HEIGHT, baseZ + point.y); tip.rotation.y = -bend;
      tip.scale.set(model.radius / WHEEL_GEOMETRY.pawlRadius, model.thickness / 6, model.radius / WHEEL_GEOMETRY.pawlRadius);
    }
    lastBend = bend; lastModel = model;
  } };
}
