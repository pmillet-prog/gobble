// Convex hull of a round base centred on the axle and a pointed tip. The
// straight flanks meet the circle tangentially, matching the visible outline.
export function pivotPawlOutline(model, segments = 64) {
  const radius = model.rootRadius, tangentAngle = Math.asin(radius / model.length);
  const points = [{ x: 0, y: model.length }];
  for (let i = 0; i <= segments; i++) {
    const angle = tangentAngle - (Math.PI + 2 * tangentAngle) * i / segments;
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return points;
}

export function pivotPegExclusion(x, y, pegRadius, model) {
  const distance = Math.hypot(x, y), length = model.length, radius = model.rootRadius;
  if (distance >= length + pegRadius) return null;
  // Rotation cannot clear a peg intersecting the circular hub. Current models
  // keep that hub outside the complete peg orbit, including peg thickness.
  if (distance <= radius + pegRadius) throw new RangeError("The pivot base must remain outside the peg orbit.");
  const center = Math.atan2(-x, y);
  const tipTangency = Math.sqrt(length * length + 2 * radius * pegRadius + pegRadius * pegRadius);
  // Offset the actual flank by the peg radius. Beyond its tangency with the
  // tip's circular exclusion, the contact is against the sharp tip itself.
  const halfAngle = distance <= tipTangency
    ? Math.asin((radius + pegRadius) / distance) - Math.asin(radius / length)
    : Math.acos(Math.max(-1, Math.min(1, (distance * distance + length * length - pegRadius * pegRadius) / (2 * distance * length))));
  return { min: center - halfAngle, max: center + halfAngle, center };
}
