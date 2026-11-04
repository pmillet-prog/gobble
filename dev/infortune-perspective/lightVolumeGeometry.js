import { BufferGeometry, Float32BufferAttribute } from "three";

export const LIGHT_VOLUME_SLICES = 24;

// View-aligned samples fill the cone's interior. Real depth testing against
// each slice stops haze behind the desk and alpha-tested portrait silhouettes,
// without a screen-depth copy or a second full-scene pass.
export function createLightVolumeGeometry(slices = LIGHT_VOLUME_SLICES) {
  const positions = [], indices = [];
  for (let i = 0; i < slices; i++) {
    const depth = 1 - 2 * (i + 0.5) / slices;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) positions.push(x, y, depth);
    const first = i * 4;
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// Tight camera-space bounds of the cone's apex and base circle.
export function updateLightVolumeBounds(source, direction, length, radius, axes, center, halfSize) {
  center.copy(source);
  for (let i = 0; i < 3; i++) {
    const alignment = direction.dot(axes[i]);
    const end = length * alignment;
    const spread = radius * Math.sqrt(Math.max(0, 1 - alignment * alignment));
    const min = Math.min(0, end - spread), max = Math.max(0, end + spread);
    center.addScaledVector(axes[i], (min + max) / 2);
    halfSize.setComponent(i, (max - min) / 2);
  }
}
