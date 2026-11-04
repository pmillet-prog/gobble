import { MathUtils, Vector3 } from "three";

export const MAX_CONTOUR_DISTANCE = 128;
export const DEFAULT_ACTOR_SHADE = Object.freeze({ edge: 3, fade: 45, strength: 98 });

export function createActorShadeState() {
  const uniform = { value: new Vector3() };
  function update(value) {
    uniform.value.set(MathUtils.clamp(value.edge, 0, 24), MathUtils.clamp(value.fade, 2, 96), MathUtils.clamp(value.strength, 0, 100) / 100);
  }
  update(DEFAULT_ACTOR_SHADE);
  return { uniform, update };
}
