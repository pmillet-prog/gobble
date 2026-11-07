import { WHEEL_GRAPHICS_POLICY_VERSION, recommendWheelGraphics, wheelDiagnosticPreference } from "../../../../shared/wheelGraphicsRecommendation.js";

export const WHEEL_GRAPHICS_KEY = "gobble.wheel.graphics-device.v1";
export const WHEEL_PREFERENCE_KEY = "gobble.infortune.performance.v1";
const profiles = ["flat", "light", "balanced", "detailed"];
const failedStorage = new WeakMap(), unavailableStorage = new Map();
export const graphicsStorage = () => { try { return globalThis.localStorage; } catch { return null; } };
function fallback(storage) {
  if (!storage) return unavailableStorage;
  if (!failedStorage.has(storage)) failedStorage.set(storage, new Map());
  return failedStorage.get(storage);
}
function read(storage, key = WHEEL_GRAPHICS_KEY) {
  if (fallback(storage).has(key)) return fallback(storage).get(key);
  try { return JSON.parse(storage?.getItem(key)) || {}; } catch { return {}; }
}
function write(storage, state, key = WHEEL_GRAPHICS_KEY) {
  try { if (!storage) throw Error("unavailable"); storage.setItem(key, JSON.stringify(state)); fallback(storage).delete(key); }
  catch { fallback(storage).set(key, state); }
  return state;
}
export function wheelGraphicsDevice(storage = graphicsStorage()) {
  const stored = read(storage);
  if (/^[\w-]{16,80}$/.test(stored.deviceId || "")) return stored.deviceId;
  const id = globalThis.crypto?.randomUUID?.() || `wheel-device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  write(storage, { ...stored, deviceId: id }); return id;
}
export function readWheelGraphics(storage = graphicsStorage()) {
  const state = read(storage);
  return state.version === WHEEL_GRAPHICS_POLICY_VERSION && profiles.includes(state.profile) ? state : null;
}
export const isWheelGraphicsFallback = value => ["interrupted", "timeout", "needs_measurement"].includes(value?.reason);
export function saveWheelGraphics(recommendation, { storage = graphicsStorage(), reportId = null, now = Date.now() } = {}) {
  if (!profiles.includes(recommendation?.profile)) return null;
  const previous = readWheelGraphics(storage);
  // An unfinished recheck does not invalidate a completed measurement. Keep
  // the existing device result, including its timestamp and report identity.
  if (isWheelGraphicsFallback(recommendation) && previous && !isWheelGraphicsFallback(previous))
    return write(storage, { ...previous, pending: false, lastCheck: { reason: recommendation.reason, at: now } });
  return write(storage, { deviceId: wheelGraphicsDevice(storage), version: WHEEL_GRAPHICS_POLICY_VERSION,
    profile: recommendation.profile, reason: recommendation.reason, reportId, at: now, pending: false });
}
export function rememberWheelDiagnostic(report, storage = graphicsStorage()) {
  const recommendation = recommendWheelGraphics(report);
  if (recommendation.profile) saveWheelGraphics(recommendation, { storage, reportId: report.id });
  const preference = wheelDiagnosticPreference(report);
  if (preference) { setWheelGraphicsPreference(preference, storage); endWheelGraphicsCheck(storage); }
  return recommendation;
}
export function beginWheelGraphicsCheck(storage = graphicsStorage()) {
  write(storage, { ...read(storage), deviceId: wheelGraphicsDevice(storage), pending: true });
}
export function interruptedWheelGraphicsCheck(storage = graphicsStorage()) { return read(storage).pending === true; }
export function endWheelGraphicsCheck(storage = graphicsStorage()) { write(storage, { ...read(storage), pending: false }); }
export function readWheelGraphicsPreference(storage = graphicsStorage()) {
  const value = read(storage, WHEEL_PREFERENCE_KEY);
  return profiles.includes(value?.preference) ? value.preference : "auto";
}
export function setWheelGraphicsPreference(preference, storage = graphicsStorage()) {
  if (preference !== "auto" && !profiles.includes(preference)) return;
  const profile = preference === "auto" ? readWheelGraphics(storage)?.profile || "balanced" : preference;
  write(storage, { version: 2, preference, profile, at: Date.now() }, WHEEL_PREFERENCE_KEY);
}
