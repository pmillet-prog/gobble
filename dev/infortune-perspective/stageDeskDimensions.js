// Shared by the desk, its LED strips, displays and planar reflections.
export const DESK = Object.freeze({
  bottomY: -146, topBaseY: 109, frontTopBaseY: 29, topDepth: 10, bevel: 1.5,
  innerBottomRadius: 326, innerTopRadius: 320,
  outerBottomRadius: 422, outerTopRadius: 431,
  openingRadius: 318, topRadius: 431,
});
export const DESK_WALL_HEIGHT = DESK.topBaseY - DESK.bottomY;
export const DESK_WALL_CENTER_Y = (DESK.topBaseY + DESK.bottomY) / 2;
export const DESK_TOP_SURFACE_Y = DESK.topBaseY + DESK.topDepth + DESK.bevel;
export const DESK_FRONT_TOP_SURFACE_Y = DESK.frontTopBaseY + DESK.topDepth + DESK.bevel;
export const DESK_TRIM_Y = DESK.topBaseY + DESK.topDepth;
export const DESK_SCREEN_TEXT = Object.freeze({
  arcWidth: 0.82, topY: 103, bottomY: 12,
  nameY: 87, amountY: 52, captionY: 20,
});

export function deskTopBaseAt(angle) {
  // Rear semicircle stays high; a smooth 30-degree shoulder on either side
  // joins the low 120-degree front arc, centered on the player's side (-Z).
  const folded = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
  const t = Math.max(0, Math.min(1, (folded - Math.PI / 2) / (Math.PI / 6)));
  const blend = t * t * t * (t * (t * 6 - 15) + 10);
  return DESK.topBaseY + (DESK.frontTopBaseY - DESK.topBaseY) * blend;
}

export function deskWallRadius(y, face, angle = 0) {
  const bottom = face === "inner" ? DESK.innerBottomRadius : DESK.outerBottomRadius;
  const top = face === "inner" ? DESK.innerTopRadius : DESK.outerTopRadius;
  return bottom + (top - bottom) * (y - DESK.bottomY) / (deskTopBaseAt(angle) - DESK.bottomY);
}
