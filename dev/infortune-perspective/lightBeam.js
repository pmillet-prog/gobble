import { AdditiveBlending, Color, Group, Mesh, ShaderMaterial, Vector2, Vector3 } from "three";
import { createLightVolumeGeometry, LIGHT_VOLUME_SLICES, updateLightVolumeBounds } from "./lightVolumeGeometry.js";

const vertexShader = /* glsl */`
uniform vec3 volumeCenter;
uniform vec3 volumeHalfSize;
uniform vec3 volumeRight;
uniform vec3 volumeUp;
uniform vec3 volumeForward;
varying vec3 vWorldPosition;
void main() {
  vWorldPosition = volumeCenter + volumeRight * position.x * volumeHalfSize.x
    + volumeUp * position.y * volumeHalfSize.y + volumeForward * position.z * volumeHalfSize.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
}`;

const fragmentShader = /* glsl */`
#include <packing>
uniform vec3 beamColor;
uniform vec3 source;
uniform vec3 beamDirection;
uniform float beamIntensity;
uniform float beamRange;
uniform vec2 beamCone;
uniform float beamLength;
uniform vec3 volumeForward;
uniform float sampleSpacing;
uniform sampler2D occlusionMap;
uniform mat4 occlusionMatrix;
uniform vec2 texelSize;
uniform float hasOcclusion;
varying vec3 vWorldPosition;

float visibility() {
  if (hasOcclusion < 0.5) return 1.0;
  vec4 projected = occlusionMatrix * vec4(vWorldPosition, 1.0);
  if (projected.w <= 0.0) return 0.0;
  vec3 point = projected.xyz / projected.w;
  if (point.x < 0.0 || point.x > 1.0 || point.y < 0.0 || point.y > 1.0 || point.z > 1.0 || point.z < 0.0) return 0.0;
  float sum = 0.0;
  for (int x = 0; x < 2; x++) for (int y = 0; y < 2; y++) {
    vec2 offset = (vec2(float(x), float(y)) - 0.5) * texelSize * 3.0;
    float depth = unpackRGBAToDepth(texture2D(occlusionMap, point.xy + offset));
    sum += step(point.z - 0.0004, depth);
  }
  return sum * 0.25;
}

void main() {
  if (beamIntensity <= 0.0) discard;
  vec3 fromSource = vWorldPosition - source;
  float axialDistance = dot(fromSource, beamDirection);
  if (axialDistance <= 0.0 || axialDistance >= beamLength) discard;
  float distanceSquared = max(dot(fromSource, fromSource), 1.0);
  float distanceToSource = sqrt(distanceSquared);
  vec3 lightDirection = fromSource / distanceToSource;
  float cone = smoothstep(beamCone.x, beamCone.y, dot(lightDirection, beamDirection));
  if (cone < 0.001) discard;
  float rangeFade = beamRange > 0.0 ? pow(clamp(1.0 - pow(distanceToSource / beamRange, 4.0), 0.0, 1.0), 2.0) : 1.0;
  float irradiance = beamIntensity / distanceSquared * cone * rangeFade;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  // Mild forward scattering: looking toward a real source reveals more haze.
  const float g = 0.3;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * dot(lightDirection, viewDirection), 1.5);
  float stepLength = sampleSpacing / max(abs(dot(volumeForward, viewDirection)), 0.15);
  const float density = 0.00012;
  float fade = smoothstep(4.0, 24.0, axialDistance) * (1.0 - smoothstep(0.88, 1.0, axialDistance / beamLength));
  float scattering = density * stepLength * phase * exp(-density * distanceToSource) * fade * visibility();
  gl_FragColor = vec4(beamColor * irradiance, clamp(scattering, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Integrate lit haze through the cone, rather than draw its outer surface.
// All slices share one draw call per source; no animation or postprocess pass.
export function createLightBeam(light) {
  const root = new Group(); root.name = "soft-light-volume";
  const source = new Vector3(), direction = new Vector3(), center = new Vector3(), halfSize = new Vector3();
  const right = new Vector3(1, 0, 0), up = new Vector3(0, 1, 0), forward = new Vector3(0, 0, -1);
  const axes = [right, up, forward];
  const material = new ShaderMaterial({
    uniforms: {
      beamColor: { value: new Color(light.color) }, source: { value: source }, beamLength: { value: 0 },
      beamDirection: { value: direction }, beamIntensity: { value: light.intensity },
      beamRange: { value: light.distance }, beamCone: { value: new Vector2() },
      volumeCenter: { value: center }, volumeHalfSize: { value: halfSize },
      volumeRight: { value: right }, volumeUp: { value: up }, volumeForward: { value: forward }, sampleSpacing: { value: 0 },
      occlusionMap: { value: null }, occlusionMatrix: { value: light.shadow.matrix },
      texelSize: { value: new Vector2() }, hasOcclusion: { value: 0 },
    },
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    blending: AdditiveBlending,
  });
  const volume = new Mesh(createLightVolumeGeometry(), material);
  let slices = LIGHT_VOLUME_SLICES;
  root.userData.setVolumeSlices = value => {
    if (value === slices) return;
    slices = value; volume.geometry.dispose(); volume.geometry = createLightVolumeGeometry(slices);
  };
  volume.name = "spot-scattering-volume";
  // Placement is computed in the vertex shader for each camera (main view and
  // environment probe). Portraits have already written their silhouette depth.
  volume.frustumCulled = false; volume.renderOrder = 2;
  volume.onBeforeRender = (_renderer, _scene, camera) => {
    light.getWorldPosition(source);
    light.target.getWorldPosition(direction); direction.sub(source);
    const length = direction.length(); direction.normalize();
    camera.matrixWorld.extractBasis(right, up, forward); forward.negate();
    updateLightVolumeBounds(source, direction, length, Math.tan(light.angle) * length, axes, center, halfSize);
    const uniforms = material.uniforms;
    uniforms.beamColor.value.copy(light.color);
    uniforms.beamLength.value = length;
    uniforms.beamIntensity.value = light.visible ? light.intensity : 0;
    uniforms.beamRange.value = light.distance;
    uniforms.beamCone.value.set(Math.cos(light.angle), Math.max(Math.cos(light.angle) + 0.00001, Math.cos(light.angle * (1 - light.penumbra))));
    uniforms.sampleSpacing.value = halfSize.z * 2 / slices;
    uniforms.occlusionMap.value = light.shadow.map?.texture || null;
    uniforms.hasOcclusion.value = light.shadow.map ? 1 : 0;
    uniforms.texelSize.value.set(1 / light.shadow.mapSize.x, 1 / light.shadow.mapSize.y);
    material.uniformsNeedUpdate = true;
  };
  root.add(volume);
  return root;
}
