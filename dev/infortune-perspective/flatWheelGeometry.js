import { WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";

// One frame for both Canvas drawing and pointer mapping, including the room
// reserved for the two desks on narrow screens.
export function flatWheelLayout(width, height) {
  const shallow = height < 280, compact = !shallow && width < 560;
  const header = shallow ? 12 : compact ? height < 420 ? 112 : 150 : 72, footer = shallow ? 8 : 40;
  const side = Math.max(1, Math.min(width * (shallow ? .48 : compact ? .98 : .68), height - header - footer));
  return { side, left: (width - side) / 2, top: header + Math.max(0, (height - header - footer - side) / 2), compact, shallow };
}

export function flatWheelPoint(x, y, width, height) {
  const { side, left, top } = flatWheelLayout(width, height), scale = side / 640;
  const localX = (x - left) / scale - WHEEL_GEOMETRY.centerX;
  const localY = (y - top) / scale - WHEEL_GEOMETRY.centerY;
  return { angle: Math.atan2(localY, localX), radius: Math.hypot(localX, localY) / 640 };
}
export function flatWheelDiameter(width, height) {
  return flatWheelLayout(width, height).side * WHEEL_GEOMETRY.pegOrbit * 2 / 640;
}
export function flatWheelTravel(from, to, point, diameter) {
  return (-(to.x - from.x) * Math.sin(point.angle) + (to.y - from.y) * Math.cos(point.angle)) / Math.max(1, diameter);
}
