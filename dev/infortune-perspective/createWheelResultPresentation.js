import * as THREE from "three";
import { createRenderCanvas, renderCanvasDataUrl } from './wheelRenderPlatform.js';
import { createTileShape } from "./tileGeometry.js";
import { sectorLetteringLayout, measureSectorGlyph } from "./sectorLetteringLayout.js";
import { horizontalResultLayout, resultMotion, resultTilePose, RESULT_TILE_CENTER } from "./wheelResultMotion.js";

function canvasTexture(width, height, paint) {
  const canvas = createRenderCanvas(width, height);
  paint(canvas.getContext("2d"));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glyphMesh(glyph, glow) {
  const padding = glyph.size * 0.6;
  const width = glyph.width + padding * 2, height = glyph.ascent + glyph.descent + padding * 2;
  const density = 4;
  const map = canvasTexture(Math.ceil(width * density), Math.ceil(height * density), context => {
    context.scale(density, density); context.textAlign = "center"; context.textBaseline = "alphabetic";
    context.font = `${glyph.weight} ${glyph.size}px ${glyph.family}`;
    const gradient = context.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, "#ffffff"); gradient.addColorStop(0.42, "#fff8da");
    gradient.addColorStop(0.57, "#eab764"); gradient.addColorStop(1, "#fff3c3");
    context.fillStyle = gradient; context.shadowColor = glow; context.shadowBlur = padding * 0.65;
    const baseline = padding + glyph.ascent;
    context.fillText(glyph.character, width / 2, baseline);
    context.shadowBlur = padding * 0.25; context.fillText(glyph.character, width / 2, baseline);
    context.shadowBlur = 0; context.strokeStyle = "#fffce2"; context.lineWidth = glyph.size * 0.012;
    context.strokeText(glyph.character, width / 2, baseline);
  });
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material); mesh.renderOrder = 10;
  return mesh;
}

function disposeGroup(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  for (const material of materials) { if (material.map) textures.add(material.map); material.dispose(); }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  root.clear();
}

// A small presentation pass uses the actual camera and winning tile pose.
// It has no shadows, reflection captures or full-screen bloom, and shares the
// camera timeline's clock: pausing/scrubbing the return also pauses/scrubs this.
export function createWheelResultPresentation() {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const measuring = createRenderCanvas().getContext("2d");
  const sourceProjected = new THREE.Vector3(), target = new THREE.Vector3(), neighbor = new THREE.Vector3();
  let result = null, pose = null, time = null, glyphs = [], letters = [], layout = null, outlines = [], sparks = [];
  let wash, caption, backdrop, contour, taken = false;

  function clear() {
    disposeGroup(root); result = null; pose = null; glyphs = []; letters = []; outlines = []; sparks = [];
    taken = false;
  }
  function setResult(value, wheelAngle) {
    clear(); result = value; pose = resultTilePose(value, wheelAngle);
    const glow = value.kind === "pass" ? "#c4d7ea" : value.kind === "bankrupt" ? "#ff658c" : value.kind === "exchange" ? "#63e8ff" : "#ffc04d";
    glyphs = sectorLetteringLayout(value, measureSectorGlyph(measuring)); layout = horizontalResultLayout(glyphs);
    letters = glyphs.map(glyph => { const mesh = glyphMesh(glyph, glow); root.add(mesh); return mesh; });

    const shape = createTileShape(); shape.holes = [];
    const points = shape.getPoints(32).map(point => new THREE.Vector3(point.x, point.y - RESULT_TILE_CENTER, 0));
    // Shape.closePath repeats the first point; the closed curve owns that join.
    if (points.at(0).distanceToSquared(points.at(-1)) < 1e-8) points.pop();
    contour = new THREE.CatmullRomCurve3(points, true, "centripetal");
    outlines = [[4.5, 0.08, glow], [1.7, 0.32, glow], [0.42, 1, "#fff6d7"]].map(([radius, opacity, color]) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(contour, 140, radius, 5, true), material);
      mesh.renderOrder = 4; root.add(mesh); return { material, opacity };
    });
    const geometry = new THREE.ShapeGeometry(shape, 32); geometry.translate(0, -RESULT_TILE_CENTER, 0);
    wash = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(glow) } },
      vertexShader: "varying vec2 vTile; void main(){vTile=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "varying vec2 vTile; uniform float uTime; uniform float uOpacity; uniform vec3 uColor; void main(){float sweep=-88.+mod(uTime*180.,350.);float light=exp(-pow((vTile.y+vTile.x*.6-sweep)/12.,2.));gl_FragColor=vec4(uColor,(.07+light*.5)*uOpacity);}",
    }));
    wash.renderOrder = 2; root.add(wash);

    const star = canvasTexture(128, 128, context => {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "#ffffff"); gradient.addColorStop(0.08, "#fff4d0");
      gradient.addColorStop(0.25, glow); gradient.addColorStop(1, "transparent");
      context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
      context.fillStyle = "#fff9e8"; context.beginPath();
      for (const [x, y] of [[64, 2], [68, 60], [126, 64], [68, 68], [64, 126], [60, 68], [2, 64], [60, 60]]) context.lineTo(x, y);
      context.closePath(); context.fill();
    });
    const sparkGeometry = new THREE.PlaneGeometry(12, 12);
    sparks = Array.from({ length: 12 }, (_, index) => {
      const material = new THREE.MeshBasicMaterial({ map: star, transparent: true, blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(sparkGeometry, material); mesh.renderOrder = 15; root.add(mesh); return mesh;
    });
    const shade = canvasTexture(256, 128, context => {
      context.scale(1, 0.5);
      const gradient = context.createRadialGradient(128, 128, 20, 128, 128, 128);
      gradient.addColorStop(0, "#020611ee"); gradient.addColorStop(0.65, "#020611aa"); gradient.addColorStop(1, "transparent");
      context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
    });
    backdrop = new THREE.Mesh(new THREE.PlaneGeometry(layout.width + 100, 130), new THREE.MeshBasicMaterial({
      map: shade, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    backdrop.renderOrder = 0; root.add(backdrop);
    const title = canvasTexture(640, 64, context => {
      context.fillStyle = "#edd9b0"; context.font = "500 25px Arial"; context.textAlign = "center";
      context.fillText("RÉSULTAT DE LA ROUE", 320, 41);
    });
    caption = new THREE.Mesh(new THREE.PlaneGeometry(160, 16), new THREE.MeshBasicMaterial({
      map: title, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    caption.position.y = 40; caption.renderOrder = 10; root.add(caption);
  }

  function render(renderer, projection) {
    if (!result || time === null || taken) return;
    const { camera, width, height } = projection, motion = resultMotion(time);
    sourceProjected.copy(pose.position).project(camera);
    const depth = Math.max(-0.9, Math.min(0.98, sourceProjected.z));
    target.set(0, -0.24, depth).unproject(camera);
    neighbor.set(2 / width, -0.24, depth).unproject(camera);
    const pixelScale = Math.min(height * 0.46 / 174, width * 0.78 / Math.max(layout.width, 160));
    const scale = neighbor.distanceTo(target) * pixelScale;
    root.position.copy(pose.position).lerp(target, motion.lift);
    root.quaternion.copy(pose.quaternion).slerp(camera.quaternion, motion.lift);
    root.scale.setScalar(1 + (scale - 1) * motion.lift);

    letters.forEach((mesh, index) => {
      const glyph = glyphs[index], final = layout.letters[index];
      mesh.position.set(THREE.MathUtils.lerp(glyph.x - 36, final.x, motion.spread),
        THREE.MathUtils.lerp(250 - glyph.y - RESULT_TILE_CENTER, final.y, motion.spread), 0.15);
      mesh.rotation.z = -glyph.rotation * (1 - motion.spread);
      mesh.scale.setScalar(1 + (final.scale - 1) * motion.spread);
      mesh.material.opacity = motion.ignite;
    });
    const pulse = 0.86 + 0.14 * Math.sin(time * 18);
    outlines.forEach(({ material, opacity }) => { material.opacity = opacity * motion.outline * motion.ignite * pulse; });
    wash.material.uniforms.uTime.value = time;
    wash.material.uniforms.uOpacity.value = motion.outline * motion.ignite;
    caption.material.opacity = motion.caption; backdrop.material.opacity = motion.caption;
    sparks.forEach((mesh, index) => {
      contour.getPoint((index / sparks.length + time * 0.08) % 1, mesh.position);
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, (index / 11 - 0.5) * (layout.width + 28), motion.spread);
      mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, Math.sin(index * 2.4) * 29, motion.spread);
      mesh.position.z = 0.5;
      const twinkle = Math.max(0, Math.sin(time * 8 + index * 2.1)) ** 8;
      mesh.scale.setScalar(0.4 + twinkle * 0.9);
      mesh.material.opacity = motion.ignite * twinkle * (1 - motion.caption * 0.85);
    });
    const autoClear = renderer.autoClear;
    try { renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, camera); }
    finally { renderer.autoClear = autoClear; }
  }
  async function takePresentation({ width, height }) {
    if (!result || !layout) return null;
    const pixelScale = Math.min(height * 0.46 / 174, width * 0.78 / Math.max(layout.width, 160));
    const bounds = letters.map((mesh, index) => ({ x: layout.letters[index].x,
      width: mesh.geometry.parameters.width * layout.letters[index].scale,
      height: mesh.geometry.parameters.height * layout.letters[index].scale }));
    const left = Math.min(...bounds.map(b => b.x - b.width / 2)), right = Math.max(...bounds.map(b => b.x + b.width / 2));
    const tall = Math.max(...bounds.map(b => b.height));
    const canvas = createRenderCanvas();
    canvas.width = Math.ceil((right - left) * 3); canvas.height = Math.ceil(tall * 3);
    const context = canvas.getContext('2d'); context.scale(3, 3);
    letters.forEach((mesh, index) => { const b = bounds[index];
      context.drawImage(mesh.material.map.image, b.x - b.width / 2 - left, (tall - b.height) / 2, b.width, b.height);
    });
    taken = true;
    const haloWidth = (layout.width + 100) * pixelScale;
    const [image, halo, captionImage] = await Promise.all([canvas, backdrop.material.map.image, caption.material.map.image].map(renderCanvasDataUrl));
    return { x: width / 2, y: height * .62, width: (right - left) * pixelScale, height: tall * pixelScale, fontSize: 44 * pixelScale,
      image,
      halo: { width: haloWidth, height: 130 * pixelScale, image: halo },
      caption: { image: captionImage, width: 160 * pixelScale, height: 16 * pixelScale, y: -40 * pixelScale } };
  }
  return { setResult, clear, render, takePresentation,
    setSequence(state) { time = state.sequence === "results" ? Math.max(0, Math.min(3, state.time)) : null; },
    dispose: clear,
  };
}
