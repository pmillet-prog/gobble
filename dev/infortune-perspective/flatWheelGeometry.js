import { WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";

export function flatWheelPoint(x, y, width, height) {
  const side = Math.max(1, Math.min(width, height)), scale = side / 640;
  const localX = (x - (width - side) / 2) / scale - WHEEL_GEOMETRY.centerX;
  const localY = (y - (height - side) / 2) / scale - WHEEL_GEOMETRY.centerY;
  return { angle: Math.atan2(localY, localX), radius: Math.hypot(localX, localY) / 640 };
}
export function flatWheelTravel(from, to, point, width) {
  return (-(to.x - from.x) * Math.sin(point.angle) + (to.y - from.y) * Math.cos(point.angle)) / Math.max(1, width);
}
