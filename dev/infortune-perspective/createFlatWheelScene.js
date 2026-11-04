import { PEG_COUNT, TAU, WHEEL_SECTORS, sectorAtPointer } from "../../src/features/infortune/wheelConfig.js";
import { WHEEL_GEOMETRY, pawlPoint, pawlPivotDistance } from "../../src/features/infortune/wheelGeometry.js";
import { NEEDLE_PAWL, pawlHalfWidth } from "../../src/features/infortune/wheelPawlModels.js";
import { pivotPawlOutline } from "../../src/features/infortune/pivotPawlGeometry.js";
import { PEG_RADIUS } from "./wheelDimensions.js";
import { sectorLetteringLayout, measureSectorGlyph, drawSectorGlyph } from "./sectorLetteringLayout.js";
import { infortuneSectors, EXCHANGE_SECTOR_INDICES } from "../../shared/infortuneWheel.js";
import { exchangeTilePose } from "./exchangeArrival.js";

const slice = TAU / WHEEL_SECTORS.length;
function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
function wedge(ctx, start, end) {
  ctx.beginPath(); ctx.arc(0, 0, 250, start - Math.PI / 2, end - Math.PI / 2);
  ctx.arc(0, 0, 72, end - Math.PI / 2, start - Math.PI / 2, true); ctx.closePath();
}
function wheelArtwork(sectors = WHEEL_SECTORS, onlyIndex = null) {
  const canvas = Object.assign(document.createElement("canvas"), { width: 768, height: 768 });
  const ctx = canvas.getContext("2d"); ctx.scale(1.2, 1.2); ctx.translate(320, 320);
  if (onlyIndex === null) { circle(ctx, 0, 0, 280, "#9c793e"); circle(ctx, 0, 0, 276, "#182635"); }
  sectors.forEach((sector, index) => {
    if (onlyIndex !== null && index !== onlyIndex) return;
    const golden = sector.kind === "bonus" || sector.amount === 1000;
    wedge(ctx, index * slice, (index + 1) * slice);
    if (golden) {
      const gold = ctx.createLinearGradient(-100, -240, 180, 180);
      gold.addColorStop(0, "#ad751f"); gold.addColorStop(0.45, "#ffe99c"); gold.addColorStop(1, "#d49a2c"); ctx.fillStyle = gold;
    } else ctx.fillStyle = sector.color;
    ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = "#eedbb5"; ctx.stroke();
    ctx.save(); ctx.rotate((index + 0.5) * slice); ctx.translate(-36, -250);
    ctx.fillStyle = sector.kind === "bankrupt" ? "#fff4d5" : "#13202d";
    for (const glyph of sectorLetteringLayout(sector, measureSectorGlyph(ctx))) drawSectorGlyph(ctx, glyph);
    ctx.restore();
  });
  for (let i = 0; onlyIndex === null && i < PEG_COUNT; i++) {
    const angle = i * TAU / PEG_COUNT, x = Math.sin(angle) * WHEEL_GEOMETRY.pegOrbit, y = -Math.cos(angle) * WHEEL_GEOMETRY.pegOrbit;
    circle(ctx, x + 0.8, y + 0.8, PEG_RADIUS + 0.6, "#03080e");
    const metal = ctx.createRadialGradient(x - 0.4, y - 0.4, 0.1, x, y, PEG_RADIUS);
    metal.addColorStop(0, "#e2e9ed"); metal.addColorStop(0.5, "#8996a3"); metal.addColorStop(1, "#303c48");
    circle(ctx, x, y, PEG_RADIUS, metal);
  }
  return canvas;
}
function drawPawl(ctx, bend, model) {
  ctx.save(); ctx.translate(WHEEL_GEOMETRY.centerX, WHEEL_GEOMETRY.centerY - pawlPivotDistance(model));
  ctx.beginPath();
  if (model.motion === "pivot") {
    ctx.rotate(bend);
    pivotPawlOutline(model, 24).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  } else {
    for (const side of [-1, 1]) for (let i = 0; i <= 24; i++) {
      const fraction = side < 0 ? i / 24 : 1 - i / 24, p = pawlPoint(bend, fraction, model);
      const half = pawlHalfWidth(fraction, model) * side, angle = bend * fraction;
      const x = p.x + Math.cos(angle) * half, y = p.y + Math.sin(angle) * half;
      if (side < 0 && i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath(); ctx.fillStyle = "#e52729"; ctx.fill(); ctx.strokeStyle = "#690c15"; ctx.lineWidth = 0.7; ctx.stroke();
  circle(ctx, 0, 0, model.motion === "pivot" ? 3 : 6, "#b5bdc4"); circle(ctx, 0, 0, 2, "#33404d"); ctx.restore();
}

// A genuine Canvas 2D backend. No WebGL context, studio assets or avatar engine.
// The controller, launch game and camera/audio clocks stay with the caller.
export function createFlatWheelScene(canvas, initialProjection, onStageChange, exchangeEnabled = false, { onFrame } = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  const artwork = wheelArtwork();
  const sectors = infortuneSectors(exchangeEnabled);
  const overlays = exchangeEnabled ? EXCHANGE_SECTOR_INDICES.map(index => wheelArtwork(sectors, index)) : [];
  let exchangeProgress = 0;
  let projection = initialProjection, state = { angle: 0, pawl: 0, pawlModel: NEEDLE_PAWL }, phase = "ready", disposed = false;
  let sequence = null, result = null, pending = null;
  function scheduleDraw() { if (!disposed && pending === null) pending = requestAnimationFrame(draw); }
  function draw() {
    if (pending !== null) { cancelAnimationFrame(pending); pending = null; }
    if (disposed || document.hidden) return;
    const frameStart = performance.now();
    const { width, height } = projection, ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#080f19"; ctx.fillRect(0, 0, width, height);
    const side = Math.min(width, height), scale = side / 640;
    ctx.translate((width - side) / 2, (height - side) / 2); ctx.scale(scale, scale);
    ctx.save(); ctx.translate(WHEEL_GEOMETRY.centerX, WHEEL_GEOMETRY.centerY); ctx.rotate(state.angle);
    ctx.drawImage(artwork, -320, -320, 640, 640);
    overlays.forEach((image, index) => {
      const pose = exchangeTilePose(exchangeProgress, index);
      if (pose.visible) ctx.drawImage(image, -320, -320 - pose.height, 640, 640);
    });
    if (result) {
      const index = WHEEL_SECTORS.findIndex(sector => sector.id === result.id);
      wedge(ctx, index * slice, (index + 1) * slice);
      ctx.strokeStyle = "#fff2a4"; ctx.lineWidth = 3; ctx.shadowColor = "#ffcf51"; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();
    circle(ctx, 320, 334, 74, "#ba904b"); circle(ctx, 320, 334, 68, "#112837");
    ctx.textAlign = "center"; ctx.fillStyle = "#f0d498"; ctx.font = "bold 14px Georgia";
    ctx.fillText("ROUE DE", 320, 313); ctx.fillText("L’INFORTUNE", 320, 334);
    ctx.fillStyle = "#f8ecd4"; ctx.font = "bold 16px Georgia"; ctx.fillText("GOBBLE", 320, 362);
    drawPawl(ctx, state.pawl, state.pawlModel || NEEDLE_PAWL);
    if (result && sequence?.sequence === "results") {
      ctx.globalAlpha = Math.min(1, sequence.time * 2);
      ctx.fillStyle = "#07111fee"; ctx.fillRect(130, 290, 380, 88);
      ctx.fillStyle = "#ffdf8a"; ctx.font = "bold 28px Georgia"; ctx.fillText(result.label, 320, 344, 350); ctx.globalAlpha = 1;
    }
    onFrame?.(frameStart, performance.now() - frameStart, sequence?.playing || ["spinning", "dragging"].includes(phase));
  }
  return {
    start() { draw(); onStageChange({ phase: "ready", message: "" }); },
    setProjection(value) { projection = value; scheduleDraw(); },
    setCameraSequence(value) { sequence = value; scheduleDraw(); },
    setActorShade() {}, setQuality() {},
    setExchangeProgress(value) { exchangeProgress = value; scheduleDraw(); },
    update(value, nextPhase) {
      state = { ...value };
      if (nextPhase === "finished" && phase !== "finished") result = sectorAtPointer(state.angle, state.pawl, state.pawlModel, sectors);
      if (nextPhase !== "finished") result = null;
      phase = nextPhase; canvas.dataset.motion = phase; draw();
    },
    draw, dispose() {
      disposed = true; if (pending !== null) cancelAnimationFrame(pending);
      artwork.width = artwork.height = 0; ctx.clearRect(0, 0, canvas.width, canvas.height);
      overlays.forEach(image => { image.width = image.height = 0; });
    },
  };
}
