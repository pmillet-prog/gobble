export const SOUND_MASTER_VOLUME_DEFAULT = 1;

export const SOUND_ENABLED_FIELDS = Object.freeze([
  'soundValidationEnabled', 'soundInvalidErrorEnabled', 'soundTileStepEnabled',
  'soundTimerEnabled', 'soundGobbleEnabled', 'soundWheelIntroEnabled',
]);

export function soundSettingsSummary(settings) {
  const ambientOn = !settings.isAmbientMuted;
  const enabledSoundCount = [ambientOn, ...SOUND_ENABLED_FIELDS.map(field => settings[field])].filter(Boolean).length;
  return { ambientOn, enabledSoundCount, allSoundOn: enabledSoundCount === SOUND_ENABLED_FIELDS.length + 1 };
}

export function normalizeSoundMasterVolume(
  raw,
  fallback = SOUND_MASTER_VOLUME_DEFAULT
) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}
