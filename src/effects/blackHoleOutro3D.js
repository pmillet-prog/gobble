const DEV_MODE = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function parseRgbColor(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^rgba?\((.+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => p.trim());
  if (parts.length < 3) return null;
  const read = (v) => {
    if (v.endsWith("%")) {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return 0;
      return Math.round((n / 100) * 255);
    }
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const r = read(parts[0]);
  const g = read(parts[1]);
  const b = read(parts[2]);
  const a =
    parts.length >= 4 && Number.isFinite(parseFloat(parts[3]))
      ? Math.max(0, Math.min(1, parseFloat(parts[3])))
      : 1;
  return { r, g, b, a };
}

function darkenColor(value, factor = 0.7) {
  const parsed = parseRgbColor(value);
  if (!parsed) return value;
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(parsed.r * f);
  const g = Math.round(parsed.g * f);
  const b = Math.round(parsed.b * f);
  return `rgb(${r}, ${g}, ${b})`;
}

function makeFxTile3D(letter, sizePx, thickPx, visuals = {}) {
  const fx = document.createElement("div");
  fx.className = "fxTile3d";
  fx.style.setProperty("--s", `${sizePx}px`);
  fx.style.setProperty("--t", `${thickPx}px`);
  if (visuals.bg) fx.style.setProperty("--fx-bg", visuals.bg);
  if (visuals.border) fx.style.setProperty("--fx-border", visuals.border);
  if (visuals.side) fx.style.setProperty("--fx-side", visuals.side);
  if (visuals.text) fx.style.setProperty("--fx-text", visuals.text);
  fx.style.setProperty("--fx-font", `${Math.max(16, Math.round(sizePx * 0.46))}px`);

  const bg = visuals.bg || "#f3c07a";
  const border = visuals.border || "rgba(0,0,0,.25)";
  const side = visuals.side || "#a6803f";
  const back = visuals.back || side || bg;
  const halfT = thickPx / 2;
  const eps = Math.max(0.2, thickPx * 0.02);
  const commonFaceStyle = {
    position: "absolute",
    left: "50%",
    top: "50%",
    backfaceVisibility: "hidden",
  };

  const mkFace = (cls, withLetter = false) => {
    const f = document.createElement("div");
    f.className = `face ${cls}`;
    Object.assign(f.style, commonFaceStyle);
    if (withLetter) {
      const s = document.createElement("span");
      s.className = "letter";
      s.textContent = letter;
      f.appendChild(s);
    }
    return f;
  };

  const front = mkFace("front", true);
  Object.assign(front.style, {
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) translateZ(${halfT + eps}px)`,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: "14px",
    boxShadow:
      "0 16px 26px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.35), inset 0 -14px 22px rgba(0,0,0,.22)",
  });

  const backFace = mkFace("back", true);
  Object.assign(backFace.style, {
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) rotateY(180deg) translateZ(${halfT + eps}px)`,
    background: back,
    border: `1px solid ${border}`,
    borderRadius: "14px",
  });

  const right = mkFace("right");
  Object.assign(right.style, {
    width: `${thickPx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  const left = mkFace("left");
  Object.assign(left.style, {
    width: `${thickPx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  const top = mkFace("top");
  Object.assign(top.style, {
    width: `${sizePx}px`,
    height: `${thickPx}px`,
    transform: `translate(-50%, -50%) rotateX(90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(90deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  const bottom = mkFace("bottom");
  Object.assign(bottom.style, {
    width: `${sizePx}px`,
    height: `${thickPx}px`,
    transform: `translate(-50%, -50%) rotateX(-90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(90deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  fx.appendChild(front);
  fx.appendChild(backFace);
  fx.appendChild(right);
  fx.appendChild(left);
  fx.appendChild(top);
  fx.appendChild(bottom);

  return fx;
}

export async function playBlackHoleOutro3D({
  tileEls,
  holeX,
  holeY,
  durationMs = 6000,
  onOverlay = null,
}) {
  if (prefersReducedMotion()) return null;
  if (!tileEls || tileEls.length === 0) return null;
  if (!Number.isFinite(holeX) || !Number.isFinite(holeY)) return null;
  const randRangeLocal = (min, max) => Math.random() * (max - min) + min;
  const expEaseIn = (t, k = 3) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const kk = Math.max(0.001, k);
    return (Math.exp(kk * t) - 1) / (Math.exp(kk) - 1);
  };
  if (DEV_MODE) {
    console.info("[fx] black-hole start", {
      count: tileEls.length,
      durationMs,
    });
  }

  const overlay = document.createElement("div");
  overlay.className = "fxOverlay";
  document.body.appendChild(overlay);
  onOverlay?.(overlay);
  overlay.style.perspectiveOrigin = `${holeX}px ${holeY}px`;

  const fade = document.createElement("div");
  fade.className = "fxScreenFade";
  overlay.appendChild(fade);
  const DEBUG_FX_CUBE = false;
  if (DEV_MODE && DEBUG_FX_CUBE) {
    const dbg = makeFxTile3D("A", 90, 28, {
      bg: "#f3c07a",
      side: "#a6803f",
      border: "rgba(0,0,0,.25)",
      text: "#1f1300",
    });
    dbg.style.left = "40px";
    dbg.style.top = "40px";
    dbg.style.transform = "rotateX(65deg) rotateY(-35deg)";
    overlay.appendChild(dbg);
  }

  fade.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.72 },
      { opacity: 1, offset: 1 },
    ],
    {
      duration: durationMs,
      easing: "linear",
      fill: "forwards",
    }
  );

  const anims = [];
  const DEBUG_FX_GEOM = false;
  let debugApplied = false;

  for (const el of tileEls) {
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const size = Math.round(Math.min(rect.width, rect.height));
    const thick = Math.max(6, Math.round(size * 0.22));
    const letter =
      (el.querySelector?.(".tile-letter")?.textContent || el.textContent || "")
        .trim()
        .slice(0, 2);
    const styles = window.getComputedStyle(el);
    const bgRaw = styles.backgroundColor || "";
    const bgParsed = parseRgbColor(bgRaw);
    const bg = bgParsed && bgParsed.a >= 0.85 ? bgRaw : "#f3c07a";
    const border =
      styles.borderColor && styles.borderColor !== "transparent"
        ? styles.borderColor
        : "rgba(0,0,0,0.25)";
    const text = "#1f1300";
    const side = darkenColor(bg, 0.62);

    const fx = makeFxTile3D(letter, size, thick, {
      bg,
      border,
      side,
      text,
    });

    fx.style.left = `${holeX - size / 2}px`;
    fx.style.top = `${holeY - size / 2}px`;
    overlay.appendChild(fx);
    if (DEBUG_FX_GEOM && !debugApplied) {
      debugApplied = true;
      fx.style.transform = "rotateX(65deg) rotateY(-35deg) translateZ(0)";
      fx.style.opacity = "1";
      continue;
    }

    let x0 = rect.left + rect.width / 2 - holeX;
    let y0 = rect.top + rect.height / 2 - holeY;
    let r0 = Math.hypot(x0, y0);
    const minR = Math.max(6, size * 0.18);
    if (r0 < minR) {
      const ang = Math.random() * Math.PI * 2;
      x0 = Math.cos(ang) * minR;
      y0 = Math.sin(ang) * minR;
      r0 = minR;
    }
    const a0 = Math.atan2(y0, x0);

    const maxDist = Math.max(1, Math.hypot(window.innerWidth, window.innerHeight));
    const distNorm = Math.min(1, r0 / maxDist);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const turns = 0.9 + 1.3 * distNorm + Math.random() * 0.6;
    const spinTurns = 0.9 + 1.4 * distNorm + Math.random() * 0.8;
    const zDepth = 220 + Math.random() * 260;
    const spinZ = dir * 360 * spinTurns;
    const orbitBias = randRangeLocal(-0.12, 0.12) * (0.4 + 0.6 * distNorm);
    const wobbleAmp = 0.02 + 0.06 * distNorm;
    const wobblePhase = Math.random() * Math.PI * 2;
    const wobbleTurns = 1.4 + Math.random() * 1.6;

    const steps = 14;
    const kf = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const accelK = 3.2 + 2.2 * distNorm;
      const moveEase = expEaseIn(t, accelK);
      const rotEase = expEaseIn(t, accelK * 1.05);
      const scaleEase = Math.pow(moveEase, 1.05);
      const wobble = wobbleAmp * Math.sin(t * wobbleTurns * Math.PI * 2 + wobblePhase);
      const rr = r0 * (1 - moveEase);
      const orbitR = rr * (1 + orbitBias + wobble);
      const aa = a0 + dir * turns * Math.PI * 2 * moveEase;

      const x = Math.cos(aa) * orbitR * (1 + orbitBias * 0.25);
      const y = Math.sin(aa) * orbitR * (1 - orbitBias * 0.25);
      const z = -zDepth * moveEase;

      const rz = spinZ * rotEase;
      const rx = 0;
      const ry = 0;

      const s = 1 - 0.94 * Math.pow(scaleEase, 1.02);
      const fadeStart = 0.6 + 0.25 * distNorm;
      const fadeT = t <= fadeStart ? 0 : (t - fadeStart) / (1 - fadeStart);
      const o = 1 - Math.pow(fadeT, 1.2);
      kf.push({
        transform: `translate3d(${x}px, ${y}px, ${z}px) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`,
        opacity: o,
      });
    }

    const durationScale = 0.65 + 0.95 * distNorm;
    anims.push(
      fx
        .animate(kf, {
          duration: durationMs * durationScale + Math.random() * 220,
          easing: "cubic-bezier(.2,.9,.2,1)",
          fill: "forwards",
        })
        .finished
    );
  }

  await Promise.allSettled(anims);
  return { overlay, fade };
}
