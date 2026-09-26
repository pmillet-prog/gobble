import { Container, Graphics, Sprite, Texture, Ticker, WebGLRenderer } from "pixi.js";
import { BIGWORD_URLS, bigwordUrl } from "./celebrationPresentation.js";
import { sampleCelebrationMotion } from "./celebrationMotion.js";

export async function createPixiCelebrationRenderer({ onFailure = () => {}, getHostRect } = {}) {
  const renderer = new WebGLRenderer();
  const stage = new Container({ eventMode: "none" });
  const textures = new Map(), records = new Map();
  const canvas = document.createElement("canvas");
  let context = null;
  let stopped = false, frame = null, manual = false, draws = 0, surface = null;
  let rect = { left: 0, top: 0, width: 0, height: 0 };
  const resolution = window.devicePixelRatio || 1;
  try {
    const attributes = { alpha: true, antialias: true, premultipliedAlpha: true, stencil: true };
    context = canvas.getContext("webgl2", attributes) || canvas.getContext("webgl", attributes);
    if (!context) throw new Error("WebGL unavailable");
    await renderer.init({ canvas, context, width: 1, height: 1, resolution, autoDensity: true,
      backgroundAlpha: 0, antialias: true, gcActive: false });
    // A decorative overlay needs neither pointer processing nor Pixi's system
    // ticker. Its seven textures are owned here and destroyed on unmount.
    renderer.events?.setTargetElement(null);
    renderer.scheduler.destroy();
    for (const key of Object.keys(BIGWORD_URLS)) {
      const image = new Image(); image.decoding = "async";
      image.src = bigwordUrl(key);
      try { await image.decode(); }
      catch {
        image.src = BIGWORD_URLS[key].replace(/\.webp$/, ".png");
        await image.decode();
      }
      textures.set(key, Texture.from(image, true));
    }
  } catch (error) {
    for (const texture of textures.values()) texture.destroy(true);
    renderer.events?.setTargetElement(null);
    renderer.scheduler?.destroy();
    // A rejected init can leave only some Pixi systems initialized.
    try { renderer.destroy(true); } catch { /* release the owned context below */ }
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
    stage.destroy();
    throw error;
  }
  canvas.dataset.bigscoreRenderer = "pixi";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", pointerEvents: "none", zIndex: "21460", display: "none" });
  document.body.appendChild(canvas);

  function cancelFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }
  function resizeSurface() {
    let left = rect.left, top = rect.top, right = left + rect.width, bottom = top + rect.height;
    for (const { item, width, height } of records.values()) {
      const scale = Math.max(1, item.scale);
      const x = rect.left + rect.width / 2, y = rect.top + rect.height * .45;
      left = Math.min(left, x + Math.min(0, item.dx) - width * scale / 2, rect.left - item.ringInset);
      right = Math.max(right, x + Math.max(0, item.dx) + width * scale / 2, rect.left + rect.width + item.ringInset);
      top = Math.min(top, y + Math.min(0, item.dy) - height * scale / 2, rect.top - item.ringInset);
      bottom = Math.max(bottom, y + Math.max(0, item.dy) + height * scale / 2, rect.top + rect.height + item.ringInset);
    }
    left = Math.max(0, Math.floor(left - 2)); top = Math.max(0, Math.floor(top - 2));
    right = Math.min(window.innerWidth, Math.ceil(right + 2)); bottom = Math.min(window.innerHeight, Math.ceil(bottom + 2));
    const next = { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
    if (!surface || surface.width !== next.width || surface.height !== next.height) renderer.resize(next.width, next.height);
    surface = next;
    canvas.style.left = `${left}px`; canvas.style.top = `${top}px`;
  }
  function draw(now, elapsedOverride) {
    frame = null;
    if (stopped || document.hidden) return;
    let active = false;
    for (const record of records.values()) {
      const { item, node, ring, width, height, started } = record;
      const elapsed = elapsedOverride ?? now - started;
      const pose = sampleCelebrationMotion(item, elapsed);
      active ||= elapsed < Math.max(item.duration, item.ring ? 720 : 0);
      node.position.set(rect.left + rect.width / 2 - surface.left + pose.x,
        rect.top + rect.height * .45 - surface.top + pose.y);
      node.scale.set(width / record.nativeWidth * pose.scale, height / record.nativeHeight * pose.scale);
      node.alpha = pose.alpha;
      ring.position.set(rect.left - surface.left, rect.top - surface.top);
      ring.alpha = pose.ringAlpha;
    }
    canvas.style.display = active || elapsedOverride != null ? "block" : "none";
    if (active || elapsedOverride != null) {
      renderer.render({ container: stage }); draws++;
    }
    if (active && !manual) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    try { draw(now); } catch (error) { cancelFrame(); onFailure(error); }
  }
  function remove(record) { record.node.destroy(); record.ring.destroy(); }
  function drawRing({ ring, item }) {
    ring.clear();
    if (item.ring) ring.roundRect(-item.ringInset + item.ringWidth / 2, -item.ringInset + item.ringWidth / 2,
      rect.width + 2 * item.ringInset - item.ringWidth, rect.height + 2 * item.ringInset - item.ringWidth,
      item.ringRadius - item.ringWidth / 2).stroke({ width: item.ringWidth, color: item.ringColor, alpha: item.ringOpacity });
  }
  function fitToHost(record) {
    // The existing absolute CSS box starts at left:50%, uses shrink-to-fit,
    // and its image has max-width:100% (Tailwind preflight).
    record.width = Math.min(record.item.size, Math.max(1, rect.width / 2));
    record.height = record.nativeHeight * record.width / record.nativeWidth;
    drawRing(record);
  }
  function update(items, hostRect) {
    if (stopped) return;
    const resized = hostRect && (hostRect.width !== rect.width || hostRect.height !== rect.height);
    rect = hostRect || rect;
    const slots = new Set(items.map(item => item.slot));
    for (const [slot, record] of records) if (!slots.has(slot)) { remove(record); records.delete(slot); }
    for (const item of items) {
      const previous = records.get(item.slot);
      const same = previous?.item.id === item.id;
      if (same && Object.keys(item).every(key => item[key] === previous.item[key])) {
        if (resized) fitToHost(previous);
        continue;
      }
      const started = same ? previous.started : performance.now();
      if (previous) remove(previous);
      const node = new Sprite(textures.get(item.key) || Texture.EMPTY);
      node.anchor.set(.5);
      const nativeWidth = node.width || 1, nativeHeight = node.height || 1;
      const ring = new Graphics();
      const record = { item, node, ring, nativeWidth, nativeHeight, started };
      fitToHost(record);
      stage.addChild(ring, node);
      records.set(item.slot, record);
    }
    // CSS puts rings below image layers.
    stage.removeChildren();
    const ordered = ["gobbleFlash", "praiseFlash"].map(slot => records.get(slot)).filter(Boolean);
    if (ordered.length) stage.addChild(...ordered.map(record => record.ring), ...ordered.map(record => record.node));
    cancelFrame();
    if (records.size) { resizeSurface(); if (!manual) tick(performance.now()); }
    else canvas.style.display = "none";
  }
  function visibility() { cancelFrame(); if (!document.hidden && records.size && !manual) tick(performance.now()); }
  function resize() {
    if (!records.size) return;
    const next = getHostRect?.();
    if (next) rect = next;
    for (const record of records.values()) fitToHost(record);
    resizeSurface(); visibility();
  }
  function contextLost(event) { event.preventDefault(); cancelFrame(); onFailure(new Error("WebGL context lost")); }
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("resize", resize);
  canvas.addEventListener("webglcontextlost", contextLost);
  return {
    update,
    pause() { manual = true; cancelFrame(); },
    seek(elapsedMs) { manual = true; cancelFrame(); if (records.size) draw(performance.now(), elapsedMs); },
    resume() { manual = false; visibility(); },
    poses() { return [...records.values()].map(({ node, width, height, nativeWidth }) => ({
      x: node.x + surface.left - rect.left - rect.width / 2,
      y: node.y + surface.top - rect.top - rect.height * .45,
      scale: node.scale.x * nativeWidth / width, alpha: node.alpha,
      width, height,
    })); },
    stats() { return { draws, framePending: frame !== null, active: records.size, textures: textures.size,
      systemTickerListeners: Ticker.system.count,
      resolution, surfacePixels: canvas.width * canvas.height,
      renderer: renderer.gl.getParameter(renderer.gl.RENDERER) }; },
    destroy() {
      if (stopped) return;
      stopped = true; cancelFrame();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", contextLost);
      for (const record of records.values()) remove(record);
      records.clear(); stage.destroy();
      for (const texture of textures.values()) texture.destroy(true);
      textures.clear(); renderer.destroy(true);
    },
  };
}
