import { WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";
import { projectPoint } from "./projection.js";

export function screenWheelDiameter(projection) {
  const { centerX, centerY, pegOrbit } = WHEEL_GEOMETRY;
  const left = projectPoint(centerX - pegOrbit, centerY, projection);
  const right = projectPoint(centerX + pegOrbit, centerY, projection);
  return Math.max(1, Math.hypot(right.x - left.x, right.y - left.y));
}

// Measure the slide along the visible tangent in CSS pixels. Perspective and
// pixel density must not turn a small finger movement into a maximum impulse.
export function screenGestureTravel(from, to, point, projection, diameter = screenWheelDiameter(projection)) {
  const radius = point.radius * 640;
  const x = Math.cos(point.angle) * radius, y = Math.sin(point.angle) * radius;
  const a = projectPoint(WHEEL_GEOMETRY.centerX + x + y * 0.01, WHEEL_GEOMETRY.centerY + y - x * 0.01, projection);
  const b = projectPoint(WHEEL_GEOMETRY.centerX + x - y * 0.01, WHEEL_GEOMETRY.centerY + y + x * 0.01, projection);
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.0001) return 0;
  return ((to.x - from.x) * dx + (to.y - from.y) * dy) / length / Math.max(1, diameter);
}
