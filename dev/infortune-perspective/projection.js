import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";

export const DEFAULT_CAMERA = Object.freeze({
  elevation: 20, perspective: 100, focal: 28, framing: 100,
  offsetX: 0, offsetY: -8, roll: 0,
});
export const STAGE_CAMERA = Object.freeze({ ...DEFAULT_CAMERA, framing: 78, offsetY: 10 });
export const INTERACTION_HEIGHT = 8;

export function createProjection(width, height, settings = DEFAULT_CAMERA) {
  return updateProjection({ camera: new PerspectiveCamera(45, 1, 1, 10000) }, width, height, settings);
}

// Reuse the same camera and matrices during a timeline instead of allocating a
// new Three.js camera on every animation frame.
export function updateProjection(projection, width, height, settings = projection.settings) {
  const value = { ...DEFAULT_CAMERA, ...settings };
  const baseDistance = 2000 - value.perspective / 100 * 1400;
  // Move with the lens (dolly zoom): preserve scale at the wheel center while
  // changing near/far proportions and the projected vertical vanishing point.
  const distance = baseDistance * value.focal / DEFAULT_CAMERA.focal;
  const elevation = value.elevation * Math.PI / 180;
  // A near plane fixed at 1 wastes depth precision as the long lens retreats.
  // Advance it by only a tenth of that retreat, leaving foreground room and
  // preserving the close/wide-angle camera's existing clipping and framing.
  const near = 1 + Math.max(0, distance - 600) * 0.1;
  const camera = projection.camera;
  camera.aspect = width / Math.max(1, height); camera.near = near;
  camera.position.set(0, distance * Math.sin(elevation), -distance * Math.cos(elevation));
  camera.lookAt(0, 0, 0);
  camera.rotateZ(value.roll * Math.PI / 180);
  camera.setFocalLength(value.focal);
  // Framing is an independent crop, never an automatic fit-to-bounds pass.
  camera.zoom = baseDistance / 600 * value.framing / 100;
  camera.setViewOffset(width, height, -value.offsetX * width / 100, -value.offsetY * height / 100, width, height);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  Object.assign(projection, { width, height, settings: value, distance });
  return projection;
}

export function projectPoint(x, y, projection, elevation = INTERACTION_HEIGHT) {
  const point = new Vector3(x - WHEEL_GEOMETRY.centerX, elevation, y - WHEEL_GEOMETRY.centerY).project(projection.camera);
  return { x: (point.x + 1) * projection.width / 2, y: (1 - point.y) * projection.height / 2 };
}

export function unprojectPoint(x, y, projection, elevation = INTERACTION_HEIGHT) {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(x / projection.width * 2 - 1, 1 - y / projection.height * 2), projection.camera);
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -elevation), new Vector3());
  return point ? { x: point.x + WHEEL_GEOMETRY.centerX, y: point.z + WHEEL_GEOMETRY.centerY } : null;
}
