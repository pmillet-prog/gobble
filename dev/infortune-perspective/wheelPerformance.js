import { readWheelGraphics, readWheelGraphicsPreference } from "../../src/features/infortune/graphics/wheelGraphicsStorage.js";
import { WHEEL_GRAPHICS_LIMITS } from "../../shared/wheelGraphicsRecommendation.js";

export const WHEEL_PROFILES = Object.freeze({
  detailed: { label: "3D détaillée", maxPixelRatio: 2, scale: 1, shadowSize: 1024, reflectionScale: 1, slices: 24, fps: 60 },
  balanced: { label: "3D équilibrée", maxPixelRatio: 1.5, scale: 0.85, shadowSize: 512, reflectionScale: 0.75, slices: 16, fps: 60 },
  light: { label: "3D légère", maxPixelRatio: 1, scale: 0.8, shadowSize: 256, reflectionScale: 0.5, slices: 8, fps: 30 },
  flat: { label: "2D", maxPixelRatio: 1.5, scale: 1, fps: 60 },
});
export const WHEEL_PERFORMANCE_KEY = "gobble.infortune.performance.v1";
const valid = value => Object.hasOwn(WHEEL_PROFILES, value);
const lower = profile => ({ detailed: "balanced", balanced: "light", light: "flat" }[profile] || "flat");

export function readWheelPerformance(storage, hints = {}, now = Date.now()) {
  let saved;
  try { saved = JSON.parse(storage?.getItem(WHEEL_PERFORMANCE_KEY)); } catch {}
  const preference = readWheelGraphicsPreference(storage);
  // Version 1 could remember a slow shader startup as a weak GPU. Retry those
  // automatic decisions once; explicit user choices remain authoritative.
  const fresh = saved?.version === 2 && now - saved.at >= 0 && now - saved.at < 14 * 86400000;
  const cautious = (hints.memory > 0 && hints.memory <= 2) || (hints.cores > 0 && hints.cores <= 2);
  const measured = readWheelGraphics(storage);
  return { preference, profile: preference !== "auto" ? preference
    : fresh && valid(saved?.profile) && (!measured || saved.at >= measured.at) ? saved.profile
      : measured?.profile || (cautious ? "light" : "balanced") };
}

export function summarizeWheelFrames(intervals, costs = [], target = 60) {
  const values = intervals.filter(value => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), total = values.reduce((sum, value) => sum + value, 0);
  return { fps: values.length * 1000 / total, p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    slowRatio: values.filter(value => value > 1500 / target + 2).length / values.length,
    renderMs: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0, samples: values.length };
}
export function wheelFramesAreSlow(metrics, profile) {
  return metrics && (metrics.fps < WHEEL_GRAPHICS_LIMITS.stableFps || metrics.p95 > WHEEL_GRAPHICS_LIMITS.p95Ms);
}

// No animation loop and no physics ownership. Called only for actual active
// frames; idle/hidden gaps and the first GPU preparation never become samples.
export function createWheelPerformance({ initial, onChange = () => {}, storage, now = Date.now }) {
  let state = { ...initial, metrics: null, timings: null, reason: "Réglage graphique mémorisé.", pending: null };
  let previous = null, intervals = [], costs = [], badWindows = 0, disposed = false;
  function resetSamples() { previous = null; intervals = []; costs = []; badWindows = 0; }
  function publish(save = false) {
    if (disposed) return;
    if (save) try { storage?.setItem(WHEEL_PERFORMANCE_KEY, JSON.stringify({ version: 2,
      preference: state.preference, profile: state.profile, at: now() })); } catch {}
    onChange({ ...state });
  }
  function change(profile, reason) {
    state = { ...state, profile, reason, pending: null, metrics: null }; resetSamples(); publish(true);
  }
  return {
    snapshot: () => ({ ...state }),
    resetSamples,
    setPreference(preference) {
      if (preference !== "auto" && !valid(preference)) return;
      state.preference = preference;
      change(preference === "auto" ? readWheelGraphics(storage)?.profile || "balanced" : preference, preference === "auto"
        ? "Réglage issu du diagnostic d’accueil." : "Qualité choisie manuellement.");
    },
    benchmark(intervals, costs, sampledProfile = state.profile) {
      // A manual selection during the sample must be measured at its own level.
      if (sampledProfile !== state.profile) return state.profile;
      state.metrics = summarizeWheelFrames(intervals, costs, 60); // Calibration is uncapped.
      const slow = wheelFramesAreSlow(state.metrics, state.profile);
      if (state.preference === "auto" && slow) change(lower(state.profile), "Qualité adaptée à la mesure du plateau.");
      else { state.reason = "Mesure initiale terminée."; publish(true); }
      resetSamples(); return state.profile;
    },
    frame(time, cost, active, canSwitch = true) {
      if (disposed || !active || state.profile === "flat") { previous = null; return; }
      if (previous !== null) { intervals.push(time - previous); costs.push(cost); }
      previous = time;
      if (intervals.length < 8 || intervals.reduce((a, b) => a + b, 0) < 1600) return;
      state.metrics = summarizeWheelFrames(intervals, costs, WHEEL_PROFILES[state.profile].fps);
      intervals = []; costs = [];
      badWindows = wheelFramesAreSlow(state.metrics, state.profile) ? badWindows + 1 : 0;
      if (state.preference === "auto" && badWindows >= 2) {
        const next = lower(state.profile);
        if (canSwitch) change(next, "Ralentissements persistants : qualité allégée.");
        else { state.pending = next; state.reason = "Qualité allégée à la fin du geste."; publish(); }
      } else publish();
    },
    applyPending() { if (state.pending) change(state.pending, "Qualité allégée après le geste."); },
    startupSlow({ step }) {
      // Driver compilation is not a frame-rate measurement. Keep preparing;
      // the user can choose 2D immediately, or let the actual benchmark decide.
      state.reason = `Préparation 3D encore en cours (${step}). La fluidité sera mesurée ensuite.`;
      publish(); return false;
    },
    fail() { change("flat", "La 3D est indisponible : passage en 2D."); },
    timings(value) { state.timings = value; publish(); },
    dispose() { disposed = true; resetSamples(); },
  };
}

export function createWheelFrameGate() {
  let next = null;
  return { reset() { next = null; }, due(time, fps) {
    const step = 1000 / fps;
    if (next !== null && time < next - 0.5) return false;
    next = next === null || time - next > step * 2 ? time + step : next + step;
    return true;
  } };
}
