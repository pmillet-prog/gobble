const STORAGE_KEY = "gobbleChatDrawerCalibration:v1";
export const CHAT_DRAWER_CALIBRATION_MIN_RATIO = 0.42;
export const CHAT_DRAWER_CALIBRATION_MAX_RATIO = 0.78;

const clampRatio = (ratio) =>
  Math.max(
    CHAT_DRAWER_CALIBRATION_MIN_RATIO,
    Math.min(CHAT_DRAWER_CALIBRATION_MAX_RATIO, ratio)
  );

export function getChatDrawerOrientationKey() {
  if (typeof window === "undefined") return "portrait";
  const width = Number(window.innerWidth) || 0;
  const height = Number(window.innerHeight) || 0;
  return width > height ? "landscape" : "portrait";
}

export function normalizeChatDrawerCalibration(calibration) {
  const ratio = Number(calibration?.ratio);
  const heightPx = Number(calibration?.heightPx);
  const orientation = String(calibration?.orientation || "").trim() || "portrait";
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (!Number.isFinite(heightPx) || heightPx <= 0) return null;
  return {
    ratio: clampRatio(ratio),
    heightPx: Math.max(1, Math.round(heightPx)),
    orientation,
  };
}

export function readStoredChatDrawerCalibration() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeChatDrawerCalibration(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

export function writeStoredChatDrawerCalibration(calibration) {
  if (typeof localStorage === "undefined") return;
  const normalized = normalizeChatDrawerCalibration(calibration);
  if (!normalized) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...normalized, updatedAt: Date.now() })
    );
  } catch (_) {}
}
