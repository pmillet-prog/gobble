const SOFT_CLIP_CURVE_CACHE = new Map();

export function createSoftClipCurve(amount = 1.25, samples = 1024) {
  const key = `${amount}|${samples}`;
  const cached = SOFT_CLIP_CURVE_CACHE.get(key);
  if (cached) return cached;
  const curve = new Float32Array(samples);
  const k = Number.isFinite(amount) ? amount : 1;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(k * x);
  }
  SOFT_CLIP_CURVE_CACHE.set(key, curve);
  return curve;
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

export function humanizeGain(base, varianceDb = 1.2) {
  const jitter = randRange(-varianceDb, varianceDb);
  return base * dbToGain(jitter);
}

export function humanizeFreq(freq, cents = 6) {
  const jitter = randRange(-cents, cents);
  return freq * Math.pow(2, jitter / 1200);
}

export function createReverbImpulse(ctx, durationSec = 0.35, decay = 2.4) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buffer;
}

function applyFilterEnv(filter, now, { base, peak, attack = 0.02, release = 0.12 } = {}) {
  const baseFreq = Number.isFinite(base) ? base : 2000;
  filter.frequency.setValueAtTime(baseFreq, now);
  if (Number.isFinite(peak) && peak > 0) {
    filter.frequency.linearRampToValueAtTime(peak, now + attack);
    filter.frequency.setTargetAtTime(baseFreq, now + attack, release);
  }
}

export function connectSfxChain(ctx, system, sourceNode, opts = {}, now = ctx.currentTime) {
  const nodes = [];
  let input = sourceNode;
  let reverbTap = sourceNode;

  if (opts.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filter.type || "lowpass";
    filter.Q.setValueAtTime(Number.isFinite(opts.filter.q) ? opts.filter.q : 0.7, now);
    applyFilterEnv(filter, now, opts.filter.env || opts.filter);
    input.connect(filter);
    input = filter;
    reverbTap = filter;
    nodes.push(filter);
  }

  if (opts.saturation) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = createSoftClipCurve(opts.saturation, 1024);
    shaper.oversample = "2x";
    input.connect(shaper);
    input = shaper;
    reverbTap = shaper;
    nodes.push(shaper);
  }

  if (opts.panRange && typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(randRange(-opts.panRange, opts.panRange), now);
    input.connect(panner);
    input = panner;
    nodes.push(panner);
  }

  if (opts.reverbSend && system.reverbIn) {
    const send = ctx.createGain();
    send.gain.setValueAtTime(opts.reverbSend, now);
    reverbTap.connect(send);
    send.connect(system.reverbIn);
    nodes.push(send);
  }

  input.connect(system.busIn);
  return nodes;
}

export function scheduleNodeCleanup(ctx, endTime, nodes, cleanup) {
  let finished = false;
  const finalize = () => {
    if (finished) return;
    finished = true;
    nodes.forEach((node) => {
      if (!node) return;
      try {
        node.disconnect();
      } catch (_) {}
    });
    if (cleanup) cleanup();
  };
  const delayMs = Math.max(0, (endTime - ctx.currentTime) * 1000 + 40);
  setTimeout(finalize, delayMs);
  return finalize;
}

export function withEnvelope(gainNode, t0, attack, sustainLevel, release, duration) {
  const a = Math.max(0.003, Number.isFinite(attack) ? attack : 0.005);
  const r = Math.max(0.02, Number.isFinite(release) ? release : 0.05);
  const total = Math.max(a + r, Number.isFinite(duration) ? duration : a + r);
  const sustain = Number.isFinite(sustainLevel) ? sustainLevel : 1;
  const sustainEnd = Math.max(t0 + a, t0 + total - r);
  gainNode.gain.cancelScheduledValues(t0);
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.linearRampToValueAtTime(sustain, t0 + a);
  gainNode.gain.linearRampToValueAtTime(sustain, sustainEnd);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
  return t0 + total;
}
