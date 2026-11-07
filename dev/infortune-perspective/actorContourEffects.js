import { CanvasTexture, MathUtils, Mesh, PlaneGeometry } from "three";
import { createRenderCanvas } from './wheelRenderPlatform.js';
import { createDynamicActorHalo } from "./dynamicActorHalo.js";
import { MAX_CONTOUR_DISTANCE } from "./actorShadeSettings.js";

// Two linear passes approximate distance to the silhouette, once at loading.
// The transparent margin lets the glow extend beyond the original image bounds.
function distanceField(alpha, width, height, toOpaque) {
  const field = new Float32Array(width * height), diagonal = Math.SQRT2;
  for (let i = 0; i < field.length; i++) field[i] = (alpha[i * 4 + 3] >= 128) === toOpaque ? 0 : width + height;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    let value = field[i];
    if (x > 0) value = Math.min(value, field[i - 1] + 1);
    if (y > 0) {
      value = Math.min(value, field[i - width] + 1);
      if (x > 0) value = Math.min(value, field[i - width - 1] + diagonal);
      if (x + 1 < width) value = Math.min(value, field[i - width + 1] + diagonal);
    }
    field[i] = value;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    let value = field[i];
    if (x + 1 < width) value = Math.min(value, field[i + 1] + 1);
    if (y + 1 < height) {
      value = Math.min(value, field[i + width] + 1);
      if (x > 0) value = Math.min(value, field[i + width - 1] + diagonal);
      if (x + 1 < width) value = Math.min(value, field[i + width + 1] + diagonal);
    }
    field[i] = value;
  }
  return field;
}

function contourTextures(source) {
  const scale = Math.min(1, 512 / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale), height = Math.round(source.height * scale), padding = 48;
  const glowCanvas = createRenderCanvas(width + padding * 2, height + padding * 2);
  const shadeCanvas = createRenderCanvas(width, height);
  const context = glowCanvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, padding, padding, width, height);
  const mask = context.getImageData(0, 0, glowCanvas.width, glowCanvas.height);
  const outside = distanceField(mask.data, mask.width, mask.height, true);
  const inside = distanceField(mask.data, mask.width, mask.height, false);
  const shadeContext = shadeCanvas.getContext("2d"), shade = shadeContext.createImageData(width, height);
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const i = y * mask.width + x, pixel = i * 4, alpha = mask.data[pixel + 3] / 255;
    const distance = outside[i];
    const glow = (0.7 * Math.exp(-0.5 * (distance / 10) ** 2) + 0.22 * Math.exp(-0.5 * (distance / 23) ** 2))
      * (1 - MathUtils.smoothstep(distance, 34, 46)) * (1 - alpha);
    // Encode the outward contour normal in image coordinates; local Y points up.
    const dx = outside[y * mask.width + Math.min(x + 1, mask.width - 1)] - outside[y * mask.width + Math.max(x - 1, 0)];
    const dy = outside[Math.min(y + 1, mask.height - 1) * mask.width + x] - outside[Math.max(y - 1, 0) * mask.width + x];
    const length = Math.hypot(dx, dy) || 1;
    mask.data[pixel] = Math.round(127.5 * (1 + dx / length));
    mask.data[pixel + 1] = Math.round(127.5 * (1 - dy / length));
    mask.data[pixel + 2] = 0;
    mask.data[pixel + 3] = Math.round(glow * 255);
    if (x >= padding && x < padding + width && y >= padding && y < padding + height) {
      const target = ((y - padding) * width + x - padding) * 4;
      // Store distance, not a baked shadow. Sliders only change shader uniforms;
      // masks and avatar textures are generated once and keep their alpha.
      shade.data[target] = alpha > 0 ? Math.round(255 * Math.min(inside[i] / MAX_CONTOUR_DISTANCE, 1)) : 0;
      shade.data[target + 3] = 255;
    }
  }
  context.putImageData(mask, 0, 0); shadeContext.putImageData(shade, 0, 0);
  const glowTexture = new CanvasTexture(glowCanvas);
  const shadeTexture = new CanvasTexture(shadeCanvas);
  return { glowTexture, shadeTexture, scaleX: mask.width / width, scaleY: mask.height / height,
    dispose() {
      // Both masks are custom uniforms, owned here rather than ordinary maps.
      shadeTexture.dispose(); glowTexture.dispose();
      glowCanvas.width = glowCanvas.height = shadeCanvas.width = shadeCanvas.height = 0;
    },
  };
}

export function addActorContourEffects(actor, source, lights, shadeUniform) {
  const textures = contourTextures(source);
  const { width, height } = actor.geometry.parameters;
  const lighting = createDynamicActorHalo(textures.glowTexture, lights);
  const halo = new Mesh(new PlaneGeometry(width * textures.scaleX, height * textures.scaleY), lighting.material);
  halo.onBeforeRender = lighting.update;
  halo.name = `${actor.name}-contour-glow`; halo.renderOrder = 1; actor.add(halo);
  // Darken the final lit portrait at the inner edge, including its small
  // emissive contribution. Alpha and the silhouette used by shadows stay intact.
  actor.material.onBeforeCompile = shader => {
    shader.uniforms.actorContourShade = { value: textures.shadeTexture };
    shader.uniforms.actorInnerShade = shadeUniform;
    shader.fragmentShader = "uniform sampler2D actorContourShade;\nuniform vec3 actorInnerShade;\n" + shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `#ifdef USE_MAP
        float contourDistance = texture2D(actorContourShade, vMapUv).r * ${MAX_CONTOUR_DISTANCE.toFixed(1)};
        float t = clamp((contourDistance - actorInnerShade.x) / actorInnerShade.y, 0.0, 1.0);
        float falloff = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        outgoingLight *= 1.0 - actorInnerShade.z * (1.0 - falloff);
      #endif
      #include <opaque_fragment>`,
    );
  };
  actor.material.customProgramCacheKey = () => "stage-actor-inner-contour-adjustable-v1";
  actor.material.needsUpdate = true;
  return { dispose: textures.dispose, setSelected: lighting.setSelected };
}
