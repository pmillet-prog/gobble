export const PODIUM_TYPOGRAPHY_STORAGE_KEY = "gobble:dev:podium-typography:v1";

export const PODIUM_MATERIALS = Object.freeze([
  { key: "gold", label: "Or", className: "nick-podium-gold" },
  { key: "silver", label: "Argent", className: "nick-podium-silver" },
  { key: "bronze", label: "Bronze", className: "nick-podium-bronze" },
]);

export const DEFAULT_PODIUM_TYPOGRAPHY_SETTINGS = Object.freeze({
  gold: Object.freeze({
    base: Object.freeze({ r: 255, g: 196, b: 0 }),
    shadow: Object.freeze({ r: 112, g: 72, b: 0, a: 0.52 }),
    reflection: Object.freeze({ r: 255, g: 255, b: 0, a: 1 }),
    reliefOffsetX: 0.75,
    reliefOffset: 2,
    halo: Object.freeze({ r: 255, g: 196, b: 0, a: 0.18 }),
    haloBlur: 3,
  }),
  silver: Object.freeze({
    base: Object.freeze({ r: 148, g: 163, b: 184 }),
    shadow: Object.freeze({ r: 15, g: 23, b: 42, a: 0.72 }),
    reflection: Object.freeze({ r: 255, g: 255, b: 255, a: 0.92 }),
    reliefOffsetX: 0.75,
    reliefOffset: 2,
    halo: Object.freeze({ r: 203, g: 213, b: 225, a: 0.16 }),
    haloBlur: 3,
  }),
  bronze: Object.freeze({
    base: Object.freeze({ r: 194, g: 65, b: 12 }),
    shadow: Object.freeze({ r: 67, g: 20, b: 7, a: 0.78 }),
    reflection: Object.freeze({ r: 255, g: 218, b: 153, a: 0.9 }),
    reliefOffsetX: 0.75,
    reliefOffset: 2,
    halo: Object.freeze({ r: 251, g: 146, b: 60, a: 0.16 }),
    haloBlur: 3,
  }),
});

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeRgb(value, fallback, withAlpha) {
  const normalized = {
    r: Math.round(clamp(value?.r ?? fallback.r, 0, 255)),
    g: Math.round(clamp(value?.g ?? fallback.g, 0, 255)),
    b: Math.round(clamp(value?.b ?? fallback.b, 0, 255)),
  };
  if (withAlpha) {
    normalized.a = Math.round(clamp(value?.a ?? fallback.a, 0, 1) * 100) / 100;
  }
  return normalized;
}

export function normalizePodiumTypographySettings(value) {
  return Object.fromEntries(
    PODIUM_MATERIALS.map(({ key }) => {
      const fallback = DEFAULT_PODIUM_TYPOGRAPHY_SETTINGS[key];
      const candidate = value?.[key];
      return [
        key,
        {
          base: normalizeRgb(candidate?.base, fallback.base, false),
          shadow: normalizeRgb(candidate?.shadow, fallback.shadow, true),
          reflection: normalizeRgb(candidate?.reflection, fallback.reflection, true),
          reliefOffsetX:
            Math.round(clamp(candidate?.reliefOffsetX ?? fallback.reliefOffsetX, -5, 5) * 4) /
            4,
          reliefOffset:
            Math.round(clamp(candidate?.reliefOffset ?? fallback.reliefOffset, 0, 5) * 4) / 4,
          halo: normalizeRgb(candidate?.halo, fallback.halo, true),
          haloBlur:
            Math.round(clamp(candidate?.haloBlur ?? fallback.haloBlur, 0, 10) * 2) / 2,
        },
      ];
    })
  );
}

export function getDefaultPodiumTypographySettings() {
  return normalizePodiumTypographySettings(DEFAULT_PODIUM_TYPOGRAPHY_SETTINGS);
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch (_) {
    return null;
  }
}

export function loadPodiumTypographySettings(storage = null) {
  const fallback = getDefaultPodiumTypographySettings();
  try {
    const raw = resolveStorage(storage)?.getItem(PODIUM_TYPOGRAPHY_STORAGE_KEY);
    return raw ? normalizePodiumTypographySettings(JSON.parse(raw)) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function savePodiumTypographySettings(settings, storage = null) {
  const normalized = normalizePodiumTypographySettings(settings);
  try {
    resolveStorage(storage)?.setItem(PODIUM_TYPOGRAPHY_STORAGE_KEY, JSON.stringify(normalized));
  } catch (_) {}
  return normalized;
}

export function applyPodiumTypographySettings(settings, root = null) {
  const normalized = normalizePodiumTypographySettings(settings);
  const target =
    root || (typeof document !== "undefined" ? document.documentElement : null);
  if (!target?.style) return normalized;

  PODIUM_MATERIALS.forEach(({ key }) => {
    const material = normalized[key];
    target.style.setProperty(
      `--podium-${key}-base-rgb`,
      `${material.base.r} ${material.base.g} ${material.base.b}`
    );
    target.style.setProperty(
      `--podium-${key}-shadow-rgb`,
      `${material.shadow.r} ${material.shadow.g} ${material.shadow.b}`
    );
    target.style.setProperty(`--podium-${key}-shadow-alpha`, String(material.shadow.a));
    target.style.setProperty(
      `--podium-${key}-reflection-rgb`,
      `${material.reflection.r} ${material.reflection.g} ${material.reflection.b}`
    );
    target.style.setProperty(
      `--podium-${key}-reflection-alpha`,
      String(material.reflection.a)
    );
    target.style.setProperty(
      `--podium-${key}-relief-offset-x`,
      `${material.reliefOffsetX}px`
    );
    target.style.setProperty(
      `--podium-${key}-relief-offset`,
      `${material.reliefOffset}px`
    );
    target.style.setProperty(
      `--podium-${key}-halo-rgb`,
      `${material.halo.r} ${material.halo.g} ${material.halo.b}`
    );
    target.style.setProperty(`--podium-${key}-halo-alpha`, String(material.halo.a));
    target.style.setProperty(`--podium-${key}-halo-blur`, `${material.haloBlur}px`);
  });

  return normalized;
}

export function initializePodiumTypographySettings() {
  return applyPodiumTypographySettings(loadPodiumTypographySettings());
}
