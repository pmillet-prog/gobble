import AssetManager from "./assetManager.js";

export const UI_IMAGE_KEYS = Object.freeze({
  home: Object.freeze({
    title: "img_ui_home_title",
    account: "img_ui_home_account",
    duel: "img_ui_home_duel",
    playBlue: "img_ui_home_play_blue",
    playRed: "img_ui_home_play_red",
    players: "img_ui_home_players",
    vault: "img_ui_home_vault",
    stats: "img_ui_home_stats",
    daily: "img_ui_home_daily",
    chat: "img_ui_home_chat",
    settings: "img_ui_home_settings",
    backgroundDesktopBlue: "img_ui_home_background_desktop_blue",
    backgroundDesktopRed: "img_ui_home_background_desktop_red",
    backgroundMobileBlue: "img_ui_home_background_mobile_blue",
    backgroundMobileRed: "img_ui_home_background_mobile_red",
  }),
  live: Object.freeze({
    backgroundDesktopBlue: "img_ui_live_background_desktop_blue",
    backgroundDesktopRed: "img_ui_live_background_desktop_red",
    backgroundMobileBlue: "img_ui_live_background_mobile_blue",
    backgroundMobileRed: "img_ui_live_background_mobile_red",
    salonBlue: "img_ui_live_salon_blue",
    salonRed: "img_ui_live_salon_red",
    readyBlue: "img_ui_live_ready_blue",
    readyRed: "img_ui_live_ready_red",
    readyValidated: "img_ui_live_ready_validated",
    returnBlue: "img_ui_live_return_blue",
    returnRed: "img_ui_live_return_red",
    trainingBlue: "img_ui_live_training_blue",
    trainingRed: "img_ui_live_training_red",
    chat: "img_ui_live_chat",
  }),
});

function defineUiImage(key, encodedBasePath, stage, viewport = null) {
  return Object.freeze({
    key,
    candidates: [`${encodedBasePath}.webp`, `${encodedBasePath}.png`],
    stage,
    viewport,
  });
}

const UI_IMAGE_DEFINITIONS = Object.freeze([
  defineUiImage(UI_IMAGE_KEYS.home.title, "/buttons/titre%20gobble", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.account, "/buttons/compte", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.duel, "/buttons/duels", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.playBlue, "/buttons/bouton%20jouer%20bleu", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.playRed, "/buttons/bouton%20jouer%20rouge", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.players, "/buttons/bouton%20joueurs", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.vault, "/buttons/coffre%20fort", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.stats, "/buttons/stats", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.daily, "/buttons/daily", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.chat, "/buttons/chat%20accueil", "home"),
  defineUiImage(UI_IMAGE_KEYS.home.settings, "/buttons/settings", "home"),
  defineUiImage(
    UI_IMAGE_KEYS.home.backgroundDesktopBlue,
    "/background/desktop%20bleu",
    "home",
    "wide"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.home.backgroundDesktopRed,
    "/background/desktop%20rouge",
    "home",
    "wide"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.home.backgroundMobileBlue,
    "/background/mobile%20bleu",
    "home",
    "tall"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.home.backgroundMobileRed,
    "/background/mobile%20rouge",
    "home",
    "tall"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.live.backgroundDesktopBlue,
    "/background/lobby%20desk%20bleu",
    "live",
    "wide"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.live.backgroundDesktopRed,
    "/background/lobby%20desk%20rouge",
    "live",
    "wide"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.live.backgroundMobileBlue,
    "/background/lobby%20smart%20bleu",
    "live",
    "tall"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.live.backgroundMobileRed,
    "/background/lobby%20smart%20rouge",
    "live",
    "tall"
  ),
  defineUiImage(UI_IMAGE_KEYS.live.salonBlue, "/buttons/salon%20bleu", "live"),
  defineUiImage(UI_IMAGE_KEYS.live.salonRed, "/buttons/salon%20rouge", "live"),
  defineUiImage(UI_IMAGE_KEYS.live.readyBlue, "/buttons/pret%20bleu", "live"),
  defineUiImage(UI_IMAGE_KEYS.live.readyRed, "/buttons/pret%20rouge", "live"),
  defineUiImage(
    UI_IMAGE_KEYS.live.readyValidated,
    "/buttons/pret%20valid%C3%A9",
    "live"
  ),
  defineUiImage(UI_IMAGE_KEYS.live.returnBlue, "/buttons/bouton%20retour%20bleu", "live"),
  defineUiImage(UI_IMAGE_KEYS.live.returnRed, "/buttons/bouton%20retour%20rouge", "live"),
  defineUiImage(
    UI_IMAGE_KEYS.live.trainingBlue,
    "/buttons/entra%C3%AEnement%20bleu",
    "live"
  ),
  defineUiImage(
    UI_IMAGE_KEYS.live.trainingRed,
    "/buttons/eintra%C3%AEnement%20rouge",
    "live"
  ),
  defineUiImage(UI_IMAGE_KEYS.live.chat, "/buttons/chat", "live"),
]);

const UI_IMAGE_BY_KEY = new Map(UI_IMAGE_DEFINITIONS.map((entry) => [entry.key, entry]));

export function detectWideUiViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(min-aspect-ratio: 1/1)").matches;
}

export function buildUiAssetManifest({ preferWide = detectWideUiViewport() } = {}) {
  const currentViewport = preferWide ? "wide" : "tall";
  return UI_IMAGE_DEFINITIONS.map((entry) => {
    const isCurrentViewport = !entry.viewport || entry.viewport === currentViewport;
    const priority = !isCurrentViewport ? "low" : entry.stage === "home" ? "critical" : "high";
    return {
      key: entry.key,
      type: "image",
      candidates: entry.candidates,
      priority,
      meta: {
        browserManaged: true,
        uiStage: entry.stage,
        viewport: entry.viewport,
      },
    };
  });
}

export function getDeferredUiAssetKeys({ preferWide = detectWideUiViewport() } = {}) {
  const deferredViewport = preferWide ? "tall" : "wide";
  return UI_IMAGE_DEFINITIONS.filter((entry) => entry.viewport === deferredViewport).map(
    (entry) => entry.key
  );
}

export function scheduleDeferredUiAssetPreload({
  preferWide = detectWideUiViewport(),
  timeoutMs = 1800,
} = {}) {
  if (typeof window === "undefined") return () => {};
  const keys = getDeferredUiAssetKeys({ preferWide });
  let cancelled = false;
  const run = () => {
    if (cancelled || !keys.length) return;
    void AssetManager.preload({
      priority: "all",
      includeTypes: ["image"],
      keys,
      concurrency: 2,
    });
  };
  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(run, { timeout: timeoutMs });
    return () => {
      cancelled = true;
      window.cancelIdleCallback?.(idleId);
    };
  }
  const timerId = window.setTimeout(run, Math.min(500, timeoutMs));
  return () => {
    cancelled = true;
    window.clearTimeout(timerId);
  };
}

export function getUiImageUrl(key) {
  if (!key) return "";
  const loadedUrl = AssetManager.getImage(key).url || "";
  if (loadedUrl) return loadedUrl;
  return UI_IMAGE_BY_KEY.get(key)?.candidates?.[0] || "";
}

function normalizeTeamColor(team) {
  return team === "red" ? "Red" : "Blue";
}

export function getHomeBackgroundKey(team, viewport) {
  const suffix = normalizeTeamColor(team);
  return UI_IMAGE_KEYS.home[`background${viewport === "wide" ? "Desktop" : "Mobile"}${suffix}`];
}

export function getLiveBackgroundKey(team, viewport) {
  const suffix = normalizeTeamColor(team);
  return UI_IMAGE_KEYS.live[`background${viewport === "wide" ? "Desktop" : "Mobile"}${suffix}`];
}

export function getLiveTeamImageKey(kind, team) {
  const suffix = normalizeTeamColor(team);
  return UI_IMAGE_KEYS.live[`${kind}${suffix}`];
}

export const UI_IMAGE_DEFINITION_COUNT = UI_IMAGE_DEFINITIONS.length;
