import { Color, LinearMipmapLinearFilter, LinearSRGBColorSpace, Matrix4, NoToneMapping, PlaneGeometry } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { DESK_TOP_SURFACE_Y } from "./stageDeskDimensions.js";

const REFLECTION_LAYER = 1;
const reflectionUniforms = new WeakMap();
const declarations = /* glsl */`
uniform sampler2D stageActorReflection;
uniform mat4 stageActorProjection;
uniform float stageActorsReflected;
uniform float stageActorReflectionHeight;
varying vec3 vActorReflectionPosition;
vec3 withActorReflection(vec3 environment, float roughness) {
  if (stageActorsReflected < 0.5 || abs(vActorReflectionPosition.y - stageActorReflectionHeight) > 1.6) return environment;
  vec4 projected = stageActorProjection * vec4(vActorReflectionPosition, 1.0);
  if (projected.w <= 0.0) return environment;
  vec2 uv = projected.xy / projected.w;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return environment;
  vec4 reflected = texture2D(stageActorReflection, uv, 1.2 + roughness * 4.0);
  // The transparent render target contains premultiplied colour; filter both
  // colour and coverage together to keep soft silhouettes free of dark fringes.
  return environment * (1.0 - clamp(reflected.a, 0.0, 1.0)) + reflected.rgb;
}
`;

export function createActorReflections(renderer, scene, surface, actors, lighting, { height = DESK_TOP_SURFACE_Y, resolution = 512 } = {}) {
  // Reflector supplies the reflected camera and oblique clipping plane. It is
  // never added to the scene: only the existing desk material samples its image.
  const helper = new Reflector(new PlaneGeometry(1, 1), { textureWidth: resolution, textureHeight: resolution, multisample: 0 });
  helper.rotation.x = -Math.PI / 2; helper.position.y = height; helper.updateMatrixWorld(true);
  helper.camera.layers.set(REFLECTION_LAYER);
  const target = helper.getRenderTarget();
  target.texture.generateMipmaps = true; target.texture.minFilter = LinearMipmapLinearFilter;
  target.texture.colorSpace = LinearSRGBColorSpace;
  const inversePlane = helper.matrixWorld.clone().invert();
  const uniforms = { stageActorReflection: { value: target.texture }, stageActorProjection: { value: new Matrix4() },
    stageActorsReflected: { value: 0 }, stageActorReflectionHeight: { value: height } };
  reflectionUniforms.set(surface, uniforms);
  let ready = false, dirty = true;
  const lights = []; lighting.traverse(object => { if (object.isLight) { object.layers.enable(REFLECTION_LAYER); lights.push(object); } });
  const lightSnapshot = new Float64Array(lights.length * 14).fill(NaN);
  let snapshotIndex = 0, lightingChanged = false;
  function compareLightValue(value) {
    if (lightSnapshot[snapshotIndex] !== value) lightingChanged = true;
    lightSnapshot[snapshotIndex++] = value;
  }
  function compareVector(value) {
    compareLightValue(value?.x || 0); compareLightValue(value?.y || 0); compareLightValue(value?.z || 0);
  }
  function lightsChanged() {
    lightingChanged = false; snapshotIndex = 0;
    for (const light of lights) {
      compareVector(light.position); compareVector(light.target?.position);
      compareLightValue(light.color.r); compareLightValue(light.color.g); compareLightValue(light.color.b);
      compareLightValue(light.intensity); compareLightValue(light.angle || 0); compareLightValue(light.penumbra || 0);
      compareLightValue(light.distance || 0); compareLightValue(light.visible ? 1 : 0);
    }
    return lightingChanged;
  }
  return {
    prepare() {
      if (ready) return;
      actors.traverse(object => object.layers.enable(REFLECTION_LAYER));
      // Static opaque parts of the desk can occlude a reflected portrait. The
      // reflecting surface itself must never sample the target being written.
      surface.parent.traverse(object => {
        if (object.isMesh && object !== surface && !object.material.transparent) object.layers.enable(REFLECTION_LAYER);
      });
      const previousCompile = surface.material.onBeforeCompile, previousKey = surface.material.customProgramCacheKey();
      surface.material.onBeforeCompile = function (shader, activeRenderer) {
        previousCompile.call(this, shader, activeRenderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = "varying vec3 vActorReflectionPosition;\n" + shader.vertexShader.replace(
          "#include <worldpos_vertex>", "#include <worldpos_vertex>\nvActorReflectionPosition = worldPosition.xyz;",
        );
        // The existing sphere patch has expanded the physical environment chunk.
        // Replace only the specular lookup's return, leaving diffuse IBL intact.
        const radianceStart = shader.fragmentShader.indexOf("vec3 getIBLRadiance(");
        if (radianceStart < 0) throw new Error("Actor reflections require the physical environment shader.");
        shader.fragmentShader = declarations + shader.fragmentShader.slice(0, radianceStart) + shader.fragmentShader.slice(radianceStart).replace(
          "return envMapColor.rgb * envMapIntensity;", "return withActorReflection(envMapColor.rgb * envMapIntensity, roughness);",
        );
      };
      surface.material.customProgramCacheKey = () => `${previousKey}|planar-actors-v1`;
      surface.material.needsUpdate = true; ready = true; dirty = true;
    },
    invalidate() { dirty = true; },
    setResolutionScale(scale) {
      const size = Math.max(64, Math.round(resolution * scale));
      if (target.width !== size) { target.setSize(size, size); dirty = true; }
    },
    async warmup(compile = (targetScene, targetCamera) => renderer.compileAsync(targetScene, targetCamera)) {
      if (!ready) return;
      const renderTarget = renderer.getRenderTarget(), toneMapping = renderer.toneMapping, ownLayers = surface.layers.mask;
      try {
        surface.layers.disable(REFLECTION_LAYER);
        renderer.setRenderTarget(target); renderer.toneMapping = NoToneMapping;
        await compile(scene, helper.camera);
      } finally {
        surface.layers.mask = ownLayers;
        renderer.setRenderTarget(renderTarget); renderer.toneMapping = toneMapping;
      }
    },
    render(camera, enabled = true) {
      const changed = lightsChanged();
      dirty ||= changed;
      uniforms.stageActorsReflected.value = ready && enabled ? 1 : 0;
      if (!ready || !enabled || !dirty) return;
      const background = scene.background, toneMapping = renderer.toneMapping, ownLayers = surface.layers.mask;
      const clearColor = renderer.getClearColor(new Color()), clearAlpha = renderer.getClearAlpha();
      const peerStates = [];
      surface.parent.traverse(object => {
        const peer = reflectionUniforms.get(object);
        if (object !== surface && peer) {
          peerStates.push([peer, peer.stageActorsReflected.value]);
          peer.stageActorsReflected.value = 0;
        }
      });
      try {
        // Another level's preparation can enable this mesh as an occluder.
        // Exclude it from its own capture, and do not reflect cached reflections.
        surface.layers.disable(REFLECTION_LAYER);
        scene.background = null; renderer.setClearColor(0x000000, 0); renderer.toneMapping = NoToneMapping;
        helper.onBeforeRender(renderer, scene, camera);
        uniforms.stageActorProjection.value.copy(helper.material.uniforms.textureMatrix.value).multiply(inversePlane);
        dirty = false;
      } finally {
        surface.layers.mask = ownLayers;
        for (const [peer, value] of peerStates) peer.stageActorsReflected.value = value;
        scene.background = background; renderer.setClearColor(clearColor, clearAlpha); renderer.toneMapping = toneMapping;
      }
    },
    dispose() { reflectionUniforms.delete(surface); helper.geometry.dispose(); helper.dispose(); },
  };
}
