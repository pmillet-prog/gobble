import { ShaderChunk, Vector3 } from "three";

export const REFLECTION_CENTER = Object.freeze([0, 55, 0]);
export const REFLECTION_FOCAL_REFERENCE = 28;
// Enclose the desk, its lower trim and the wheel even at the shortest lens.
export const MIN_REFLECTION_RADIUS = 500;
export const DEFAULT_REFLECTIONS = Object.freeze({ enabled: false, radiusAtReference: 2100, actors: true });

export function reflectionRadius(focal, radiusAtReference = DEFAULT_REFLECTIONS.radiusAtReference) {
  return MIN_REFLECTION_RADIUS + (radiusAtReference - MIN_REFLECTION_RADIUS) * focal / REFLECTION_FOCAL_REFERENCE;
}

const sphereProjection = /* glsl */`
#ifdef USE_ENVMAP
uniform float stageSphereEnabled;
uniform float stageSphereRadius;
uniform vec3 stageSphereCenter;
varying vec3 vStageReflectionPosition;

vec3 stageSphereDirection( const in vec3 direction ) {
  if ( stageSphereEnabled < 0.5 ) return direction;
  vec3 origin = vStageReflectionPosition - stageSphereCenter;
  float c = dot( origin, origin ) - stageSphereRadius * stageSphereRadius;
  // A future object outside the proxy must not acquire an inverted reflection.
  if ( c >= 0.0 ) return direction;
  float b = dot( origin, direction );
  float distanceToSphere = -b + sqrt( max( b * b - c, 0.0 ) );
  return normalize( origin + distanceToSphere * direction );
}
#endif
`;

// Correct specular environment lookups, including clearcoat. Keep the PMREM
// roughness filtering and diffuse lighting; no new mesh, capture or render pass.
export function createSphericalReflections() {
  const uniforms = {
    stageSphereEnabled: { value: 1 },
    stageSphereRadius: { value: DEFAULT_REFLECTIONS.radiusAtReference },
    stageSphereCenter: { value: new Vector3(...REFLECTION_CENTER) },
  };
  const patched = new Set();
  const radianceLookup = "envMapRotation * reflectVec, roughness";
  if (!ShaderChunk.envmap_physical_pars_fragment.includes(radianceLookup)) {
    throw new Error("The spherical reflection shader must be adapted to this Three.js version.");
  }
  const environmentShader = sphereProjection + ShaderChunk.envmap_physical_pars_fragment.replace(
    radianceLookup, "envMapRotation * stageSphereDirection( reflectVec ), roughness",
  );
  return {
    apply(material) {
      if (patched.has(material)) return;
      patched.add(material);
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = function (shader, renderer) {
        previousCompile.call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = "#ifdef USE_ENVMAP\nvarying vec3 vStageReflectionPosition;\n#endif\n" + shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\n#ifdef USE_ENVMAP\nvStageReflectionPosition = worldPosition.xyz;\n#endif",
        );
        shader.fragmentShader = shader.fragmentShader.replace("#include <envmap_physical_pars_fragment>", environmentShader);
      };
      material.customProgramCacheKey = () => `${previousKey}|stage-spherical-reflections-v1`;
      material.needsUpdate = true;
    },
    update(projection, settings = DEFAULT_REFLECTIONS) {
      uniforms.stageSphereEnabled.value = settings.enabled ? 1 : 0;
      uniforms.stageSphereRadius.value = reflectionRadius(projection.settings.focal, settings.radiusAtReference);
    },
  };
}
