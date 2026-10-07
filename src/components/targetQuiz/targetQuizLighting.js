const clamp01 = (value) => Math.max(0, Math.min(1, value));

// Many faint rims approximate a soft beam edge without a full-screen blur pass.
const CONE_RIMS = Array.from({ length: 18 }, (_, index) => {
  const t = index / 17;
  return {
    spread: 1.22 - t * 0.34,
    erase: 0.025 + Math.sin(t * Math.PI / 2) * 0.23,
    light: 0.005 + Math.sin(t * Math.PI) * 0.085,
  };
});

function easeBetween(start, end, value) {
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function conePath(ctx, beam, spread = 1) {
  const halfWidth = beam.halfWidth * spread;
  ctx.beginPath();
  ctx.moveTo(beam.x - beam.aperture, beam.y);
  ctx.lineTo(beam.endX - halfWidth, beam.endY);
  ctx.quadraticCurveTo(beam.endX, beam.endY + halfWidth * 0.12, beam.endX + halfWidth, beam.endY);
  ctx.lineTo(beam.x + beam.aperture, beam.y);
  ctx.closePath();
}

function beamGradient(ctx, beam, strength, erase = false) {
  const gradient = ctx.createLinearGradient(beam.x, beam.y, beam.endX, beam.endY);
  const tint = erase ? "255,255,255" : "214,229,255";
  gradient.addColorStop(0, `rgba(${tint},${strength})`);
  gradient.addColorStop(0.18, `rgba(${tint},${strength * 0.97})`);
  gradient.addColorStop(0.64, `rgba(${tint},${strength * 0.62})`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  return gradient;
}

function frontalGlow(ctx, beam, { pitch, stageWidth, strength, erase = false }) {
  const radius = stageWidth * (0.37 - pitch * 0.24);
  const tint = erase ? "255,255,255" : "218,233,255";
  ctx.save();
  ctx.translate(beam.x, beam.y + radius * 0.32);
  ctx.scale(1, 1.32);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  glow.addColorStop(0, `rgba(${tint},${strength})`);
  glow.addColorStop(0.22, `rgba(${tint},${strength * 0.93})`);
  glow.addColorStop(0.62, `rgba(${tint},${strength * 0.47})`);
  glow.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawSource(ctx, beam, { envelope, intensity, pitch, stageWidth }) {
  const radius = Math.max(24, stageWidth * (0.34 - pitch * 0.26));
  const frontal = 1 - pitch;
  const glare = ctx.createRadialGradient(beam.x, beam.y, 0, beam.x, beam.y, radius);
  glare.addColorStop(0, `rgba(255,255,255,${0.95 * intensity})`);
  glare.addColorStop(0.075, `rgba(243,249,255,${0.87 * intensity})`);
  glare.addColorStop(0.25, `rgba(221,237,255,${(0.28 + frontal * 0.37) * intensity})`);
  glare.addColorStop(0.6, `rgba(138,170,250,${0.27 * intensity})`);
  glare.addColorStop(1, "rgba(106,122,240,0)");
  ctx.globalAlpha = envelope;
  ctx.fillStyle = glare;
  ctx.fillRect(beam.x - radius, beam.y - radius, radius * 2, radius * 2);

  ctx.save();
  ctx.translate(beam.x, beam.y);
  ctx.rotate(Math.atan2(beam.endX - beam.x, beam.endY - beam.y) * -0.55);
  const lensWidth = Math.max(4.5, Math.min(9, stageWidth * 0.016));
  const lensHeight = lensWidth * (0.88 - pitch * 0.49);

  // The circular front lenses tilt into narrow ellipses as the beams point down.
  ctx.fillStyle = "rgba(7,12,24,0.94)";
  ctx.strokeStyle = "rgba(164,188,224,0.74)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -1, lensWidth + 2, lensHeight + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const lens = ctx.createRadialGradient(0, 0, 0, 0, 0, lensWidth);
  lens.addColorStop(0, "rgba(255,255,255,1)");
  lens.addColorStop(0.5, "rgba(233,246,255,1)");
  lens.addColorStop(1, "rgba(112,169,247,0.9)");
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.ellipse(0, 0, lensWidth, lensHeight, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = envelope * intensity * (0.17 + frontal * 0.43);
  const streak = ctx.createLinearGradient(-radius * 0.75, 0, radius * 0.75, 0);
  streak.addColorStop(0, "rgba(188,219,255,0)");
  streak.addColorStop(0.48, "rgba(239,249,255,0.95)");
  streak.addColorStop(0.52, "rgba(239,249,255,0.95)");
  streak.addColorStop(1, "rgba(188,219,255,0)");
  ctx.fillStyle = streak;
  ctx.fillRect(-radius * 0.75, -0.65, radius * 1.5, 1.3);
  ctx.restore();
}

function clearProtectedRects(ctx, rects) {
  for (const rect of rects || []) {
    if (!rect) continue;
    const left = Number(rect.left ?? rect.x) || 0;
    const top = Number(rect.top ?? rect.y) || 0;
    const width = Math.max(0, Number(rect.width) || 0);
    const height = Math.max(0, Number(rect.height) || 0);
    ctx.clearRect(left, top, width, height);
  }
}

/** Draws in CSS pixels; the caller owns the canvas, DPR transform and animation clock. */
export function drawTargetQuizLighting(ctx, {
  width,
  height,
  progress,
  presenterRect,
  protectedRects = [],
}) {
  ctx.clearRect(0, 0, width, height);
  const t = clamp01(Number(progress) || 0);
  const envelope = 1 - easeBetween(0.8, 1, t);
  if (!presenterRect || width <= 0 || height <= 0 || envelope === 0) {
    clearProtectedRects(ctx, protectedRects);
    return;
  }

  const stageWidth = Math.max(1, Number(presenterRect.width) || 1);
  const stageLeft = Number(presenterRect.left ?? presenterRect.x) || 0;
  const stageTop = Number(presenterRect.top ?? presenterRect.y) || 0;
  const centerX = stageLeft + stageWidth / 2;
  const sourceY = stageTop + 8;
  const pitch = easeBetween(0.02, 0.72, t);
  const intensity = 1 - easeBetween(0.12, 0.88, t) * 0.85;
  const maxTravel = Math.max(stageWidth * 0.48, height - sourceY + height * 0.1);
  const travel = stageWidth * 0.55 + maxTravel * pitch;
  const beams = [-0.43, -0.24, 0.24, 0.43].map((offset) => {
    const x = centerX + stageWidth * offset;
    return {
      x,
      y: sourceY,
      endX: x - Math.sign(offset) * travel * (0.045 + pitch * 0.045),
      endY: sourceY + travel,
      aperture: Math.max(3, stageWidth * 0.007),
      halfWidth: stageWidth * 0.32 * (1 - pitch) + travel * (0.3 - pitch * 0.04),
    };
  });

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = envelope;
  ctx.fillStyle = "rgba(2,5,17,0.88)";
  ctx.fillRect(0, 0, width, height);

  // Lift the dark veil beneath each beam before adding the pale light itself.
  // This exposes the actual portrait and interface pixels inside the light.
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  for (const beam of beams) {
    ctx.globalAlpha = 1;
    frontalGlow(ctx, beam, { pitch, stageWidth, strength: 0.98 - pitch * 0.33, erase: true });
    ctx.fillStyle = beamGradient(ctx, beam, 0.98, true);
    for (const rim of CONE_RIMS) {
      ctx.globalAlpha = rim.erase;
      conePath(ctx, beam, rim.spread);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "source-over";
  for (const beam of beams) {
    ctx.globalAlpha = envelope;
    frontalGlow(ctx, beam, { pitch, stageWidth, strength: (0.6 - pitch * 0.3) * intensity });
    ctx.fillStyle = beamGradient(ctx, beam, 0.94 * intensity);
    for (const rim of CONE_RIMS) {
      ctx.globalAlpha = envelope * rim.light;
      conePath(ctx, beam, rim.spread);
      ctx.fill();
    }
  }

  for (const beam of beams) {
    drawSource(ctx, beam, { envelope, intensity, pitch, stageWidth });
  }
  ctx.restore();

  // Keep the definition, choices and feedback pixel-identical throughout the intro.
  clearProtectedRects(ctx, protectedRects);
}
