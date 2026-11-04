// Shared dimensions for drawing, contact and reading the result. Flexible
// blades bend; the teardrop is a rigid body on a torsion-spring pivot.
export const CLASSIC_PAWL = Object.freeze({
  id: "classic", length: 54, radius: 2, rootRadius: 2, thickness: 6,
  spring: 1600, damping: 34, stiffness: 1,
});
export const NEEDLE_PAWL = Object.freeze({
  id: "needle", length: 56, radius: 0.65, rootRadius: 2.5, thickness: 2.8,
  spring: 850, damping: 20, stiffness: 0.5,
});
export const PIVOT_PAWL = Object.freeze({
  id: "pivot", motion: "pivot", length: 27, radius: 0, rootRadius: 10.5, thickness: 1.6,
  supportScale: 0.5, pivotDistance: 285, height: 26.5,
  spring: 650, damping: 16, stiffness: 2.2,
});
export const PAWL_MODELS = Object.freeze({ classic: CLASSIC_PAWL, needle: NEEDLE_PAWL, pivot: PIVOT_PAWL });

export function pawlSpringDisplacement(angle, model) {
  return model.motion === "pivot" ? angle : angle * (1 + 0.12 * angle ** 2);
}

export function pawlHalfWidth(fraction, model = CLASSIC_PAWL) {
  // The short, wider root cannot reach a peg (even fully bent). The entire
  // contact region has exactly the radius used by the analytic collision arc.
  return model.radius + (model.rootRadius - model.radius) * Math.max(0, 1 - fraction / 0.38) ** 2;
}
