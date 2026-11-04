import { Group, RectAreaLight, UniformsLib, Vector3 } from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { LED_BANDS } from "./createStageLedBand.js";

const SEGMENTS_PER_BAND = 6;
const LTC_TEXTURES = ["LTC_FLOAT_1", "LTC_FLOAT_2", "LTC_HALF_1", "LTC_HALF_2"];
let users = 0;

// A small number of thin area emitters approximate the continuous LED strips.
// Their diffuse/specular contribution is evaluated by Three's PBR materials.
// RectAreaLight has no shadow maps; these remain a local fill, not a GI solver.
export function createStageLedLighting(segments = SEGMENTS_PER_BAND) {
  if (users === 0) RectAreaLightUniformsLib.init();
  users++;
  const root = new Group(); root.name = "desk-led-lighting";
  for (const face of LED_BANDS) {
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      const radius = face.radius(face.centerY, angle) + face.direction * 1.8;
      const width = 2 * radius * Math.sin(Math.PI / segments);
      const x = Math.sin(angle), z = Math.cos(angle);
      // Preserve total emitting area × luminance when grouping adjacent LEDs.
      const intensity = 8 * SEGMENTS_PER_BAND * Math.sin(Math.PI / SEGMENTS_PER_BAND) / (segments * Math.sin(Math.PI / segments));
      const light = new RectAreaLight("#55e6ed", intensity, width, 13);
      light.name = `${face.name}-led-light-${i}`;
      light.position.set(x * radius, face.centerY, z * radius);
      // The inner strip lights the wheel; the outer strip throws a gentle wash
      // outward and down, rather than sending light toward the audience's faces.
      const targetRadius = radius + face.direction * 120;
      light.lookAt(new Vector3(x * targetRadius, face.centerY - 35, z * targetRadius));
      root.add(light);
    }
  }
  let disposed = false;
  return { root, dispose() {
    if (disposed) return;
    disposed = true;
    if (--users === 0) for (const name of LTC_TEXTURES) {
      UniformsLib[name].dispose(); UniformsLib[name] = null;
    }
  } };
}
