import { CLASSIC_PAWL } from "./wheelPawlModels.js";
import { pivotPegExclusion } from "./pivotPawlGeometry.js";

// Shared by the SVG, the collision model and the result reader, in SVG units.
export const WHEEL_GEOMETRY = Object.freeze({
  centerX: 320,
  centerY: 334,
  pivotX: 320,
  pivotY: 24,
  pegOrbit: 270,
  pegRadius: 4,
  pawlLength: CLASSIC_PAWL.length,
  pawlRadius: CLASSIC_PAWL.radius,
});

const { centerY, pivotY, pegOrbit } = WHEEL_GEOMETRY;
const pivotDistance = centerY - pivotY;

export function pawlPivotDistance(model = CLASSIC_PAWL) {
  return model.pivotDistance ?? pivotDistance;
}

export function pegPosition(angle, model = CLASSIC_PAWL) {
  return { x: pegOrbit * Math.sin(angle), y: pawlPivotDistance(model) - pegOrbit * Math.cos(angle) };
}

// One elastic bending mode: an inextensible circular arc, fixed vertically at
// its root. `bend` is total curvature angle, not a rotation of the whole blade.
// For the rigid pivot model the same state variable is instead the axle angle.
export function pawlPoint(bend, fraction = 1, model = CLASSIC_PAWL) {
  const pawlLength = model.length;
  if (model.motion === "pivot") return { x: -Math.sin(bend) * pawlLength * fraction, y: Math.cos(bend) * pawlLength * fraction };
  if (Math.abs(bend) < 0.00001) return { x: -pawlLength * bend * fraction ** 2 / 2, y: pawlLength * fraction };
  const radius = pawlLength / bend;
  return { x: radius * (Math.cos(bend * fraction) - 1), y: radius * Math.sin(bend * fraction) };
}

export function pawlTip(bend, model = CLASSIC_PAWL) {
  const end = pawlPoint(bend, 1, model);
  return { x: end.x - model.radius * Math.sin(bend), y: end.y + model.radius * Math.cos(bend) };
}

export function pawlPath(bend, model = CLASSIC_PAWL) {
  const end = pawlPoint(bend, 1, model);
  if (model.motion === "pivot" || Math.abs(bend) < 0.00001) return `M 0 0 L ${end.x} ${end.y}`;
  const radius = Math.abs(model.length / bend);
  return `M 0 0 A ${radius} ${radius} 0 0 ${bend > 0 ? 1 : 0} ${end.x} ${end.y}`;
}

function distanceToBlade(bend, x, y, pawlLength) {
  if (Math.abs(bend) < 0.00001) return Math.hypot(x, y - Math.max(0, Math.min(pawlLength, y)));
  const radius = pawlLength / bend;
  const sign = Math.sign(bend);
  const angle = Math.atan2(y * sign, (x + radius) * sign);
  const closest = Math.max(Math.min(0, bend), Math.min(Math.max(0, bend), angle));
  return Math.hypot(x - radius * (Math.cos(closest) - 1), y - radius * Math.sin(closest));
}

// Curvature interval in which the circular metal peg overlaps the actual arc
// drawn by SVG. Circle tangencies give the side bounds; only contacts near the
// free tip require bisection. The blade therefore releases through geometry,
// never through a prescribed bend threshold or an outcome-dependent timer.
export function pegExclusion(angle, pegRadius = WHEEL_GEOMETRY.pegRadius, model = CLASSIC_PAWL) {
  const contactRadius = pegRadius + model.radius, pawlLength = model.length;
  const { x, y } = pegPosition(angle, model);
  if (model.motion === "pivot") return pivotPegExclusion(x, y, pegRadius, model);
  const distanceSquared = x * x + y * y;
  if (distanceSquared >= (pawlLength + contactRadius) ** 2) return null;
  let min = 2 * pawlLength * (-x - contactRadius) / (distanceSquared - contactRadius ** 2);
  let max = 2 * pawlLength * (-x + contactRadius) / (distanceSquared - contactRadius ** 2);
  let inside = -2 * pawlLength * x / distanceSquared;
  const gap = bend => distanceToBlade(bend, x, y, pawlLength) - contactRadius;
  if (gap(inside) > 0) {
    // A tip can graze a peg without the centerline reaching its center.
    let left = min, right = max;
    for (let i = 0; i < 18; i++) {
      const first = (2 * left + right) / 3, second = (left + 2 * right) / 3;
      if (gap(first) < gap(second)) right = second;
      else left = first;
    }
    inside = (left + right) / 2;
    if (gap(inside) >= 0) return null;
  }
  if (gap(min) > 1e-9) {
    let outside = min, contact = inside;
    for (let i = 0; i < 24; i++) {
      const middle = (outside + contact) / 2;
      if (gap(middle) > 0) outside = middle;
      else contact = middle;
    }
    min = outside;
  }
  if (gap(max) > 1e-9) {
    let outside = max, contact = inside;
    for (let i = 0; i < 24; i++) {
      const middle = (outside + contact) / 2;
      if (gap(middle) > 0) outside = middle;
      else contact = middle;
    }
    max = outside;
  }
  return { min, max, center: (min + max) / 2 };
}

export function contactSlope(angle, side, pegRadius = WHEEL_GEOMETRY.pegRadius, model = CLASSIC_PAWL) {
  const epsilon = 0.00001;
  const before = pegExclusion(angle - epsilon, pegRadius, model), after = pegExclusion(angle + epsilon, pegRadius, model);
  if (!before || !after) return 0;
  const key = side < 0 ? "min" : "max";
  return Math.max(-30, Math.min(30, (after[key] - before[key]) / (2 * epsilon)));
}
