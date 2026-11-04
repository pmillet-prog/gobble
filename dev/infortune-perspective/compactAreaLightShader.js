import { ShaderChunk } from "three";
import { areaLightSetup, hoistedAreaLightShader } from "./hoistAreaLightShader.js";

// RectAreaLight's LTC evaluation is large. Three normally duplicates that whole
// calculation per emitter before the driver sees the shader. A uniform-bound
// loop keeps one copy while evaluating the same sources in the same order.
// Point/spot/directional loops (including sampler-indexed shadows) are untouched.
const areaLoop = /#pragma unroll_loop_start\s+for\s*\(\s*int i = 0; i < NUM_RECT_AREA_LIGHTS; i \+\+\s*\)\s*\{([\s\S]*?)\}\s*#pragma unroll_loop_end/;
const original = ShaderChunk.lights_fragment_begin;
if (!areaLoop.test(original)) throw new Error("Adapt the wheel area-light shader to this Three.js version.");
const compact = original.replace(areaLoop, (_match, body) => `
  for ( int i = 0; i < min( NUM_RECT_AREA_LIGHTS, wheelAreaLightCount ); i ++ ) {${body}}
`);
const hoisted = original.replace(areaLoop, (_match, body) => `${areaLightSetup}
  for ( int i = 0; i < min( NUM_RECT_AREA_LIGHTS, wheelAreaLightCount ); i ++ ) {${body.replace(
    "RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
    "wheelDirectRectArea( rectAreaLight, geometryPosition, material, wheelLtcSpecular, wheelLtcDiffuse, wheelLtcFresnel, reflectedLight );",
  )}}
`);
const patched = new WeakSet();

export function compactAreaLightShader(root, { hoist = true } = {}) {
  let count = 0;
  root.traverse(object => { if (object.isRectAreaLight) count++; });
  if (!count) return;
  const lightCount = { value: count };
  root.traverse(object => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material?.isMeshStandardMaterial || patched.has(material)) continue;
      patched.add(material);
      const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = function (shader, renderer) {
        previousCompile.call(this, shader, renderer);
        shader.uniforms.wheelAreaLightCount = lightCount;
        shader.fragmentShader = "uniform int wheelAreaLightCount;\n" + shader.fragmentShader.replace("#include <lights_fragment_begin>", hoist ? hoisted : compact);
        if (hoist) shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>", hoistedAreaLightShader);
      };
      material.customProgramCacheKey = () => `${previousKey}|wheel-compact-area-lights-${hoist ? "v2" : "v1"}`;
      material.needsUpdate = true;
    }
  });
}
