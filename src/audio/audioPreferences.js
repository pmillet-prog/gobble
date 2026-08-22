export const SOUND_MASTER_VOLUME_DEFAULT = 1;

export function normalizeSoundMasterVolume(
  raw,
  fallback = SOUND_MASTER_VOLUME_DEFAULT
) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}
