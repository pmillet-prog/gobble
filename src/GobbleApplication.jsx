// Fichier UTF-8 : conserver les accents, emojis et règles de normalisation (??, etc.). Ne pas convertir d'encodage.
// 
import React, { Suspense, useEffect, useState, useRef, useLayoutEffect } from "react";
import "./styles/desktopResponsive.css";
import "./styles/gameRuntime.css";
import { playBlackHoleOutro3D } from "./effects/blackHoleOutro3D.js";
import { createCelebrationEffects } from "./effects/createCelebrationEffects.js";
import {
  TILE_LETTER_SCALE_MIN,
  TILE_LETTER_SCALE_MAX,
  TILE_LETTER_SCALE_DEFAULT,
  normalizeTileLetterScale,
  getThemeCategoryValue,
  getTileMaterialClass,
  getTileColorTextureStyle,
  getTileColorSwatchStyle,
  THEME_UNLOCK_COST_DEFAULT,
  THEME_LOCKABLE_CATEGORIES,
  TILE_COLOR_OPTIONS,
  FONT_OPTIONS,
  LETTER_COLOR_OPTIONS,
  BACKGROUND_OPTIONS,
  MATERIAL_OPTIONS,
  SPECIAL_INDICATOR_OPTIONS,
  UI_CONTRAST_OPTIONS,
  GRID_SURFACE_OPTIONS,
  DEFAULT_THEME_PRESET,
  TILE_COLOR_MAP,
  FONT_MAP,
  LETTER_COLOR_MAP,
  BACKGROUND_MAP,
  MATERIAL_MAP,
  SPECIAL_INDICATOR_MAP,
  UI_CONTRAST_MAP,
  GRID_SURFACE_MAP,
  THEME_PRESET_CATEGORIES,
  THEME_PICKER_OPTIONS,
  THEME_PICKER_LABELS,
  getThemeUnlockItemKey,
  isThemeCategoryLockableGlobal,
  isThemeOptionIdKnown,
  isThemeOptionLockableGlobal,
  isThemeOptionUnlockedFromMap,
  normalizeThemePreset,
  normalizeThemeUnlocks,
  hasAnyThemeUnlock,
  coerceThemeToLegacyNativeDefault,
} from "./theme/themeConfig.js";
import {
  useApplicationFields,
  useApplicationKernel,
  useApplicationSelector,
} from "./app/react/ApplicationRuntimeProvider.jsx";
import {
  useFeatureFields,
  useFeatureRuntime,
  useFeatureSelector,
} from "./app/react/useFeatureRuntime.js";
import {
  useLazyArrayController,
  useLazyObjectController,
} from "./app/react/useLazyController.js";
import { bindRoundClockAudio } from "./features/clock/bindRoundClockAudio.js";
import { useRoundClockController } from "./features/clock/RoundClockController.jsx";
import { useIntermissionClockController } from "./features/intermission/IntermissionClockController.jsx";
import IntermissionCountdownLabel from "./features/intermission/IntermissionCountdownLabel.jsx";
import confetti from "canvas-confetti";
import {
  recordAppRender,
  recordPerfEvent,
  setPerfProbeEnabled,
} from "./perf/renderPerfProbe.js";
import {
  AMBIENT_MUSIC_TRACKS_DEFAULT,
  REGISTERED_SFX_MANIFEST,
  SOUND_MASTER_VOLUME_DEFAULT,
  buildSfxManifest,
  loadAmbientTrackList,
  normalizeSoundMasterVolume,
  purgeRuntimeMediaCache,
} from "./audio/audioAssets";
import useAudioEngine from "./audio/useAudioEngine";
import useAmbientMusic from "./audio/useAmbientMusic";
import useGameSounds from "./audio/useGameSounds";
import useElementSize from "./hooks/useElementSize.js";
import useSwipeTrackController from "./hooks/useSwipeTrackController.js";
import useRealtimeEventBindings from "./hooks/useRealtimeEventBindings.js";
import useRoundLifecycle from "./hooks/useRoundLifecycle.js";
import useMobileRoundIntro from "./hooks/useMobileRoundIntro.js";
import useDesktopLayoutController from "./hooks/useDesktopLayoutController.js";
import useGridTransitionEffects from "./hooks/useGridTransitionEffects.js";
import {
  clampDesktopColumnResizeDelta,
  computeDesktopColumnUiScales,
  computeDesktopGridChrome,
  computeDesktopGridResizeMaxTrackWidth,
  computeDesktopUiScale,
  computeDesktopViewportHeight,
} from "./utils/desktopResponsiveLayout.js";
import {
  computePreferLiteVisualEffects,
  getDefaultRoomId,
  getViewportSize,
} from "./app/adapters/deviceCapabilities.js";
import { VIEWPORT_EVENTS } from "./features/layout/createViewportEventHub.js";
import {
  DAILY_DESKTOP_COLUMN_DEFAULT_FRACTIONS,
  DAILY_DESKTOP_COLUMN_DEFS,
  DAILY_DESKTOP_COLUMN_MIN_WIDTHS_PX,
  DAILY_DESKTOP_COLUMN_TEMPLATE,
  DESKTOP_COLUMN_DEFAULT_FRACTIONS,
  DESKTOP_COLUMN_MIN_WIDTHS_PX,
  GRID_COL_TEMPLATE,
  LIVE_DESKTOP_COLUMN_DEFS,
  areDesktopFractionsEqual,
  normalizeDesktopColumnFractions,
  normalizeDesktopColumnOrder,
  readDesktopColumnFractionsForInstall,
  readDesktopColumnOrderForInstall,
  writeDesktopColumnFractionsForInstall,
  writeDesktopColumnOrderForInstall,
} from "./app/adapters/desktopLayoutStorage.js";
import {
  getChatDrawerOrientationKey,
  readStoredChatDrawerCalibration,
  writeStoredChatDrawerCalibration,
} from "./app/adapters/chatDrawerCalibration.js";
import {
  buildUserScopedInstallId,
  getInstallIdCreatedAtTs,
  getOrCreateInstallId,
  normalizeInstallId,
} from "./app/adapters/browserIdentity.js";
import { clampValue, formatNumber } from "./utils/numbers.js";
import AssetManager from "./assets/assetManager";
import { IMAGE_KEYS, SFX_KEYS } from "./assets/assetKeys";
import { IMAGE_FALLBACKS, makeFileKey } from "./assets/bootAssetManifest.js";
import {
  buildUiAssetManifest,
  detectWideUiViewport,
  getHomeBackgroundKey,
  getUiImageUrl,
  scheduleDeferredUiAssetPreload,
} from "./assets/uiAssetManifest.js";
import { VOCAB_LEVELS, getVocabLevelMeta } from "./vocabRanks";
import { createPortal, flushSync } from "react-dom";
import { patchFirstMatchingFeedEntry } from "./game/liveFeedReconciliation.js";
import { createWordSubmissionEngine } from "./game/createWordSubmissionEngine.js";
import {
  normalizeRotationTurns,
  rotateIndexByTurns,
} from "./game/gridRotation.js";
import {
  MASSIVE_BOGGLE_TYPE,
  isRareBonusEnabledForSpecial,
} from "./game/specialRoundTypes.js";
import {
  disposeClientSolverWorker,
  solveGridInWorker,
} from "./compute/clientSolverWorker.js";
import {
  LIVE_CONNECTION_INTERRUPTED_MESSAGE,
  capturePendingSubmissions,
  queuePendingSubmissionWords,
  reconcilePendingSubmissions,
  restorePendingSubmissionState,
  takeInFlightSubmissionWords,
} from "./network/liveSubmissionRecovery.js";
import GlobalChatLayer from "./components/chat/GlobalChatLayer.jsx";
import ChatReactionToastSatellite from "./features/chat/ChatReactionToastSatellite.jsx";
import { createChatInteractionController } from "./components/chat/createChatInteractionController.js";
import {
  CHAT_BOT_VISIBILITY_OPTIONS,
  CHAT_BOT_VISIBILITY_STORAGE_KEY,
  CHAT_SHOW_BOT_MESSAGES_STORAGE_KEY,
  isChatBotMessage,
  shouldDisplayChatMessageForBotSettings,
} from "./components/chat/chatBotVisibility.js";
import {
  CHAT_DESKTOP_FONT_SCALE_DEFAULT,
  CHAT_DESKTOP_FONT_SCALE_MAX,
  CHAT_DESKTOP_FONT_SCALE_MIN,
  CHAT_DESKTOP_FONT_SCALE_STEP,
  CHAT_REACTION_EMOJIS,
  DESKTOP_CHAT_EMOJIS,
  QUICK_REPLIES,
} from "./components/chat/chatPresentationConfig.js";
import MobileGrid from "./components/MobileGrid.jsx";
import DuelWeeklyWidget from "./components/DuelWeeklyWidget.jsx";
import AutoScaleInline from "./components/AutoScaleInline.jsx";
import FacebookGroupInviteModal from "./components/FacebookGroupInviteModal.jsx";
import GameCelebrationOverlay from "./components/GameCelebrationOverlay.jsx";
import ScoreFlightSatellite from "./features/live/ScoreFlightSatellite.jsx";
import NotificationToastLayer from "./features/notifications/NotificationToastLayer.jsx";
import { useSettledGameProgress } from "./features/progress/useSettledGameProgress.js";
import { useCelebrationRuntime } from "./features/celebration/CelebrationRuntime.jsx";
import { useTraceRuntime } from "./features/trace/TraceRuntime.jsx";
import {
  RESULTS_SLIDE_IN_MS,
  RESULTS_SLIDE_OUT_MS,
} from "./components/results/SwapFadeText.jsx";
import useFinalRanking from "./components/results/useFinalRanking.jsx";
import useDesktopResultsPresentation from "./components/results/useDesktopResultsPresentation.jsx";
import useEndStats from "./components/results/useEndStats.js";
import useResultsAwards from "./components/results/useResultsAwards.js";
import { createRoundPlayerDetailsController } from "./components/results/createRoundPlayerDetailsController.js";
import { createResultsWordInspector } from "./components/results/createResultsWordInspector.js";
import { WEEKLY_RECORD_LABELS } from "./components/results/weeklyRecordLabels.js";
import RoundPlayerDetailsModalHost from "./components/RoundPlayerDetailsModalHost.jsx";
import RoundPreparationOverlay from "./components/RoundPreparationOverlay.jsx";
import AuthDialogHost from "./components/AuthDialogHost.jsx";
import {
  createEmptyAuthForm,
  normalizeAuthUsernameInput,
} from "./components/auth/authFormModel.js";
import { createAuthController } from "./components/auth/createAuthController.js";
import TrainingJoinLiveDialog from "./components/training/TrainingJoinLiveDialog.jsx";
import TrainingSessionControls from "./components/training/TrainingSessionControls.jsx";
import StandaloneTrainingPicker from "./components/training/StandaloneTrainingPicker.jsx";
import PlayerProfileModalHost from "./components/PlayerProfileModalHost.jsx";
import MobileRoundIntroOverlay from "./components/mobile/MobileRoundIntroOverlay.jsx";
import WeeklyNickLine from "./components/stats/WeeklyNickLine.jsx";
import {
  createWeeklyStatsRuntimeModel,
  getWeeklyEntryKey,
  getWeeklyMetricValue,
} from "./components/stats/weeklyStatsModel.js";
import useTutorialPresentation from "./components/tutorial/useTutorialPresentation.jsx";
import {
  OCID_INVALID_BLUFF_MESSAGES,
  OCID_NO_VOTER_MESSAGES,
  OCID_SELF_WRONG_INVALID_VOTE_MESSAGES,
  OCID_SELF_WRONG_VALID_VOTE_MESSAGES,
  OCID_VALID_BLUFF_MESSAGES,
  formatOcidMessage,
  pickStableOcidMessage,
} from "./components/ocid/ocidFeedback.js";
import useGridDragPipeline from "./components/grid/useGridDragPipeline.js";
import useGridHitboxController from "./components/grid/useGridHitboxController.js";
import useDailyDuelStandalonePrep from "./components/daily/useDailyDuelStandalonePrep.js";
import useDailySpecialInteraction, {
  getDailySpecialDragTransform,
} from "./components/daily/useDailySpecialInteraction.js";
import { createDailyGameController } from "./components/daily/createDailyGameController.js";
import { getParisDateIdClient } from "./components/daily/dailyHistoryModel.js";
import {
  DAILY_FAKE_TWINS_MODE,
  DAILY_MONSTROUS_MODE,
  DAILY_SPECIAL_MODE,
} from "./components/daily/dailyModes.js";
import {
  DAILY_SPECIAL_BONUSES,
  DAILY_SPECIAL_WORD_TARGET,
  applyDailySpecialPlacements,
  createDailySpecialPlacements,
  createDailyWordSlots,
  getDailySpecialWordBlockedReason,
  getDailySpecialWordStartTile,
  getEffectiveDailySpecialPlacements,
  normalizeBonusLabel,
  stripBoardBonuses,
} from "./components/daily/dailySpecialModel.js";
import HomeLobby from "./components/home/HomeLobby.jsx";
import { pickVaultWordOfDayCandidates } from "./components/home/vaultWordCandidates.js";
import useHomeLobbyActions from "./components/home/useHomeLobbyActions.js";
import GridTileLetter from "./components/GridTileLetter.jsx";
import useWordVault from "./utils/useWordVault";
import { useGlobalRedAnnouncement } from "./hooks/useGlobalRedAnnouncement.js";
import { usePlaytimeLimit } from "./hooks/usePlaytimeLimit.js";
import { useFinaleNavigation, useResultsNavigation } from "./hooks/useResultsNavigation.js";
import useDisplayMode from "./hooks/useDisplayMode.js";
import useAccountSeenMarkers from "./hooks/useAccountSeenMarkers.js";
import {
  CHAT_MESSAGES_HISTORY_MAX,
  CHAT_MESSAGES_STORAGE_KEY,
  CHAT_SYSTEM_HISTORY_MAX,
  capChatMessagesByType,
  findNewReactionFromOthers,
  formatChatMessageTime,
  formatChatUnreadSuffix,
  getChatMessageReactionEntries,
  getChatMessageReplyPreview,
  getChatMessageSortTime,
  isEditedChatMessage,
  isSystemAuthor,
  isSystemChatMessage,
  normalizeChatMessageShape,
  normalizeChatReplyPreview,
  normalizeLegacyChatEmoticons,
  patchChatMessageById,
  patchChatMessageReactions,
  readStoredChatMessages,
  removeChatMessageById,
} from "./utils/chatMessages";
import {
  readDuelObjectiveAnimationsState,
  writeDuelObjectiveAnimationsState,
} from "./utils/duelObjectiveAnimationsStorage";
import {
  FAKE_TWINS_MIN_WORD_LENGTH,
  FAKE_TWINS_TYPE,
  OCID_TYPE,
  buildPathWordVariants,
  computeScore,
  filterDictionary,
  findBestPathForPreview,
  findBestPathForWord,
  neighbors,
  normalizeWord,
  scoreWordOnGridWithPath,
  solveAll,
  summarizeBonuses,
  tileScore,
} from "./components/gameLogic";
import {
  FINALE_TILE_BONUS_MULTIPLIER,
  FINALE_TYPE,
} from "../shared/finaleRules.js";
import { generateGrid } from "./components/gridGeneration";
import { hydrateServerSolutionsPayload } from "./utils/roundSolutions";
import {
  buildStandaloneTrainingTargetSummary,
  buildTrainingTargetHintSchedule,
} from "./training/standaloneTraining.js";
import {
  buildTargetHintOverlayStyleMap,
  buildTargetHintStyleMap,
} from "./utils/targetHintStyles.js";
import { isLiveSessionFreshForBoot } from "./utils/liveSessionFreshness.js";
import { shouldProcessLiveRoomEvent } from "./utils/liveEventScope.js";
import { hasActiveChatDraft } from "./utils/mobileChatHandoff.js";
import { resolveScoreFlightPoints } from "./utils/scoreFlightPoints.js";
import {
  buildDefinitionFallbacks,
  pickDefinitionList,
  pickDefinitionText,
  sanitizeDefinitionText,
} from "./utils/definitionPayload.js";
import {
  ROUND_PREPARATION_FALLBACK_GRACE_MS,
  isRoundStartPreparationDelayed,
  shouldShowRoundPreparationOverlay,
} from "./utils/roundPreparation.js";
import {
  createMonotonicDeadline,
  createServerClockState,
  getDeadlineRemainingSeconds,
  getDelayUntilDeadlineWindow,
  getMonotonicNowMs,
  getNextDeadlineTickDelay,
  readServerClockMs,
  updateServerClockFromSample,
} from "./utils/realtimeClock.js";
import {
  FACEBOOK_INVITE_MIN_DISTINCT_VISIT_DAYS,
  isAudienceEligibleForPatchNotes,
  isNewPlayerPopupQuietPeriod,
  recordDistinctVisitDay,
} from "./utils/popupAudience.js";
import {
  ACCOUNT_SEEN_MARKERS,
  buildBroadcastSeenMarker,
  buildDuelTutorialSeenMarker,
  buildDuelWeekRecapSeenMarker,
  buildDuelWeekSeenMarker,
  buildFacebookInviteSeenMarker,
  buildPatchNotesSeenMarker,
  buildSpecialTutorialSeenMarker,
  buildVaultWordOfDaySeenMarker,
  buildVocabOverlaySeenMarker,
} from "./utils/accountSeenMarkers.js";
import {
  isWeeklyRecapPodiumReady,
} from "./utils/weeklyRecap.js";

const OcidResultOverlay = React.lazy(() => import("./components/mobile/OcidResultOverlay.jsx"));
const AboutModals = React.lazy(() => import("./components/about/AboutModals.jsx"));
const WordVaultPage = React.lazy(() => import("./components/WordVaultPage.jsx"));
const DefinitionOverlays = React.lazy(() =>
  import("./components/definition/DefinitionOverlays.jsx")
);
const RecordModal = React.lazy(() => import("./components/results/RecordModal.jsx"));
const ChatInteractionOverlays = React.lazy(() =>
  import("./components/chat/ChatInteractionOverlays.jsx")
);
const PlayersOverlay = React.lazy(() => import("./components/players/PlayersOverlay.jsx"));
const TrainingConfirmDialog = React.lazy(() =>
  import("./components/training/TrainingConfirmDialog.jsx")
);
const AccountMenu = React.lazy(() => import("./components/account/AccountMenu.jsx"));
const BroadcastNoticePopup = React.lazy(() =>
  import("./components/BroadcastNoticePopup.jsx")
);
const DuelWeekRecapOverlay = React.lazy(() =>
  import("./components/DuelWeekRecapOverlay.jsx")
);
const GlobalRedAnnouncementOverlay = React.lazy(() =>
  import("./components/GlobalRedAnnouncementOverlay.jsx")
);
const PlaytimeCountdownOverlay = React.lazy(() =>
  import("./components/PlaytimeCountdownOverlay.jsx")
);
const VaultWordOfDayPopup = React.lazy(() =>
  import("./components/home/VaultWordOfDayPopup.jsx")
);
const PerfTestOverlay = React.lazy(() => import("./perf/PerfTestOverlay.jsx"));
const DuelPopupOverlay = React.lazy(() =>
  import("./components/duel/DuelPopupOverlay.jsx")
);
const DailyHubScreen = React.lazy(() => import("./components/daily/DailyHubScreen.jsx"));
const DuelHubScreen = React.lazy(() => import("./components/duel/DuelHubScreen.jsx"));
const WeeklyStatsScreen = React.lazy(() =>
  import("./components/stats/WeeklyStatsScreen.jsx")
);
const TournamentFinaleScreen = React.lazy(() =>
  import("./components/finale/TournamentFinaleScreen.jsx")
);
const loadDesktopGameScene = () => import("./components/desktop/DesktopGameScene.jsx");
const DesktopGameScene = React.lazy(loadDesktopGameScene);
const loadLiveLobbyScreen = () => import("./components/live/LiveLobbyScreen.jsx");
const LiveLobbyScreen = React.lazy(loadLiveLobbyScreen);
const loadMobileSpecial3Scene = () => import("./components/mobile/MobileSpecial3Scene.jsx");
const MobileSpecial3Scene = React.lazy(loadMobileSpecial3Scene);
const loadMobileStandardScene = () => import("./components/mobile/MobileStandardScene.jsx");
const MobileStandardScene = React.lazy(loadMobileStandardScene);
const loadMobileUltraCompactScene = () =>
  import("./components/mobile/MobileUltraCompactScene.jsx");
const MobileUltraCompactScene = React.lazy(loadMobileUltraCompactScene);
const SettingsMenu = React.lazy(() => import("./components/settings/SettingsMenu.jsx"));
const HelpOverlay = React.lazy(() => import("./components/HelpOverlay.jsx"));
const loadMobileResultsScreen = () => import("./components/mobile/MobileResultsScreen.jsx");
const TargetWaitDevPlayground = React.lazy(() =>
  import("./components/targetWait/TargetWaitDevPlayground.jsx")
);
const loadVocabProgressOverlay = () =>
  import("./components/vocab/VocabProgressOverlay.jsx");
const VocabProgressOverlay = React.lazy(loadVocabProgressOverlay);


const ROOM_OPTIONS = {
  "room-4x4": { label: "Grille 4x4", gridSize: 4, duration: 120, breakSeconds: 45 },
};

const DEFAULT_DURATION = 120;
const COUNTDOWN = 0;
const TOURNAMENT_TOTAL_ROUNDS = 5;
const TOURNAMENT_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const FINAL_ROUND_RESULTS_SECONDS = 20;
const TRANSIENT_HOME_CONNECTION_ERRORS = new Set([
  "Connexion au serveur impossible",
  "Impossible de joindre le serveur",
  "Connexion timeout",
]);
// Hauteur max de la liste des mots en fin de partie : on remplit davantage l'espace sans ?tirer toute la colonne
const WORDS_SCROLL_MAX_HEIGHT = "clamp(320px, calc(100vh - 280px), 720px)";
// Le viewport reste la seule autorité en hauteur sur desktop : une hauteur
// minimale visuelle recréerait un scroll global aux forts niveaux de zoom.
const DESKTOP_MAIN_GRID_MIN_HEIGHT = 1;
const MAIN_GRID_HEIGHT = `max(${DESKTOP_MAIN_GRID_MIN_HEIGHT}px, calc(100vh - 180px))`;
const CHAT_DRAWER_FIXED_HEIGHT_RATIO = 0.58;
const CHAT_DRAWER_MIN_HEIGHT_PX = 320;
const CHAT_DRAWER_MAX_HEIGHT_PX = 560;
const CHAT_DRAWER_TOP_GAP_PX = 14;
const CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX = 120;
const COLUMN_HEIGHT_STYLE = {
  height: MAIN_GRID_HEIGHT,
  maxHeight: MAIN_GRID_HEIGHT,
  minHeight: `${DESKTOP_MAIN_GRID_MIN_HEIGHT}px`,
};
const MIN_GRID_WIDTH = 260;
const MAX_GRID_WIDTH = 980;
const MOBILE_GRID_MAX_WIDTH = 720;
const GRID_PADDING_PX = 32; // p-4 (16px de chaque côté)
const BASE_TILE_PX = 56;
const BASE_GAP_PX = 8; // gap-2 de référence
const BASE_GAP_RATIO = BASE_GAP_PX / BASE_TILE_PX; // ~0.14 pour conserver les proportions
const MIN_TILE_SIZE = 40; // garde une lisibilité minimale
const GRID_ROTATE_ANIM_MS = 820;
const MOBILE_ROUND_INTRO_RESULTS_FADE_MS = 300;
const MOBILE_ROUND_INTRO_INTRO_FADE_IN_MS = 220;
const MOBILE_ROUND_INTRO_TITLE_HOLD_MS = 2500;
const MOBILE_ROUND_INTRO_TITLE_FADE_MS = 180;
const MOBILE_ROUND_INTRO_TILE_HOLD_MS = 80;
const MOBILE_ROUND_INTRO_COUNTDOWN_FROM = 3;
const MOBILE_ROUND_INTRO_COUNTDOWN_STEP_MS = 1000;
const MOBILE_ROUND_INTRO_COUNTDOWN_TOTAL_MS =
  MOBILE_ROUND_INTRO_COUNTDOWN_FROM * MOBILE_ROUND_INTRO_COUNTDOWN_STEP_MS;
const MOBILE_ROUND_INTRO_GO_LABEL = "PARTEZ !";
const MOBILE_ROUND_INTRO_GO_HOLD_MS = 360;
const MOBILE_ROUND_INTRO_GO_FADE_MS = 320;
const MOBILE_ROUND_INTRO_GO_TOTAL_MS =
  MOBILE_ROUND_INTRO_GO_HOLD_MS + MOBILE_ROUND_INTRO_GO_FADE_MS;
const DEV_PHASE_LOOP_QUERY_PARAM = "phaseLoop";
const DEV_PHASE_LOOP_RESULTS_MS = 10_000;
const DEV_PHASE_LOOP_PLAYING_MS = 10_000;
const DEV_PHASE_LOOP_PLAYING_GUARD_MS = 250;
const DEV_PHASE_LOOP_INTRO_TILE_ESTIMATE_MS = 1400;
const DEV_PHASE_LOOP_INTRO_MS =
  MOBILE_ROUND_INTRO_RESULTS_FADE_MS +
  MOBILE_ROUND_INTRO_INTRO_FADE_IN_MS +
  MOBILE_ROUND_INTRO_TITLE_HOLD_MS +
  MOBILE_ROUND_INTRO_TITLE_FADE_MS +
  DEV_PHASE_LOOP_INTRO_TILE_ESTIMATE_MS +
  MOBILE_ROUND_INTRO_TILE_HOLD_MS +
  MOBILE_ROUND_INTRO_COUNTDOWN_TOTAL_MS;
const DARK_ROW_TEXT = "#e5e7eb";
const LIVE_SOLVER_DURING_PLAY = false;
const DEV_MODE = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const DARK_DIVIDER_COLOR = "#1f2937";
const DARK_WORD_INACTIVE = "#e2e8f0";
const WORD_BATCH_FLUSH_MS = 40;
const WORD_BATCH_MAX = 5;
const WORD_BATCH_ACK_TIMEOUT_MS = 2200;
const LIVE_ROUND_END_PAYLOAD_WAIT_MS = 4500;
const PING_SERVER_TIMEOUT_MS = 3200;
const WATCHDOG_SOFT_FAILURES_BEFORE_RECONNECT = 3;
const SAMSUNG_TOUCH_MOVE_MIN_INTERVAL_MS = 10;
const SAMSUNG_TOUCH_MOVE_MIN_DISTANCE_PX = 2;
const SAMSUNG_BIGWORD_MIN_INTERVAL_MS = 700;
const SAMSUNG_BIGWORD_FLASH_MS = 650;
const CACHE_PURGE_QUERY_PARAM = "purgeCache";
function normalizeChatDesktopFontScale(raw, fallback = CHAT_DESKTOP_FONT_SCALE_DEFAULT) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const clamped = Math.max(CHAT_DESKTOP_FONT_SCALE_MIN, Math.min(CHAT_DESKTOP_FONT_SCALE_MAX, value));
  return Math.round(clamped / CHAT_DESKTOP_FONT_SCALE_STEP) * CHAT_DESKTOP_FONT_SCALE_STEP;
}
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=fr.gobble.twa&hl=fr";
const STATS_WEEKLY_DISPLAY_LIMIT = 50;
const STATS_SEASON_TARGET_LIMIT = 200;
const DUEL_TUTORIAL_STEPS = [
  "Chaque semaine, tu es dans l'équipe Rouge ou Bleue.",
  "Chaque jour, tu as 3 objectifs (facile, moyen, difficile). Valide-les dans le jeu principal pour aider ton equipe.",
  "Gobbles + duel sur la grille quotidienne font aussi monter le score. Si ton equipe gagne et que tu as été actif, tu portes la couronne la semaine suivante.",
];
function getGridSizeForRoom(roomKey) {
  return ROOM_OPTIONS[roomKey]?.gridSize || 4;
}

function areStringArraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getBonusBadgeClass(displayBonus) {
  if (displayBonus === "L3") return "bg-blue-700 text-white";
  if (displayBonus === "L2") return "bg-sky-400 text-slate-900";
  if (displayBonus === "M3") return "bg-red-600 text-white";
  if (displayBonus === "M2") return "bg-[#ffbfb4] border border-[#f87171] text-slate-900";
  return "bg-slate-600 text-white";
}

function getBonusLetterRingClass(displayBonus) {
  if (displayBonus === "L3") return "theme-letter-ring theme-letter-ring-L3";
  if (displayBonus === "L2") return "theme-letter-ring theme-letter-ring-L2";
  if (displayBonus === "M3") return "theme-letter-ring theme-letter-ring-M3";
  if (displayBonus === "M2") return "theme-letter-ring theme-letter-ring-M2";
  return "";
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

function normalizeNickKey(nick) {
  return String(nick || "").trim().toLowerCase();
}

function buildCompletedTargetPattern(pattern, word) {
  const cleanWord = String(word || "").trim();
  if (!cleanWord) return pattern || "";
  return cleanWord.toUpperCase();
}

function buildTargetBlankPattern(length) {
  if (!Number.isFinite(length) || length <= 0) return "";
  return Array.from({ length }).map(() => "_").join(" ");
}

const BONUS_CLASSES = {
  L2: "bg-[rgba(163,196,243,0.85)] border-[rgba(99,147,230,0.9)] border-2", // bleu clair plus vif
  L3: "bg-[rgba(51,93,227,0.8)] border-[rgba(30,64,175,0.95)] text-white border-2", // bleu profond
  M2: "bg-[rgba(255,191,180,0.9)] border-[rgba(248,113,113,0.95)] border-2", // corail vif
  M3: "bg-[rgba(239,68,68,0.85)] border-[rgba(185,28,28,0.95)] text-white border-2", // rouge intense
};

const WEEKLY_BOARDS = [
  { key: "weeklyVocab", label: "Vocabulaire hebdo", subtitle: "Course aux mots uniques" },
  { key: "medals", label: "Medailles", subtitle: "Total hebdo" },
  { key: "mostWordsInGame", label: "Mots par manche", subtitle: "Volume max" },
  { key: "totalScore", label: "Score total", subtitle: "Somme hebdo (cibles = 1000 pts)" },
  { key: "bestWord", label: "Meilleur mot", subtitle: "Score le plus élevé" },
  { key: "longestWord", label: "Mot le plus long", subtitle: "Longest" },
  { key: "bestRoundScore", label: "Score de manche", subtitle: "Total record" },
  { key: "bestSpecial3Score", label: "3 mots", subtitle: "Live hebdo" },
  { key: "bestTimeTargetLong", label: "Temps mot long", subtitle: "Round cible mot long" },
  { key: "bestTimeTargetScore", label: "Temps meilleur mot", subtitle: "Round cible meilleur mot" },
  { key: "mostGobbles", label: "Gobbles", subtitle: "Total hebdo" },
];
const FINALE_WEEKLY_BOARDS = WEEKLY_BOARDS;
const WEEKLY_SWIPE_THRESHOLD = 42;
const RESULTS_SWIPE_THRESHOLD = 52;
const DEFAULT_CHAT_VISIBLE_LINES = 18;
const DEFAULT_CHAT_FULL_VISIBLE_LINES = 9;
const CHAT_MIN_VISIBLE_LINES = 8;
const CHAT_MAX_VISIBLE_LINES = 40;
const DESKTOP_CHAT_BOTTOM_EPSILON_PX = 28;
const CHAT_MIN_DELAY = 600;
const CHAT_DRAWER_ANIM_MS = 420;
const DISCONNECT_GRACE_MS = 30 * 1000;
const BLOCKED_INSTALL_IDS_STORAGE_KEY = "gobble_blocked_install_ids";
function getMassiveBoggleFeedbackPoints(points, rawWord) {
  const safePoints = Number.isFinite(points) ? Math.max(0, Number(points)) : 0;
  const len = normalizeWord(rawWord || "").length;
  if (len >= 12) return Math.max(safePoints, 34);
  if (len >= 10) return Math.max(safePoints, 24);
  if (len >= 8) return Math.max(safePoints, 14);
  if (len >= 7) return Math.max(safePoints, 8);
  return safePoints;
}
const ACCOUNT_SESSION_UNAVAILABLE_MESSAGE =
  "Session compte indisponible sur cette machine. Vérifie les cookies du navigateur.";
const ACCOUNT_SERVER_BUSY_MESSAGE =
  "Le serveur met plus de temps que prévu à répondre. Ce n'est pas ta connexion : on réessaie automatiquement.";
const AUTH_MODAL_MODES = {
  LOGIN: "login",
  REGISTER: "register",
  CLAIM_LEGACY: "claim-legacy",
  FORGOT_PASSWORD: "forgot-password",
  CHANGE_PASSWORD: "change-password",
};
const SETTINGS_STORAGE_KEY = "gobble_settings_v1";
const PATCH_NOTES_VERSION = "2026-08-20";
const PATCH_NOTES_RELEASE_TS = Date.parse("2026-08-20T00:00:00+02:00");
const FRONT_BUILD_TAG = "2026-08-20-minor-fixes-1";
const FACEBOOK_INVITE_VERSION = "facebook-group-v1";
const readLocalSettings = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_) {
    return {};
  }
};

const GUIDED_RESULTS_STEPS = {
  TAP_PSEUDO: "tap_pseudo",
  SWIPE_TOTAL: "swipe_total",
  SWIPE_FOUND: "swipe_found",
  SWIPE_ALL: "swipe_all",
  TAP_WORD: "tap_word",
  TAP_DEFINITION: "tap_definition",
};
const GUIDED_RESULTS_STEP_ORDER = [
  GUIDED_RESULTS_STEPS.TAP_PSEUDO,
  GUIDED_RESULTS_STEPS.SWIPE_TOTAL,
  GUIDED_RESULTS_STEPS.SWIPE_FOUND,
  GUIDED_RESULTS_STEPS.SWIPE_ALL,
  GUIDED_RESULTS_STEPS.TAP_WORD,
  GUIDED_RESULTS_STEPS.TAP_DEFINITION,
];
const GUIDED_RESULTS_PAGE_TO_STEP = {
  round: GUIDED_RESULTS_STEPS.SWIPE_TOTAL,
  total: GUIDED_RESULTS_STEPS.SWIPE_FOUND,
  found: GUIDED_RESULTS_STEPS.SWIPE_ALL,
  all: GUIDED_RESULTS_STEPS.TAP_WORD,
};
const SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK = 11;
function normalizeMeasuredPx(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num);
}

function isSameMeasuredPx(prev, next, epsilon = 1) {
  const safePrev = normalizeMeasuredPx(prev);
  const safeNext = normalizeMeasuredPx(next);
  return Math.abs(safePrev - safeNext) <= epsilon;
}

function getPatchNotesSeenAudienceKey(userId) {
  const safeUserId = Number(userId);
  if (Number.isInteger(safeUserId) && safeUserId > 0) {
    return `user:${safeUserId}`;
  }
  return "";
}

function getPopupAudienceKey(userId) {
  return getPatchNotesSeenAudienceKey(userId);
}

function getBroadcastMessageKey(message) {
  if (!message || typeof message !== "object") return "";
  const idPart = typeof message.id === "string" ? message.id.trim() : "";
  const updatedPart =
    typeof message.updatedAt === "string" ? message.updatedAt.trim() : "";
  if (idPart && updatedPart) return `${idPart}:${updatedPart}`.slice(0, 140);
  if (idPart) return idPart.slice(0, 140);
  if (updatedPart) return updatedPart.slice(0, 140);
  return "";
}

const LEAGUE_META = {
  Bronze: {
    label: "Bronze",
    light: { accent: "#b9794a", bg: "#f4e8de" },
    dark: { accent: "#c58a59", bg: "#3b2a1d" },
  },
  Argent: {
    label: "Argent",
    light: { accent: "#9aa4b2", bg: "#eef1f4" },
    dark: { accent: "#b4beca", bg: "#1f2630" },
  },
  Or: {
    label: "Or",
    light: { accent: "#e7b43c", bg: "#fff2cf" },
    dark: { accent: "#f0c057", bg: "#3a2a05" },
  },
  Cristal: {
    label: "Cristal",
    light: { accent: "#47a7ff", bg: "#e0f1ff" },
    dark: { accent: "#6cb8ff", bg: "#0b2033" },
  },
  Master: {
    label: "Master",
    light: { accent: "#8c7bff", bg: "#efeaff" },
    dark: { accent: "#a595ff", bg: "#251b3c" },
  },
  "L\u00e9gende": {
    label: "L\u00e9gende",
    light: { accent: "#ff6a8a", bg: "#ffe4ea" },
    dark: { accent: "#ff8fa6", bg: "#3a141e" },
  },
};

function getLeaguePalette(league, darkMode) {
  const meta = LEAGUE_META[league] || LEAGUE_META.Bronze;
  return darkMode ? meta.dark : meta.light;
}

function getVocabProgress(count) {
  const safe = Number.isFinite(count) ? Math.max(0, count) : 0;
  for (let i = 0; i < VOCAB_LEVELS.length; i++) {
    const level = VOCAB_LEVELS[i];
    const max = Number.isFinite(level.max) ? level.max : Infinity;
    if (safe < max) {
      const range = Number.isFinite(level.max)
        ? Math.max(1, level.max - level.min)
        : 1;
      const segmentProgress = Number.isFinite(level.max)
        ? clampValue((safe - level.min) / range, 0, 1)
        : 1;
      const pct = clampValue((i + segmentProgress) / VOCAB_LEVELS.length, 0, 1);
      return { value: safe, pct };
    }
  }
  return { value: safe, pct: 1 };
}

function getSpecialRoundDisplayLabel(specialInfo) {
  if (!specialInfo || typeof specialInfo !== "object") return "";
  if (typeof specialInfo.label === "string" && specialInfo.label.trim()) {
    return specialInfo.label.trim();
  }
  if (specialInfo.type === "speed") return "Jeu rapide";
  if (specialInfo.type === "monstrous") return "Grille monstrueuse";
  if (specialInfo.type === DAILY_SPECIAL_MODE) return "3 mots";
  if (specialInfo.type === FAKE_TWINS_TYPE || specialInfo.type === DAILY_FAKE_TWINS_MODE) {
    return "Faux jumeaux";
  }
  if (specialInfo.type === "target_long") return "Mot le plus long";
  if (specialInfo.type === "target_score") return "Meilleur mot";
  if (specialInfo.type === OCID_TYPE) return "Manche OCID";
  if (specialInfo.type === "bonus_letter") return "Lettre en or";
  if (specialInfo.type === MASSIVE_BOGGLE_TYPE) return "Massive Boggle";
  if (specialInfo.type === FINALE_TYPE) return "Manche finale";
  return "Manche speciale";
}

function getSpecialRoundDescription(specialInfo) {
  if (!specialInfo || typeof specialInfo !== "object") return "";
  if (typeof specialInfo.description === "string" && specialInfo.description.trim()) {
    return specialInfo.description.trim();
  }
  if (specialInfo.type === FAKE_TWINS_TYPE || specialInfo.type === DAILY_FAKE_TWINS_MODE) {
    return "Une case de la grille peut valoir l'une ou l'autre de deux lettres. Les mots de 2 lettres ou plus sont valides.";
  }
  if (specialInfo.type === OCID_TYPE) {
    return "Propose un mot qui semble correspondre a la definition, puis vote pour le vrai mot cible.";
  }
  if (specialInfo.type === FINALE_TYPE) {
    return "Points du mini-tournoi ×2 et effets des tuiles spéciales ×2 : L2→L4, L3→L6, M2→M4, M3→M6.";
  }
  return "";
}

function useStableEvent(handler) {
  const handlerRef = React.useRef(handler);
  React.useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  return React.useCallback((...args) => handlerRef.current?.(...args), []);
}

const WORD_SUBMISSION_CONTROLLER_METHODS = Object.freeze([
  "requeueInFlightSubmissions",
  "restorePendingSubmissionEntries",
  "scheduleBatchFlush",
  "submit",
  "syncLiveSpecial3WordsState",
  "tryAutoSubmitCurrentWordAtRoundEnd",
]);
const CELEBRATION_CONTROLLER_METHODS = Object.freeze([
  "triggerConfettiBurst",
  "triggerGridShake",
  "triggerInvalidFlash",
  "triggerPraiseFlash",
  "triggerScoreFlight",
]);

function createWordSubmissionController(runtime) {
  return createWordSubmissionEngine(...runtime);
}

function createCelebrationController(runtime) {
  return createCelebrationEffects(...runtime);
}

function createRoundPlayerDetailsRuntime(runtime) {
  return createRoundPlayerDetailsController(...runtime);
}

function createResultsWordInspectorRuntime(runtime) {
  return createResultsWordInspector(...runtime);
}

function bindFeatureStateSetters(feature, fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([setterName, field]) => [
      setterName,
      (nextOrUpdater) => feature.set(field, nextOrUpdater),
    ])
  );
}

const GOBBLE_GAME_FIELDS = Object.freeze([
  "allWords",
  "board",
  "cultureThemeChallenge",
  "currentRoomId",
  "gridRotationTurns",
  "gridSize",
  "implodeActive",
  "inputLocked",
  "isGridRotating",
  "phase",
  "roomId",
  "showAllWords",
]);

const LIVE_UI_ROOT_FIELDS = Object.freeze([
  "foundTargetThisRound",
  "foundTargetWord",
  "mobileRoundIntroHideTiles",
  "mobileRoundIntroRoundDescription",
  "mobileRoundIntroRoundLabel",
  "mobileRoundIntroRoundTypeLabel",
  "mobileRoundIntroStage",
  "specialHint",
  "specialSolvedOverlay",
  "targetDefinition",
  "targetHintScheduleMs",
]);

const CHAT_ROOT_FIELDS = Object.freeze([
  "activeArea",
  "blockedInstallIds",
  "botVisibility",
  "desktopEmojiPickerOpen",
  "desktopReactionDetails",
  "desktopReactionPicker",
  "editTarget",
  "homeChatOpen",
  "keyboardInsetPx",
  "mobileChatClosing",
  "mobileChatOpen",
  "mobileChatOpenedAtMs",
  "replyTarget",
  "reportDialog",
  "rulesAccepted",
  "rulesOpen",
  "showBlockedList",
  "showBotMessages",
  "tab",
  "userMenu",
  "viewportHeight",
]);

const REALTIME_ROOT_FIELDS = Object.freeze([
  "breakKind",
  "finalResults",
  "lobbyPlayersList",
  "lobbyPlayersLoading",
  "lobbyRoomStatus",
  "medals",
  "nextStartAt",
  "roomsStats",
  "roundId",
  "roundPreparing",
  "roundStats",
  "serverEndsAt",
  "serverRoundDurationMs",
  "specialRound",
  "targetSummary",
  "tournament",
  "tournamentFinaleHoldUntil",
  "tournamentLobby",
  "tournamentRanking",
  "tournamentRoundPoints",
  "tournamentSummary",
  "tournamentSummaryAt",
  "tournamentTotals",
  "upcomingSpecial",
]);

const ROSTER_ROOT_FIELDS = Object.freeze(["players", "provisionalRanking"]);
const EMPTY_FEED_ANNOUNCEMENTS = Object.freeze([]);

export default function GobbleApplication() {
  recordAppRender();
  const applicationKernel = useApplicationKernel();
  const socket = applicationKernel.ports.realtime;
  const celebrationFeature = useCelebrationRuntime();
  const traceFeature = useTraceRuntime();
  const clockFeature = useFeatureRuntime("clock");
  const connectionFeature = useFeatureRuntime("connection");
  const diagnosticsFeature = useFeatureRuntime("diagnostics");
  const gameplaySessionFeature = useFeatureRuntime("gameplaySession");
  const liveRoundFeature = useFeatureRuntime("liveRound");
  const sessionPersistenceFeature = useFeatureRuntime("sessionPersistence");
  const {
    autoResumeEnabled: autoResumeEnabledRef,
    session: sessionRef,
  } = sessionPersistenceFeature.refs;
  const { isSamsungBrowser: isSamsungBrowserRef } = diagnosticsFeature.refs;
  const {
    getNowMs: getSamsungDiagNowMs,
    bumpCounter: bumpSamsungDiagCounter,
    flushSnapshot: flushSamsungDiagSnapshot,
    pushEvent: pushSamsungDiagEvent,
    noteTouchMoveRate: noteSamsungTouchMoveRate,
  } = diagnosticsFeature;
  const {
    backgrounded: isBackgroundedRef,
    foregroundAttemptAt: foregroundAttemptRef,
    intentionalDisconnect: intentionalDisconnectRef,
    lastBackgroundAt: lastBackgroundTimeRef,
    reconnectAttempt: reconnectAttemptRef,
    watchdogFailures: watchdogFailureCountRef,
  } = connectionFeature.refs;
  const scheduleForegroundRetry = connectionFeature.scheduleForegroundRetry;
  const dictionaryFeature = useFeatureRuntime("dictionary");
  const dictionary = useFeatureSelector(dictionaryFeature, (state) => state.entries);
  const progressFeature = useFeatureRuntime("progress");
  const gameState = useApplicationFields("game", GOBBLE_GAME_FIELDS);
  const settledGameProgress = useSettledGameProgress(progressFeature);
  const realtimeState = useApplicationFields("realtime", REALTIME_ROOT_FIELDS);
  const feedFeature = useFeatureRuntime("feed");
  const rosterFeature = useFeatureRuntime("roster");
  const rosterState = useFeatureFields(rosterFeature, ROSTER_ROOT_FIELDS);
  const sessionState = useApplicationSelector((state) => state.session);
  const ambientTracks = useApplicationSelector((state) => state.boot.ambientTracks);
  const bootReady = useApplicationSelector((state) => state.boot.ready);
  const bootOverlayVisible = useApplicationSelector((state) => state.boot.overlayVisible);
  const appView = useApplicationSelector((state) => state.navigation.view);
  const {
    allWords,
    board,
    cultureThemeChallenge,
    currentRoomId,
    gridRotationTurns,
    gridSize,
    implodeActive,
    inputLocked,
    isGridRotating,
    phase,
    roomId,
    showAllWords,
  } = gameState;
  const announcements = useFeatureSelector(feedFeature, (state) =>
    phase === "playing" ? EMPTY_FEED_ANNOUNCEMENTS : state.announcements
  );
  const { accepted, submissionTick } = settledGameProgress;
  const {
    authState,
    canResumeSession,
    connectionError,
    isConnecting,
    isLoggedIn,
    loginError,
    nickname,
    resumePending,
    resumeSnapshot,
    serverStatus,
  } = sessionState;
  const {
    breakKind,
    finalResults,
    lobbyPlayersList,
    lobbyPlayersLoading,
    lobbyRoomStatus,
    medals,
    nextStartAt,
    roomsStats,
    roundId,
    roundPreparing,
    roundStats,
    serverEndsAt,
    serverRoundDurationMs,
    specialRound,
    targetSummary,
    tournament,
    tournamentFinaleHoldUntil,
    tournamentLobby,
    tournamentRanking,
    tournamentRoundPoints,
    tournamentSummary,
    tournamentSummaryAt,
    tournamentTotals,
    upcomingSpecial,
  } = realtimeState;
  const { players, provisionalRanking } = rosterState;
  const {
    setAllWords,
    setBoard,
    setCultureThemeChallenge,
    setCurrentRoomId,
    setGridRotationTurns,
    setGridSize,
    setImplodeActive,
    setInputLocked,
    setIsGridRotating,
    setPhase,
    setRoomId,
    setShowAllWords,
  } = applicationKernel.commands.game;
  const {
    setAccepted,
    setScore,
    setSubmissionTick,
  } = progressFeature;
  const {
    setAnnouncements,
    setLastWords,
  } = feedFeature;
  const {
    clearQueuedUpdates: clearQueuedRosterUpdates,
    flushQueuedUpdates: flushQueuedRosterUpdates,
    setPlayers,
    setProvisionalRanking,
  } = rosterFeature;
  const setTick = React.useCallback(
    (nextOrUpdater) => {
      const current = clockFeature.store.getState().remainingSeconds;
      const next =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(current)
          : nextOrUpdater;
      clockFeature.setCountdown(next);
    },
    [clockFeature]
  );
  const {
    setAuthState,
    setCanResumeSession,
    setConnectionError,
    setIsConnecting,
    setIsLoggedIn,
    setLoginError,
    setNickname,
    setResumePending,
    setResumeSnapshot,
    setServerStatus,
  } = applicationKernel.commands.session;
  const {
    setBreakKind,
    setFinalResults,
    setLobbyPlayersList,
    setLobbyPlayersLoading,
    setLobbyRoomStatus,
    setMedals,
    setNextStartAt,
    setRoomsStats,
    setRoundId,
    setRoundPreparing,
    setRoundStats,
    setServerEndsAt,
    setServerRoundDurationMs,
    setSpecialRound,
    setTargetSummary,
    setTournament,
    setTournamentFinaleHoldUntil,
    setTournamentLobby,
    setTournamentRanking,
    setTournamentRoundPoints,
    setTournamentSummary,
    setTournamentSummaryAt,
    setTournamentTotals,
    setUpcomingSpecial,
  } = applicationKernel.commands.realtime;
  const getGameProgress = React.useCallback(
    () => progressFeature.store.getState(),
    [progressFeature]
  );
  const setAppView = React.useCallback(
    (nextViewOrUpdater) => {
      const currentView = applicationKernel.getState().navigation.view;
      const nextView =
        typeof nextViewOrUpdater === "function"
          ? nextViewOrUpdater(currentView)
          : nextViewOrUpdater;
      applicationKernel.commands.navigation.go(nextView);
    },
    [applicationKernel]
  );

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.__gobbleBuildTag = FRONT_BUILD_TAG;
      }
      console.info("[Gobble build]", FRONT_BUILD_TAG);
    } catch (_) {}
  }, []);

  const roomIdRef = useRef(roomId);
  const currentTilesRef = useRef([]);
  const highlightPathRef = useRef([]);
  const shouldForceTraceRenderRef = useRef(true);
  const [, forceTraceRender] = useState(0);
  const currentTiles = currentTilesRef.current;
  const highlightPath = highlightPathRef.current;
  function publishTraceState() {
    traceFeature.setTraceState({
      currentTiles: currentTilesRef.current,
      highlightPath: highlightPathRef.current,
    });
  }
  function commitTraceSelection(nextTiles, nextPath) {
    currentTilesRef.current = Array.isArray(nextTiles) ? nextTiles : [];
    highlightPathRef.current = Array.isArray(nextPath) ? nextPath : [];
    publishTraceState();
    if (shouldForceTraceRenderRef.current) {
      forceTraceRender((tick) => tick + 1);
    }
  }
  function setHighlightPath(nextOrUpdater) {
    const prev = highlightPathRef.current;
    const next =
      typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
    commitTraceSelection(currentTilesRef.current, next);
  }
  const liveFeedTsRef = useRef(0);
  const tileRefs = useRef([]);
  const dragGridMetricsRef = useRef(null);
  const gridInputControllerRef = useRef(null);
  const special3TraceResolverRef = useRef(() => ({
    blockedReason: "",
    highlightPath: [],
    liveWord: "",
    normalizedWord: "",
    score: null,
    valid: false,
  }));
  const resolveSpecial3LiveTrace = React.useCallback(
    (snapshot) => special3TraceResolverRef.current(snapshot),
    []
  );
  const activeTraceStartedAtRef = useRef(null);
  const inputLockedRef = useRef(false);
  const outroInFlightRef = useRef(false);
  const outroRoundRef = useRef(null);
  const gameplaySessionTokenRef = useRef(0);
  const blackHoleOverlayRef = useRef(null);
  const implodeRoundRef = useRef(null);
  const implodeTimerRef = useRef(null);
  const tileIntroTimerRef = useRef(null);
  const implodePhaseTimerRef = useRef(null);
  const implodeFallbackRef = useRef(false);
  const pendingRoundEndRef = useRef(null);
  const pendingBreakStartRef = useRef(null);
  const processRoundEndedRef = useRef(null);
  const processBreakStartedRef = useRef(null);
  const playOutroThenResultsRef = useRef(null);
  const gridRotateAnimRef = useRef(null);
  const gridRotateTimerRef = useRef(null);
  const lastInputModeRef = useRef("keyboard");
  const roundStartAtRef = useRef(0);
  const tileStepRef = useRef(0);         // <-- AJOUT
  const isTouchDeviceRef = useRef(false);
  const gridRef = useRef(null);
  const canVibrateRef = useRef(false);
  const preferencesFeature = useFeatureRuntime("preferences");
  const preferencesState = useFeatureSelector(preferencesFeature, (state) => state);
  const {
    canVibrate,
    chatDesktopFontScale,
    gobblarsBalance,
    isAmbientMuted,
    isSfxMuted,
    isVibrationEnabled,
    keyboardRecallSubmittedWord,
    preferLiteVisualEffects,
    soundGobbleEnabled,
    soundInvalidErrorEnabled,
    soundMasterVolume,
    soundTileStepEnabled,
    soundTimerEnabled,
    soundValidationEnabled,
    themeApplied,
    themeApplying,
    themeDraft,
    themeLastChangedCategory,
    themeLoading,
    themeMenuOpen: isThemeMenuOpen,
    themePickerCategory,
    themePurchaseConfirm,
    themeRecentlyUnlocked,
    themeUnlockAnimToken,
    themeUnlockCost,
    themeUnlocks,
    themeVisual,
    tilePointsVisible,
    visualConfettiEnabled,
    visualGobbleEnabled,
    visualGoldNickFxEnabled,
    visualInvalidWordsEnabled,
    visualPraiseEnabled,
    visualScoreFlightsEnabled,
    visualScreenShakeEnabled,
  } = preferencesState;
  const themeAppliedSafe = React.useMemo(
    () => normalizeThemePreset(themeApplied),
    [themeApplied]
  );
  const {
    setCanVibrate,
    setChatDesktopFontScale,
    setGobblarsBalance,
    setIsAmbientMuted,
    setIsSfxMuted,
    setIsThemeMenuOpen,
    setIsVibrationEnabled,
    setKeyboardRecallSubmittedWord,
    setSoundGobbleEnabled,
    setSoundInvalidErrorEnabled,
    setSoundMasterVolume,
    setSoundTileStepEnabled,
    setSoundTimerEnabled,
    setSoundValidationEnabled,
    setThemeApplied,
    setThemeApplying,
    setThemeDraft,
    setThemeLastChangedCategory,
    setThemeLoading,
    setThemePickerCategory,
    setThemePurchaseConfirm,
    setThemeRecentlyUnlocked,
    setThemeUnlockAnimToken,
    setThemeUnlockCost,
    setThemeUnlocks,
    setTilePointsVisible,
    setVisualConfettiEnabled,
    setVisualGobbleEnabled,
    setVisualGoldNickFxEnabled,
    setVisualInvalidWordsEnabled,
    setVisualPraiseEnabled,
    setVisualScoreFlightsEnabled,
    setVisualScreenShakeEnabled,
    setDarkMode,
    setTileLetterFontPreset,
    setTileLetterScalePreset,
    setTileLetterColorPreset,
    setUiContrastPreset,
    setTileColorPreset,
    setBackgroundThemePreset,
    setTileMaterialPreset,
    setSpecialIndicatorPreset,
  } = React.useMemo(() => {
    const setter = (field) => (nextOrUpdater) =>
      preferencesFeature.set(field, nextOrUpdater);
    const visualSetter = (field) => (nextOrUpdater) => {
      const current = preferencesFeature.store.getState().themeVisual;
      const value =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(current[field])
          : nextOrUpdater;
      preferencesFeature.previewTheme({ ...current, [field]: value });
    };
    return {
      setCanVibrate: setter("canVibrate"),
      setChatDesktopFontScale: setter("chatDesktopFontScale"),
      setGobblarsBalance: setter("gobblarsBalance"),
      setIsAmbientMuted: setter("isAmbientMuted"),
      setIsSfxMuted: setter("isSfxMuted"),
      setIsThemeMenuOpen: setter("themeMenuOpen"),
      setIsVibrationEnabled: setter("isVibrationEnabled"),
      setKeyboardRecallSubmittedWord: setter("keyboardRecallSubmittedWord"),
      setSoundGobbleEnabled: setter("soundGobbleEnabled"),
      setSoundInvalidErrorEnabled: setter("soundInvalidErrorEnabled"),
      setSoundMasterVolume: setter("soundMasterVolume"),
      setSoundTileStepEnabled: setter("soundTileStepEnabled"),
      setSoundTimerEnabled: setter("soundTimerEnabled"),
      setSoundValidationEnabled: setter("soundValidationEnabled"),
      setThemeApplied: setter("themeApplied"),
      setThemeApplying: setter("themeApplying"),
      setThemeDraft: setter("themeDraft"),
      setThemeLastChangedCategory: setter("themeLastChangedCategory"),
      setThemeLoading: setter("themeLoading"),
      setThemePickerCategory: setter("themePickerCategory"),
      setThemePurchaseConfirm: setter("themePurchaseConfirm"),
      setThemeRecentlyUnlocked: setter("themeRecentlyUnlocked"),
      setThemeUnlockAnimToken: setter("themeUnlockAnimToken"),
      setThemeUnlockCost: setter("themeUnlockCost"),
      setThemeUnlocks: setter("themeUnlocks"),
      setTilePointsVisible: setter("tilePointsVisible"),
      setVisualConfettiEnabled: setter("visualConfettiEnabled"),
      setVisualGobbleEnabled: setter("visualGobbleEnabled"),
      setVisualGoldNickFxEnabled: setter("visualGoldNickFxEnabled"),
      setVisualInvalidWordsEnabled: setter("visualInvalidWordsEnabled"),
      setVisualPraiseEnabled: setter("visualPraiseEnabled"),
      setVisualScoreFlightsEnabled: setter("visualScoreFlightsEnabled"),
      setVisualScreenShakeEnabled: setter("visualScreenShakeEnabled"),
      setDarkMode: visualSetter("darkMode"),
      setTileLetterFontPreset: visualSetter("font"),
      setTileLetterScalePreset: visualSetter("letterScale"),
      setTileLetterColorPreset: visualSetter("letterColor"),
      setUiContrastPreset: visualSetter("uiContrast"),
      setTileColorPreset: visualSetter("tileColor"),
      setBackgroundThemePreset: visualSetter("background"),
      setTileMaterialPreset: visualSetter("material"),
      setSpecialIndicatorPreset: visualSetter("specialIndicator"),
    };
  }, [preferencesFeature]);
  const darkMode = !!themeVisual.darkMode;
  const tileLetterFontPreset = themeVisual.font;
  const tileLetterScalePreset = themeVisual.letterScale;
  const tileLetterColorPreset = themeVisual.letterColor;
  const uiContrastPreset = themeVisual.uiContrast;
  const tileColorPreset = themeVisual.tileColor;
  const backgroundThemePreset = themeVisual.background;
  const tileMaterialPreset = themeVisual.material;
  const specialIndicatorPreset = themeVisual.specialIndicator;
  const soundMasterVolumeRef = useRef(soundMasterVolume);
  const {
    isAmbientMuted: isAmbientMutedRef,
    isSfxMuted: isSfxMutedRef,
    isVibrationEnabled: isVibrationEnabledRef,
    keyboardRecallSubmittedWord: keyboardRecallSubmittedWordRef,
    preferLiteVisualEffects: preferLiteVisualEffectsRef,
    visualConfettiEnabled: visualConfettiEnabledRef,
    visualGobbleEnabled: visualGobbleEnabledRef,
    visualInvalidWordsEnabled: visualInvalidWordsEnabledRef,
    visualPraiseEnabled: visualPraiseEnabledRef,
    visualScoreFlightsEnabled: visualScoreFlightsEnabledRef,
    visualScreenShakeEnabled: visualScreenShakeEnabledRef,
  } = preferencesFeature.refs;
  const gobblarsKnownBalanceRef = useRef(null);
  const fetchThemeProfileRef = useRef(null);
  const showToastRef = useRef(() => {});
  const themeProfileFetchStateRef = useRef({ inFlight: false, lastAt: 0 });
  const tileLetterFontFamily =
    FONT_MAP[tileLetterFontPreset]?.family || FONT_MAP[DEFAULT_THEME_PRESET.font].family;
  const tileLetterScaleValue = normalizeTileLetterScale(
    tileLetterScalePreset,
    DEFAULT_THEME_PRESET.letterScale
  );
  const tileLetterColorValue =
    LETTER_COLOR_MAP[tileLetterColorPreset]?.value ||
    LETTER_COLOR_MAP[DEFAULT_THEME_PRESET.letterColor].value;
  const tileColorValue = TILE_COLOR_MAP[tileColorPreset] || TILE_COLOR_MAP[DEFAULT_THEME_PRESET.tileColor];
  const isNativeTileColor = tileColorPreset === "native";
  const defaultTileBaseClass = isNativeTileColor
    ? "bg-orange-200 border-orange-500 border-2"
    : "theme-tile-base";
  const backgroundThemeValue =
    BACKGROUND_MAP[backgroundThemePreset] || BACKGROUND_MAP[DEFAULT_THEME_PRESET.background];
  const applyThemeVisualState = React.useCallback((rawTheme) => {
    return preferencesFeature.previewTheme(rawTheme);
  }, [preferencesFeature]);
  const applyThemePresetToLocalState = React.useCallback(
    (rawTheme, { syncDraft = false } = {}) => {
      return preferencesFeature.applyTheme(rawTheme, { syncDraft });
    },
    [preferencesFeature]
  );
  const ambientTracksRef = useRef(ambientTracks);
  useEffect(() => {
    ambientTracksRef.current = ambientTracks;
  }, [ambientTracks]);
  const homeLobbyIntroPlayedRef = useRef(false);
  const handleHomeLobbyIntroComplete = React.useCallback(() => {
    homeLobbyIntroPlayedRef.current = true;
  }, []);
  const overlaysFeature = useFeatureRuntime("overlays");
  const overlaysState = useFeatureSelector(overlaysFeature, (state) => state);
  const statsFeature = useFeatureRuntime("stats");
  const statsState = useFeatureSelector(statsFeature, (state) => state);
  const adminFeature = useFeatureRuntime("admin");
  const adminState = useFeatureSelector(adminFeature, (state) => state);
  const identityFeature = useFeatureRuntime("identity");
  const identityState = useFeatureSelector(identityFeature, (state) => state);
  const earlyOverlayActions = React.useMemo(
    () =>
      bindFeatureStateSetters(overlaysFeature, {
        setAccountNotice: "accountNotice",
        setAuthError: "authError",
        setAuthForm: "authForm",
        setAuthInfo: "authInfo",
        setAuthModalMode: "authModalMode",
        setAuthSubmitting: "authSubmitting",
        setDefinitionModal: "definitionModal",
        setIsAboutOpen: "aboutOpen",
        setIsAccountMenuOpen: "accountMenuOpen",
        setIsFacebookInviteOpen: "facebookInviteOpen",
        setIsKeyboardMenuOpen: "keyboardMenuOpen",
        setIsPatchNotesOpen: "patchNotesOpen",
        setIsPlayersOverlayOpen: "playersOverlayOpen",
        setIsSettingsOpen: "settingsOpen",
        setIsSoundMenuOpen: "soundMenuOpen",
        setIsSupportOpen: "supportOpen",
        setIsVisualMenuOpen: "visualMenuOpen",
        setMobileExitConfirmOpen: "mobileExitConfirmOpen",
        setPlayerProfileModal: "playerProfileModal",
        setPlayersOverlayMode: "playersOverlayMode",
        setPlayersOverlaySnapshot: "playersOverlaySnapshot",
        setPopupDistinctVisitDays: "popupDistinctVisitDays",
        setRecordModal: "recordModal",
        setRoundPlayerModal: "roundPlayerModal",
        setShowHelp: "helpOpen",
        setSupportModalSection: "supportModalSection",
        setTrainingBusy: "trainingBusy",
        setTrainingConfirm: "trainingConfirm",
        setWordInfoModal: "wordInfoModal",
      }),
    [overlaysFeature]
  );
  const statsActions = React.useMemo(
    () =>
      bindFeatureStateSetters(statsFeature, {
        setDefinitionBlink: "definitionBlink",
        setIsVocabOverlayOpen: "vocabOverlayOpen",
        setIsWeeklyOpen: "open",
        setSeasonActiveIndex: "seasonActiveIndex",
        setStatsTab: "tab",
        setTrophyHistory: "trophyHistory",
        setTrophyLoading: "trophyLoading",
        setTrophyStatus: "trophyStatus",
        setVocabCount: "vocabCount",
        setVocabLoading: "vocabLoading",
        setVocabOverlayRequest: "vocabOverlayRequest",
        setVocabResultsReadyKey: "vocabResultsReadyKey",
        setVocabRoundDelta: "vocabRoundDelta",
        setVocabUpdatedAt: "vocabUpdatedAt",
        setVocabWeeklyCount: "vocabWeeklyCount",
        setVocabWeeklyRoundDelta: "vocabWeeklyRoundDelta",
        setVocabWeeklyUpdatedAt: "vocabWeeklyUpdatedAt",
        setWeeklyActiveIndex: "activeIndex",
        setWeeklyArrowBlink: "weeklyArrowBlink",
        setWeeklyArrowBump: "weeklyArrowBump",
        setWeeklyArrowVisible: "weeklyArrowVisible",
        setWeeklyStats: "stats",
        setWeeklyStatsError: "error",
        setWeeklyStatsLoading: "loading",
      }),
    [statsFeature]
  );
  const adminActions = React.useMemo(
    () =>
      bindFeatureStateSetters(adminFeature, {
        setDevAccountAllowed: "devAccountAllowed",
        setDevAccountLabel: "devAccountLabel",
        setDevBots: "devBots",
        setDevControls: "devControls",
        setDevControlsAvailable: "devControlsAvailable",
        setDevControlsBusy: "devControlsBusy",
        setDevControlsLocked: "devControlsLocked",
        setDevError: "devError",
        setDevMenuTapCount: "devMenuTapCount",
        setDevMenuUnlocked: "devMenuUnlocked",
        setDevPassword: "devPassword",
        setDevPasswordConfigured: "devPasswordConfigured",
        setDevPasswordRequired: "devPasswordRequired",
        setDevRoundTypes: "devRoundTypes",
        setIsDevMenuOpen: "devMenuOpen",
        setIsModerationMenuOpen: "moderationMenuOpen",
        setModerationAccountLabel: "moderationAccountLabel",
        setModerationAvailable: "moderationAvailable",
        setModerationBusy: "moderationBusy",
        setModerationError: "moderationError",
        setModerationPlayers: "moderationPlayers",
        setPerfTestEnabled: "perfTestEnabled",
        setTargetWaitDevActiveRoundId: "targetWaitDevActiveRoundId",
        setTargetWaitDevArmed: "targetWaitDevArmed",
        setTargetWaitDevGridHost: "targetWaitDevGridHost",
        setTargetWaitDevSessionState: "targetWaitDevSessionState",
        setTargetWaitDevSideHost: "targetWaitDevSideHost",
      }),
    [adminFeature]
  );
  const {
    accountMenuOpen: isAccountMenuOpen,
    accountNotice,
    aboutOpen: isAboutOpen,
    authError,
    authForm,
    authInfo,
    authModalMode,
    authSubmitting,
    definitionModal,
    facebookInviteOpen: isFacebookInviteOpen,
    helpOpen: showHelp,
    keyboardMenuOpen: isKeyboardMenuOpen,
    mobileExitConfirmOpen,
    patchNotesOpen: isPatchNotesOpen,
    playerProfileModal,
    playersOverlayMode,
    playersOverlayOpen: isPlayersOverlayOpen,
    playersOverlaySnapshot,
    popupDistinctVisitDays,
    recordModal,
    roundPlayerModal,
    settingsOpen: isSettingsOpen,
    soundMenuOpen: isSoundMenuOpen,
    supportModalSection,
    supportOpen: isSupportOpen,
    trainingBusy,
    trainingConfirm,
    visualMenuOpen: isVisualMenuOpen,
    wordInfoModal,
  } = overlaysState;
  const {
    setAccountNotice,
    setAuthError,
    setAuthForm,
    setAuthInfo,
    setAuthModalMode,
    setAuthSubmitting,
    setDefinitionModal,
    setIsAboutOpen,
    setIsAccountMenuOpen,
    setIsFacebookInviteOpen,
    setIsKeyboardMenuOpen,
    setIsPatchNotesOpen,
    setIsPlayersOverlayOpen,
    setIsSettingsOpen,
    setIsSoundMenuOpen,
    setIsSupportOpen,
    setIsVisualMenuOpen,
    setMobileExitConfirmOpen,
    setPlayerProfileModal,
    setPlayersOverlayMode,
    setPlayersOverlaySnapshot,
    setPopupDistinctVisitDays,
    setRecordModal,
    setRoundPlayerModal,
    setShowHelp,
    setSupportModalSection,
    setTrainingBusy,
    setTrainingConfirm,
    setWordInfoModal,
  } = earlyOverlayActions;
  const {
    activeIndex: weeklyActiveIndex,
    definitionBlink,
    error: weeklyStatsError,
    loading: weeklyStatsLoading,
    open: isWeeklyOpen,
    seasonActiveIndex,
    stats: weeklyStats,
    tab: statsTab,
    trophyHistory,
    trophyLoading,
    trophyStatus,
    vocabCount,
    vocabLoading,
    vocabOverlayOpen: isVocabOverlayOpen,
    vocabOverlayRequest,
    vocabResultsReadyKey,
    vocabRoundDelta,
    vocabUpdatedAt,
    vocabWeeklyCount,
    vocabWeeklyRoundDelta,
    vocabWeeklyUpdatedAt,
    weeklyArrowBlink,
    weeklyArrowBump,
    weeklyArrowVisible,
  } = statsState;
  const {
    setDefinitionBlink,
    setIsVocabOverlayOpen,
    setIsWeeklyOpen,
    setSeasonActiveIndex,
    setStatsTab,
    setTrophyHistory,
    setTrophyLoading,
    setTrophyStatus,
    setVocabCount,
    setVocabLoading,
    setVocabOverlayRequest,
    setVocabResultsReadyKey,
    setVocabRoundDelta,
    setVocabUpdatedAt,
    setVocabWeeklyCount,
    setVocabWeeklyRoundDelta,
    setVocabWeeklyUpdatedAt,
    setWeeklyActiveIndex,
    setWeeklyArrowBlink,
    setWeeklyArrowBump,
    setWeeklyArrowVisible,
    setWeeklyStats,
    setWeeklyStatsError,
    setWeeklyStatsLoading,
  } = statsActions;
  const {
    devAccountAllowed,
    devAccountLabel,
    devBots,
    devControls,
    devControlsAvailable,
    devControlsBusy,
    devControlsLocked,
    devError,
    devMenuOpen: isDevMenuOpen,
    devMenuTapCount,
    devMenuUnlocked,
    devPassword,
    devPasswordConfigured,
    devPasswordRequired,
    devRoundTypes,
    moderationAccountLabel,
    moderationAvailable,
    moderationBusy,
    moderationError,
    moderationMenuOpen: isModerationMenuOpen,
    moderationPlayers,
    perfTestEnabled,
    targetWaitDevActiveRoundId,
    targetWaitDevArmed,
    targetWaitDevGridHost,
    targetWaitDevSessionState,
    targetWaitDevSideHost,
  } = adminState;
  const {
    setDevAccountAllowed,
    setDevAccountLabel,
    setDevBots,
    setDevControls,
    setDevControlsAvailable,
    setDevControlsBusy,
    setDevControlsLocked,
    setDevError,
    setDevMenuTapCount,
    setDevMenuUnlocked,
    setDevPassword,
    setDevPasswordConfigured,
    setDevPasswordRequired,
    setDevRoundTypes,
    setIsDevMenuOpen,
    setIsModerationMenuOpen,
    setModerationAccountLabel,
    setModerationAvailable,
    setModerationBusy,
    setModerationError,
    setModerationPlayers,
    setPerfTestEnabled,
    setTargetWaitDevActiveRoundId,
    setTargetWaitDevArmed,
    setTargetWaitDevGridHost,
    setTargetWaitDevSessionState,
    setTargetWaitDevSideHost,
  } = adminActions;
  const { deviceInstallId, installIdCreatedAtTs } = identityState;
  const missingImageRef = useRef(new Set());
  const assetVersion = bootReady ? 1 : 0;
  const getImageUrl = (key) => {
    if (!key) return "";
    const url = AssetManager.getImage(key).url || "";
    if (url) return url;
    const fallback = IMAGE_FALLBACKS.get(key) || "";
    if (fallback) return fallback;
    if (bootReady) {
      if (DEV_MODE && !missingImageRef.current.has(key)) {
        missingImageRef.current.add(key);
        console.error(`[asset] image manquante (no-fallback): ${key}`);
      }
      return "";
    }
    if (fallback && DEV_MODE && !missingImageRef.current.has(key)) {
      missingImageRef.current.add(key);
      console.error(`[asset] image manquante (fallback): ${key}`);
    }
    return fallback;
  };
  const getFileUrl = (key) => {
    if (!key) return "";
    return AssetManager.getFileUrl(key) || "";
  };
  const resolveAmbientSrc = (src) => {
    if (!src) return "";
    const cached = getFileUrl(makeFileKey(src));
    if (cached) return cached;
    return typeof src === "string" ? src : "";
  };
  const resultsPathGradientIdRef = useRef(
    `results-path-gradient-${Math.random().toString(36).slice(2)}`
  );
  const listItemRefs = useRef(new Map());
  const desktopChatActionsRef = useRef({});
  const desktopChatHelpersRef = useRef({});
  const analyzeWordActionRef = useRef(null);
  const clearResultsWordAnalysisRef = useRef(null);
  const openDefinitionActionRef = useRef(null);
  const wordListFlipPrevRectsRef = useRef(new Map());
  const wordListFlipPendingRef = useRef(false);
  const wordListFlipRafIdsRef = useRef([]);
  const wordListFlipTimersRef = useRef(new Map());
  const mobileHeaderRef = useRef(null);
  const mobileRankingRef = useRef(null);
  const mobileHelpRef = useRef(null);
  const safeAreaProbeRef = useRef(null);
  const safeAreaTopProbeRef = useRef(null);
  const finaleScrollRef = useRef(null);
  const socketConnectPromiseRef = useRef(null);
  const roundStartSoundRef = useRef(null);
  const tickRef = useRef(clockFeature.store.getState().remainingSeconds);
  const weeklyStatsSnapshotRef = useRef(null);
  const tournamentBaselineRef = useRef({
    id: null,
    weeklyStats: null,
    rankingMap: null,
    rankingRound: null,
  });
  const weeklySwipeTrack = useSwipeTrackController(weeklyActiveIndex);
  const weeklyTouchRef = useRef({
    startX: null,
    startY: null,
    fromScrollable: false,
    fromProfileButton: false,
    gestureAxis: "none",
    dragging: false,
  });
  const weeklyFetchRef = useRef({ last: 0, lastTopN: null });
  const weeklyFetchStateRef = useRef({
    controller: null,
    topN: null,
    startedAt: 0,
  });
  const weeklyFetchRetryAfterRef = useRef(0);
  const weeklySlideWidthRef = useRef(0);
  const weeklySwipeBlockRef = useRef(0);
  const targetWaitDevArmedRoundIdRef = useRef(null);
  useEffect(() => {
    setPerfProbeEnabled(perfTestEnabled);
    return () => setPerfProbeEnabled(false);
  }, [perfTestEnabled]);
  const settingsCloseTimerRef = useRef(null);
  const seasonSwipeTrack = useSwipeTrackController(seasonActiveIndex);
  const seasonTouchRef = useRef({
    startX: null,
    startY: null,
    fromScrollable: false,
    fromProfileButton: false,
    gestureAxis: "none",
    dragging: false,
  });
  const seasonSlideWidthRef = useRef(0);
  const seasonSwipeBlockRef = useRef(0);
  const weeklyArrowTimerRef = useRef(null);
  const weeklyArrowBlinkTimerRef = useRef(null);
  const weeklyArrowBumpTimerRef = useRef(null);
  const weeklyArrowSeenRef = useRef(false);
  const serverClockRef = useRef(createServerClockState());
  const breakCountdownRef = useRef(null);
  const playerActivityFeature = useFeatureRuntime("activity");
  const notificationsFeature = useFeatureRuntime("notifications");
  const refreshFeature = useFeatureRuntime("refresh");
  const layoutFeature = useFeatureRuntime("layout");
  const layoutState = useFeatureSelector(layoutFeature, (state) => state);
  const chatFeature = useFeatureRuntime("chat");
  const chatState = useFeatureFields(chatFeature, CHAT_ROOT_FIELDS);
  const ocidFeature = useFeatureRuntime("ocid");
  const ocidLatestProposalRef = ocidFeature.refs.latestProposal;
  const ocidState = useFeatureSelector(ocidFeature, (state) => state);
  const resultsFeature = useFeatureRuntime("results");
  const resultsState = useFeatureSelector(resultsFeature, (state) => state);
  const liveUiFeature = useFeatureRuntime("liveUi");
  const liveUiState = useFeatureFields(liveUiFeature, LIVE_UI_ROOT_FIELDS);
  const layoutActions = React.useMemo(
    () =>
      bindFeatureStateSetters(layoutFeature, {
        setInstallPrompt: "installPrompt",
        setInstallMessage: "installMessage",
        setInstallSupport: "installSupport",
        setIsIosStandalone: "isIosStandalone",
        setIsAndroidWebBrowser: "isAndroidWebBrowser",
        setMobileHeaderOffsetPx: "mobileHeaderOffsetPx",
        setMobileLayoutSizing: "mobileLayoutSizing",
        setDesktopColumnDragId: "desktopColumnDragId",
        setDesktopColumnFractions: "desktopColumnFractions",
        setDesktopColumnHandleLayout: "desktopColumnHandleLayout",
        setDesktopColumnOrder: "desktopColumnOrder",
        setDesktopColumnResizeActiveIndex: "desktopColumnResizeActiveIndex",
        setDesktopGridMetrics: "desktopGridMetrics",
        setDesktopMainGridHeight: "desktopMainGridHeight",
        setDesktopResultsDrawerLayout: "desktopResultsDrawerLayout",
        setDesktopViewportResizeInProgress: "desktopViewportResizeInProgress",
        setGridWidth: "gridWidth",
        setMobileSpecial3Step1GhostStyle: "mobileSpecial3Step1GhostStyle",
        setMobileSpecial3Step2OverlayStyle: "mobileSpecial3Step2OverlayStyle",
        setPlayColumnHeight: "playColumnHeight",
      }),
    [layoutFeature]
  );
  const chatActions = React.useMemo(
    () =>
      bindFeatureStateSetters(chatFeature, {
        setActiveArea: "activeArea",
        setBlockedInstallIds: "blockedInstallIds",
        setChatBotVisibility: "botVisibility",
        setChatEditTarget: "editTarget",
        setChatInput: "input",
        setChatKeyboardInsetPx: "keyboardInsetPx",
        setChatMessages: "messages",
        setChatOpenedAtMs: "mobileChatOpenedAtMs",
        setChatReplyTarget: "replyTarget",
        setChatRulesAccepted: "rulesAccepted",
        setChatTab: "tab",
        setChatViewportHeight: "viewportHeight",
        setDesktopChatReactionDetails: "desktopReactionDetails",
        setDesktopChatReactionPicker: "desktopReactionPicker",
        setHomeChatBotUnreadCount: "homeBotUnreadCount",
        setHomeChatUnreadCount: "homeUnreadCount",
        setIsChatClosing: "mobileChatClosing",
        setIsChatOpenMobile: "mobileChatOpen",
        setIsChatRulesOpen: "rulesOpen",
        setIsDesktopEmojiPickerOpen: "desktopEmojiPickerOpen",
        setIsHomeChatOpen: "homeChatOpen",
        setMobileChatBotUnreadCount: "mobileBotUnreadCount",
        setMobileChatUnreadCount: "mobileUnreadCount",
        setReportDialog: "reportDialog",
        setShowBlockedList: "showBlockedList",
        setShowBotMessages: "showBotMessages",
        setUserMenu: "userMenu",
      }),
    [chatFeature]
  );
  const ocidActions = React.useMemo(
    () =>
      bindFeatureStateSetters(ocidFeature, {
        setOcidMobileResultDismissedKey: "mobileResultDismissedKey",
        setOcidProposal: "proposal",
        setOcidProposalPath: "proposalPath",
        setOcidProposalSubmitted: "proposalSubmitted",
        setOcidSelectedOptionId: "selectedOptionId",
        setOcidStatusMessage: "statusMessage",
        setOcidVote: "vote",
      }),
    [ocidFeature]
  );
  const resultsActions = React.useMemo(
    () =>
      bindFeatureStateSetters(resultsFeature, {
        setAnalysis: "analysis",
        setDesktopResultsSummaryExpanded: "desktopSummaryExpanded",
        setDismissedTournamentFinaleKey: "dismissedTournamentFinaleKey",
        setHighlightPlayers: "highlightPlayers",
        setHoveredResultsNick: "hoveredNick",
        setMobileResultsOutroFadeActive: "mobileOutroFadeActive",
        setResultsRankingMode: "rankingMode",
        setResultsReorderTick: "reorderTick",
      }),
    [resultsFeature]
  );
  const liveUiActions = React.useMemo(
    () =>
      bindFeatureStateSetters(liveUiFeature, {
        setFoundTargetThisRound: "foundTargetThisRound",
        setFoundTargetWord: "foundTargetWord",
        setGridShake: "gridShake",
        setMobileRoundIntroCountdown: "mobileRoundIntroCountdown",
        setMobileRoundIntroHideTiles: "mobileRoundIntroHideTiles",
        setMobileRoundIntroRoundDescription: "mobileRoundIntroRoundDescription",
        setMobileRoundIntroRoundLabel: "mobileRoundIntroRoundLabel",
        setMobileRoundIntroRoundTypeLabel: "mobileRoundIntroRoundTypeLabel",
        setMobileRoundIntroStage: "mobileRoundIntroStage",
        setScoreFlights: "scoreFlights",
        setSpecialHint: "specialHint",
        setSpecialSolvedOverlay: "specialSolvedOverlay",
        setTargetDefinition: "targetDefinition",
        setTargetHintScheduleMs: "targetHintScheduleMs",
      }),
    [liveUiFeature]
  );
  const {
    desktopColumnDragId,
    desktopColumnFractions,
    desktopColumnHandleLayout,
    desktopColumnOrder,
    desktopColumnResizeActiveIndex,
    desktopGridMetrics,
    desktopMainGridHeight,
    desktopResultsDrawerLayout,
    desktopViewportResizeInProgress,
    gridWidth,
    installMessage,
    installPrompt,
    installSupport,
    isAndroidWebBrowser,
    isIosStandalone,
    isMobileLayout,
    isUltraCompact,
    mobileHeaderOffsetPx,
    mobileLayoutSizing,
    mobileSpecial3Step1GhostStyle,
    mobileSpecial3Step2OverlayStyle,
    playColumnHeight,
  } = layoutState;
  const {
    setDesktopColumnDragId,
    setDesktopColumnFractions,
    setDesktopColumnHandleLayout,
    setDesktopColumnOrder,
    setDesktopColumnResizeActiveIndex,
    setDesktopGridMetrics,
    setDesktopMainGridHeight,
    setDesktopResultsDrawerLayout,
    setDesktopViewportResizeInProgress,
    setGridWidth,
    setInstallMessage,
    setInstallPrompt,
    setInstallSupport,
    setIsAndroidWebBrowser,
    setIsIosStandalone,
    setMobileHeaderOffsetPx,
    setMobileLayoutSizing,
    setMobileSpecial3Step1GhostStyle,
    setMobileSpecial3Step2OverlayStyle,
    setPlayColumnHeight,
  } = layoutActions;
  const {
    activeArea,
    blockedInstallIds,
    botVisibility: chatBotVisibility,
    desktopEmojiPickerOpen: isDesktopEmojiPickerOpen,
    desktopReactionDetails: desktopChatReactionDetails,
    desktopReactionPicker: desktopChatReactionPicker,
    editTarget: chatEditTarget,
    homeChatOpen: isHomeChatOpen,
    keyboardInsetPx: chatKeyboardInsetPx,
    mobileChatClosing: isChatClosing,
    mobileChatOpen: isChatOpenMobile,
    mobileChatOpenedAtMs: chatOpenedAtMs,
    replyTarget: chatReplyTarget,
    reportDialog,
    rulesAccepted: chatRulesAccepted,
    rulesOpen: isChatRulesOpen,
    showBlockedList,
    showBotMessages,
    tab: chatTab,
    userMenu,
    viewportHeight: chatViewportHeight,
  } = chatState;
  const {
    setActiveArea,
    setBlockedInstallIds,
    setChatBotVisibility,
    setChatEditTarget,
    setChatInput,
    setChatKeyboardInsetPx,
    setChatMessages,
    setChatOpenedAtMs,
    setChatReplyTarget,
    setChatRulesAccepted,
    setChatTab,
    setChatViewportHeight,
    setDesktopChatReactionDetails,
    setDesktopChatReactionPicker,
    setHomeChatBotUnreadCount,
    setHomeChatUnreadCount,
    setIsChatClosing,
    setIsChatOpenMobile,
    setIsChatRulesOpen,
    setIsDesktopEmojiPickerOpen,
    setIsHomeChatOpen,
    setMobileChatBotUnreadCount,
    setMobileChatUnreadCount,
    setReportDialog,
    setShowBlockedList,
    setShowBotMessages,
    setUserMenu,
  } = chatActions;
  const {
    mobileResultDismissedKey: ocidMobileResultDismissedKey,
    proposal: ocidProposal,
    proposalPath: ocidProposalPath,
    proposalSubmitted: ocidProposalSubmitted,
    selectedOptionId: ocidSelectedOptionId,
    statusMessage: ocidStatusMessage,
    vote: ocidVote,
  } = ocidState;
  const {
    setOcidMobileResultDismissedKey,
    setOcidProposal,
    setOcidProposalPath,
    setOcidProposalSubmitted,
    setOcidSelectedOptionId,
    setOcidStatusMessage,
    setOcidVote,
  } = ocidActions;
  const {
    analysis,
    desktopSummaryExpanded: desktopResultsSummaryExpanded,
    dismissedTournamentFinaleKey,
    highlightPlayers,
    hoveredNick: hoveredResultsNick,
    mobileOutroFadeActive: mobileResultsOutroFadeActive,
    pathPreview: resultsPathPreview,
    rankingMode: resultsRankingMode,
    reorderTick: resultsReorderTick,
  } = resultsState;
  const {
    setAnalysis,
    setDesktopResultsSummaryExpanded,
    setDismissedTournamentFinaleKey,
    setHighlightPlayers,
    setHoveredResultsNick,
    setMobileResultsOutroFadeActive,
    setResultsRankingMode,
    setResultsReorderTick,
  } = resultsActions;
  const {
    foundTargetThisRound,
    foundTargetWord,
    mobileRoundIntroHideTiles,
    mobileRoundIntroRoundDescription,
    mobileRoundIntroRoundLabel,
    mobileRoundIntroRoundTypeLabel,
    mobileRoundIntroStage,
    specialHint,
    specialSolvedOverlay,
    targetDefinition,
    targetHintScheduleMs,
  } = liveUiState;
  const {
    setFoundTargetThisRound,
    setFoundTargetWord,
    setGridShake,
    setMobileRoundIntroCountdown,
    setMobileRoundIntroHideTiles,
    setMobileRoundIntroRoundDescription,
    setMobileRoundIntroRoundLabel,
    setMobileRoundIntroRoundTypeLabel,
    setMobileRoundIntroStage,
    setScoreFlights,
    setSpecialHint,
    setSpecialSolvedOverlay,
    setTargetDefinition,
    setTargetHintScheduleMs,
  } = liveUiActions;
  const displayMode = useDisplayMode();
  const isFullscreen = displayMode.isFullscreen;
  const areMobileLayoutSizingsEqual = React.useCallback((a, b) => {
    if (!a || !b) return false;
    return (
      a.viewportWidth === b.viewportWidth &&
      a.viewportHeight === b.viewportHeight &&
      a.gridSide === b.gridSide &&
      a.rankingHeight === b.rankingHeight &&
      a.wordPreviewHeight === b.wordPreviewHeight &&
      a.liveFeedHeight === b.liveFeedHeight &&
      a.liveFeedMinHeight === b.liveFeedMinHeight &&
      a.bodyHeight === b.bodyHeight
    );
  }, []);
  const chatBaselineHeightRef = useRef(0);
  const chatDrawerCalibrationRef = useRef(readStoredChatDrawerCalibration());
  const chatDrawerSessionCalibrationRef = useRef(chatDrawerCalibrationRef.current);
  const chatCloseTimerRef = useRef(null);
  const chatRulesConfirmRef = useRef(null);
  const chatInputType = React.useMemo(() => {
    if (typeof navigator === "undefined") return "text";
    const ua = navigator.userAgent || "";
    const isAndroidChrome =
      /Android/i.test(ua) &&
      /Chrome/i.test(ua) &&
      !/EdgA|OPR|SamsungBrowser/i.test(ua);
    return isAndroidChrome ? "search" : "text";
  }, []);
  const ocidResultToastKeyRef = useRef("");
  const ocidResultToastDelayTimersRef = useRef([]);
  const breakKindRef = useRef(breakKind);
  useEffect(() => {
    if (phase === "results" && !isMobileLayout) return;
    setHoveredResultsNick("");
  }, [phase, isMobileLayout]);
  const authenticatedUserId = Number.isInteger(Number(authState.user?.id))
    ? Number(authState.user.id)
    : null;
  const installId = authenticatedUserId ? buildUserScopedInstallId(authenticatedUserId) : "";
  const isAccountAuthenticated = authState.status === "authenticated" && !!authState.user;
  const {
    ready: accountSeenReady,
    markers: accountSeenMarkers,
    markSeen: markAccountSeen,
  } = useAccountSeenMarkers({ authenticatedUserId, isAuthenticated: isAccountAuthenticated });
  useEffect(() => {
    if (!isAccountAuthenticated) {
      setChatRulesAccepted(false);
      return;
    }
    if (!accountSeenReady) return;
    setChatRulesAccepted(accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.chatRules));
  }, [
    accountSeenMarkers,
    accountSeenReady,
    isAccountAuthenticated,
  ]);
  const popupAudienceKey = getPopupAudienceKey(authenticatedUserId);
  const isNewPlayerPopupQuiet = isNewPlayerPopupQuietPeriod({
    accountCreatedAt: authState.user?.createdAt,
    installCreatedAt: installIdCreatedAtTs,
    isAuthenticated: isAccountAuthenticated,
    isLegacyConverted: !!authState.user?.isLegacyConverted,
  });
  const isAuthStatusPending = authState.loading || authState.status === "loading";
  const isAuthServerUnavailable = authState.status === "unavailable";
  const legacyProfileUsername = authState.legacyProfile?.usernameDisplay || "";
  const dailyFeature = useFeatureRuntime("daily");
  const dailyState = useFeatureSelector(dailyFeature, (state) => state);
  const duelFeature = useFeatureRuntime("duel");
  const duelState = useFeatureSelector(duelFeature, (state) => state);
  const tutorialFeature = useFeatureRuntime("tutorial");
  const tutorialState = useFeatureSelector(tutorialFeature, (state) => state);
  const overlayActions = React.useMemo(
    () =>
      bindFeatureStateSetters(overlaysFeature, {
        setBroadcastNotice: "broadcastNotice",
        setVaultWordOfDayPopup: "vaultWordOfDayPopup",
      }),
    [overlaysFeature]
  );
  const dailyActions = React.useMemo(
    () =>
      bindFeatureStateSetters(dailyFeature, {
        setDailyActiveSlot: "activeSlot",
        setDailyBoard: "board",
        setDailyHistory: "history",
        setDailyHistoryError: "historyError",
        setDailyHistoryIndex: "historyIndex",
        setDailyHistoryLoading: "historyLoading",
        setDailyInvalidPulseKey: "invalidPulseKey",
        setDailyInvalidSlot: "invalidSlot",
        setDailyLaunchDialog: "launchDialog",
        setDailyLockPulseKey: "lockPulseKey",
        setDailyPlayMode: "playMode",
        setDailyRankingView: "rankingView",
        setDailyResult: "result",
        setDailySection: "section",
        setDailySpecialDrag: "specialDrag",
        setDailySpecialPlacements: "specialPlacements",
        setDailyStartError: "startError",
        setDailyStatus: "status",
        setDailySubmitError: "submitError",
        setDailyWordSlots: "wordSlots",
      }),
    [dailyFeature]
  );
  const duelActions = React.useMemo(
    () =>
      bindFeatureStateSetters(duelFeature, {
        setDuelConsumedValidatedByView: "consumedValidatedByView",
        setDuelObjectivesPopupDismissedDateId: "objectivesPopupDismissedDateId",
        setDuelPopupState: "popup",
        setDuelRerollBusyBucket: "rerollBusyBucket",
        setDuelStatus: "status",
        setDuelWeekRecapOpen: "weekRecapOpen",
        setDuelWeekRecapPage: "weekRecapPage",
        setDuelWeekRecapPreviewMode: "weekRecapPreviewMode",
        setResultsTeamDelta: "resultsTeamDelta",
      }),
    [duelFeature]
  );
  const tutorialActions = React.useMemo(
    () =>
      bindFeatureStateSetters(tutorialFeature, {
        setGuidedResultsStep: "guidedResultsStep",
        setIsSpecialTutorialOpen: "specialOpen",
        setIsTutorialOpen: "open",
        setSpecialTutorialPlan: "specialPlan",
        setSpecialTutorialStepIndex: "specialStepIndex",
        setTutorialPendingLogin: "pendingLogin",
      }),
    [tutorialFeature]
  );
  const { broadcastNotice, vaultWordOfDayPopup } = overlaysState;
  const { setBroadcastNotice, setVaultWordOfDayPopup } = overlayActions;
  const {
    activeSlot: dailyActiveSlot,
    board: dailyBoard,
    history: dailyHistory,
    historyError: dailyHistoryError,
    historyIndex: dailyHistoryIndex,
    historyLoading: dailyHistoryLoading,
    invalidPulseKey: dailyInvalidPulseKey,
    invalidSlot: dailyInvalidSlot,
    launchDialog: dailyLaunchDialog,
    lockPulseKey: dailyLockPulseKey,
    playMode: dailyPlayMode,
    rankingView: dailyRankingView,
    result: dailyResult,
    section: dailySection,
    specialDrag: dailySpecialDrag,
    specialPlacements: dailySpecialPlacements,
    startError: dailyStartError,
    status: dailyStatus,
    submitError: dailySubmitError,
    wordSlots: dailyWordSlots,
  } = dailyState;
  const {
    setDailyActiveSlot,
    setDailyBoard,
    setDailyHistory,
    setDailyHistoryError,
    setDailyHistoryIndex,
    setDailyHistoryLoading,
    setDailyInvalidPulseKey,
    setDailyInvalidSlot,
    setDailyLaunchDialog,
    setDailyLockPulseKey,
    setDailyPlayMode,
    setDailyRankingView,
    setDailyResult,
    setDailySection,
    setDailySpecialDrag,
    setDailySpecialPlacements,
    setDailyStartError,
    setDailyStatus,
    setDailySubmitError,
    setDailyWordSlots,
  } = dailyActions;
  const {
    consumedValidatedByView: duelConsumedValidatedByView,
    objectivesPopupDismissedDateId: duelObjectivesPopupDismissedDateId,
    popup: duelPopupState,
    rerollBusyBucket: duelRerollBusyBucket,
    resultsTeamDelta,
    status: duelStatus,
    weekRecapOpen: duelWeekRecapOpen,
    weekRecapPage: duelWeekRecapPage,
    weekRecapPreviewMode: duelWeekRecapPreviewMode,
  } = duelState;
  const duelWeeklyTotals = duelStatus?.weekly?.totalsByTeam || {
    red: 0,
    blue: 0,
  };
  const duelRedScore = Number(duelWeeklyTotals?.red) || 0;
  const duelBlueScore = Number(duelWeeklyTotals?.blue) || 0;
  const {
    setDuelConsumedValidatedByView,
    setDuelObjectivesPopupDismissedDateId,
    setDuelPopupState,
    setDuelRerollBusyBucket,
    setDuelStatus,
    setDuelWeekRecapOpen,
    setDuelWeekRecapPage,
    setDuelWeekRecapPreviewMode,
    setResultsTeamDelta,
  } = duelActions;
  const {
    guidedResultsStep,
    open: isTutorialOpen,
    pendingLogin: tutorialPendingLogin,
    specialOpen: isSpecialTutorialOpen,
    specialPlan: specialTutorialPlan,
    specialStepIndex: specialTutorialStepIndex,
  } = tutorialState;
  const {
    setGuidedResultsStep,
    setIsSpecialTutorialOpen,
    setIsTutorialOpen,
    setSpecialTutorialPlan,
    setSpecialTutorialStepIndex,
    setTutorialPendingLogin,
  } = tutorialActions;
  const {
    announcement: globalRedAnnouncement,
    showGlobalRedAnnouncement,
  } = useGlobalRedAnnouncement();
  const tournamentDuelDeltaRef = useRef({
    tournamentId: null,
    red: 0,
    blue: 0,
  });
  const duelStatusFetchStateRef = useRef({
    inFlight: false,
    key: "",
    startedAt: 0,
  });
  const duelWeekRecapOpenAfterRefreshRef = useRef(null);
  const duelWeekRecapWeeklyRefreshRef = useRef("");
  const dailyHistoryScrollRef = useRef(null);
  const dailySpecialDragRef = useRef(null);
  const dailySpecialDragGhostRef = useRef(null);
  const bindDailySpecialDragGhost = React.useCallback((node) => {
    dailySpecialDragGhostRef.current = node;
    const drag = dailySpecialDragRef.current;
    if (!node || !Number.isFinite(drag?.x) || !Number.isFinite(drag?.y)) return;
    node.style.transform = getDailySpecialDragTransform(drag.x, drag.y);
  }, []);
  const dailyTictocPlayedRef = useRef(false);
  const dailySessionRef = useRef({ dateId: null, startedAt: null });
  const dailySubmitRef = useRef({ inFlight: false });
  const dailyLifecycleRef = useRef({ startGeneration: 0 });
  const dailySpecialTutorialPauseStartedAtRef = useRef(null);
  const shouldShowTutorial =
    isAccountAuthenticated &&
    accountSeenReady &&
    !accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.mainTutorial);
  const isDailyView = appView === "daily" || appView === "daily_play" || appView === "daily_results";
  const isDailyPlay = appView === "daily_play";
  const shouldProtectMobileLiveExit =
    isMobileLayout && isLoggedIn && appView === "live" && phase === "playing" && !isDailyPlay;
  const isDailySpecialMode =
    isDailyPlay && (dailyPlayMode === DAILY_SPECIAL_MODE || !dailyPlayMode);
  const isLiveSpecial3WordsMode =
    !isDailyPlay && phase === "playing" && specialRound?.type === DAILY_SPECIAL_MODE;
  const isSpecial3WordsMode = isDailySpecialMode || isLiveSpecial3WordsMode;
  shouldForceTraceRenderRef.current = phase !== "playing";
  const desktopColumnBaseDefs = isDailyPlay
    ? DAILY_DESKTOP_COLUMN_DEFS
    : LIVE_DESKTOP_COLUMN_DEFS;
  const desktopColumnDefaultOrder = desktopColumnBaseDefs.map((entry) => entry.id);
  const desktopColumnBaseDefaultFractions = desktopColumnBaseDefs.map(
    (entry) => entry.defaultFraction
  );
  const desktopColumnStorageScope = isDailyPlay ? "daily_v2" : "live";
  const isDailySpecial3TutorialActive =
    phase === "playing" &&
    isDailyPlay &&
    dailyPlayMode === DAILY_SPECIAL_MODE &&
    isSpecialTutorialOpen &&
    specialTutorialPlan?.type === DAILY_SPECIAL_MODE;
  const isSpecial3TutorialInteractiveActive =
    phase === "playing" &&
    isSpecialTutorialOpen &&
    specialTutorialPlan?.type === DAILY_SPECIAL_MODE &&
    (isSpecial3WordsMode || specialRound?.type === DAILY_SPECIAL_MODE);
  const completeGuidedResultsTutorial = React.useCallback(() => {
    markAccountSeen(ACCOUNT_SEEN_MARKERS.guidedResultsTutorial);
    setGuidedResultsStep(null);
  }, [markAccountSeen]);
  const markSpecialTutorialSeen = React.useCallback(
    (type) => {
      if (!type) return;
      markAccountSeen(buildSpecialTutorialSeenMarker(type));
    },
    [markAccountSeen]
  );
  useEffect(() => {
    if (!installId) return;
    const migrated = sessionPersistenceFeature.migrateSessionInstallId({
      legacyInstallIds: [deviceInstallId],
      nextInstallId: installId,
    });
    if (migrated) setCanResumeSession(true);
  }, [
    deviceInstallId,
    installId,
    sessionPersistenceFeature,
    setCanResumeSession,
  ]);

  function clearCelebrationFx() {
    if (gridShakeTimerRef.current) {
      clearTimeout(gridShakeTimerRef.current);
      gridShakeTimerRef.current = null;
    }
    try {
      gridShakeAnimationRef.current?.cancel?.();
    } catch (_) {}
    gridShakeAnimationRef.current = null;
    confettiBurstTokenRef.current += 1;
    celebrationFeature.clearAllCelebrationFlashes();
    setScoreFlights([]);
    setGridShake(false);
    progressFeature.clearInputShake();
    try {
      confetti.reset?.();
    } catch (_) {}
  }

  function invalidateGameplaySession() {
    gameplaySessionTokenRef.current += 1;
    pendingRoundEndRef.current = null;
    pendingBreakStartRef.current = null;
    implodeFallbackRef.current = false;
    outroInFlightRef.current = false;
    outroRoundRef.current = null;
    blackHoleSyncTokenRef.current += 1;
    if (blackHoleSourisLoopRef.current.intervalId) {
      clearInterval(blackHoleSourisLoopRef.current.intervalId);
      blackHoleSourisLoopRef.current.intervalId = null;
    }
    if (blackHoleSourisLoopRef.current.stopTimer) {
      clearTimeout(blackHoleSourisLoopRef.current.stopTimer);
      blackHoleSourisLoopRef.current.stopTimer = null;
    }
    if (blackHoleClavierFadeRef.current) {
      clearTimeout(blackHoleClavierFadeRef.current);
      blackHoleClavierFadeRef.current = null;
    }
    if (blackHoleAuxStopRef.current) {
      clearTimeout(blackHoleAuxStopRef.current);
      blackHoleAuxStopRef.current = null;
    }
    blackHoleHandleRef.current?.stop?.();
    blackHoleChebHandleRef.current?.stop?.();
    blackHoleClavierHandleRef.current?.stop?.();
    blackHoleHandleRef.current = null;
    blackHoleChebHandleRef.current = null;
    blackHoleClavierHandleRef.current = null;
    blackHoleOverlayRef.current?.remove?.();
    blackHoleOverlayRef.current = null;
    const gridEl = gridRef.current;
    if (gridEl?.style) {
      gridEl.style.opacity = "";
      gridEl.style.transition = "";
    }
  }

  function disposeGameplayRuntimeResources() {
    invalidateGameplaySession();
    clearQueuedRankingUpdate();
    clockFeature.stop({ preserveRemaining: true });
    stopRoundStartSound({ fadeMs: 80 });
    stopImplodePhase();
    stopMobileRoundIntro({ unlockInput: false });
    clearResultsSlideTimers();
    clearWordListFlipArtifacts();
    stopVocabOverlayAnimation();
    stopRoundEndTickSound({ fadeMs: 0 });
    cancelAllWordsCompute();
    resetSubmissionQueue();
    clearSelection();
    roundStartPendingRef.current = null;
    roundStartRetryRef.current = false;
    pendingSubmissionRecoveryRef.current = null;
    vocabBaselineRoundRef.current = null;
    vocabWeeklyBaselineRoundRef.current = null;
    vocabResultsPendingRef.current = null;
  }

  function returnToLobby() {
    if (!gameplaySessionFeature.cancel("return_to_lobby")) {
      disposeGameplayRuntimeResources();
    }
    if (standaloneTrainingSessionRef.current) {
      if (socket.connected) {
        socket.emit("training:standalone:stop", {
          roomId: roomIdRef.current,
          joinLive: false,
        });
      }
      standaloneTrainingController.clearSession();
    }
    setIsSettingsOpen(false);
    // Désactive immédiatement les events "manche live" pour éviter
    // qu'un roundEnded en transit relance un outro/blackhole après retour lobby.
    isLoggedInRef.current = false;
    liveSessionReadyRef.current = false;
    phaseRef.current = "lobby";
    appViewRef.current = "home";
    roundStartPendingRef.current = null;
    roundStartRetryRef.current = false;
    roundStartSoundRef.current = null;
    stopRoundStartSound({ fadeMs: 80 });
    clockFeature.stop({ preserveRemaining: true });
    connectionFeature.cancelDisconnectGrace();
    if (manualRefreshTimerRef.current) {
      clearTimeout(manualRefreshTimerRef.current);
      manualRefreshTimerRef.current = null;
    }
    connectionFeature.cancelForegroundRetry();
    if (chatCloseTimerRef.current) {
      clearTimeout(chatCloseTimerRef.current);
      chatCloseTimerRef.current = null;
    }
    if (definitionBlinkTimerRef.current) {
      clearTimeout(definitionBlinkTimerRef.current);
      definitionBlinkTimerRef.current = null;
    }
    if (weeklyArrowTimerRef.current) {
      clearTimeout(weeklyArrowTimerRef.current);
      weeklyArrowTimerRef.current = null;
    }
    if (weeklyArrowBlinkTimerRef.current) {
      clearTimeout(weeklyArrowBlinkTimerRef.current);
      weeklyArrowBlinkTimerRef.current = null;
    }
    if (weeklyArrowBumpTimerRef.current) {
      clearTimeout(weeklyArrowBumpTimerRef.current);
      weeklyArrowBumpTimerRef.current = null;
    }
    stopImplodePhase();
    stopMobileRoundIntro({ unlockInput: false });
    roundIntroServerWindowRef.current = {
      roundId: null,
      startsAt: null,
      introMs: 0,
      status: "running",
    };
    roundIntroStartedForRoundRef.current = null;
    clearResultsSlideTimers();
    clearWordListFlipArtifacts();
    stopVocabOverlayAnimation();
    clearQueuedRankingUpdate();
    resetSubmissionQueue();
    cancelAllWordsCompute();
    clearToasts();
    clearStatusMessage({ force: true });
    clearCelebrationFx();
    inputLockedRef.current = false;
    applicationKernel.commands.transition.apply({
      game: {
        implodeActive: false,
        inputLocked: false,
        phase: "lobby",
      },
      navigation: { view: "home" },
      realtime: {
        breakKind: null,
        nextStartAt: null,
        roundId: null,
        roundPreparing: null,
        serverEndsAt: null,
        serverRoundDurationMs: null,
      },
      session: {
        connectionError: "",
        isLoggedIn: false,
        resumePending: false,
        resumeSnapshot: null,
        serverStatus: "waiting",
      },
    });
    setSpecialHint(null);
    setTargetHintScheduleMs([]);
    setSpecialSolvedOverlay(null);
    setFoundTargetThisRound(false);
    setFoundTargetWord("");
    stopRoundEndTickSound({ fadeMs: 0 });
    stopAllActiveAudio({ suspendContext: false, immediate: true });
    dailySessionRef.current = { dateId: null, startedAt: null };
    setDailyResult(null);
    resumeProbeRef.current = { inFlight: false, lastAt: 0 };
    resumeLockRef.current = false;
    resumeLockAtRef.current = 0;
    manualDisconnectRef.current = true;
    clearSavedSession();
    isLoggedInRef.current = false;
    try {
      socket.disconnect();
    } catch (_) {}
  }
  const resumeLockRef = useRef(false);
  const resumeLockAtRef = useRef(0);
  const resumeProbeRef = useRef({ inFlight: false, lastAt: 0 });
  const roundHandlersRef = useRef({
    onBreakStarted: null,
    onCultureThemeChallenge: null,
    onRoundEnded: null,
    onRoundPreparing: null,
    onRoundStarted: null,
    onSpecialHint: null,
    onSpecialSolved: null,
    onTournamentLobbyUpdate: null,
  });
  const phaseLoopTestEnabled = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = new URLSearchParams(window.location.search || "").get(
        DEV_PHASE_LOOP_QUERY_PARAM
      );
      if (!raw) return false;
      const normalized = String(raw).trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "on";
    } catch (_) {
      return false;
    }
  }, []);
  const phaseLoopTestEnabledRef = useRef(phaseLoopTestEnabled);
  const phaseLoopTimerRef = useRef(null);
  const phaseLoopRoundCounterRef = useRef(0);
  const isLoggedInRef = useRef(false);
  const appViewRef = useRef(appView);
  const isDailyPlayRef = useRef(isDailyPlay);
  const nicknameRef = useRef(nickname);
  const phaseRef = useRef(phase);
  const currentRoundTrainingRef = useRef(false);
  const previousPhaseRef = useRef(phase);
  const currentRoomIdRef = useRef(currentRoomId);
  const roundIdRef = useRef(roundId);
  const tournamentRef = useRef(tournament);
  const startGameFromServerRef = useRef(null);
  const standaloneTrainingFeature = useFeatureRuntime("standaloneTraining");
  const standaloneTrainingState = useFeatureSelector(
    standaloneTrainingFeature,
    (state) => state
  );
  const standaloneTrainingSession = standaloneTrainingState.session;
  const standaloneTrainingSessionRef = standaloneTrainingFeature.refs.session;
  const standaloneTrainingController = {
    busy: standaloneTrainingState.busy,
    cancelJoinDialog: standaloneTrainingFeature.cancelJoinDialog,
    clearSession: standaloneTrainingFeature.clearSession,
    confirmJoinLive: standaloneTrainingFeature.confirmJoinLive,
    joinDialog: standaloneTrainingState.joinDialog,
    requestJoinLive: standaloneTrainingFeature.requestJoinLive,
    returnToLobby: standaloneTrainingFeature.returnToLobby,
    start: standaloneTrainingFeature.startTraining,
  };
  useEffect(() => {
    gameplaySessionFeature.configure({
      onCancel: ({ previous } = {}) => {
        if (previous?.origin === "live") {
          liveSessionReadyRef.current = false;
        }
        disposeGameplayRuntimeResources();
      },
    });
  });
  useEffect(() => {
    standaloneTrainingFeature.configure({
      ensureConnection: connectSocketWithAuth,
      getIdentityPayload: () => ({
        installId: installIdRef.current,
        nick: nicknameRef.current.trim(),
        roomId: roomIdRef.current,
      }),
      getNowServerMs,
      onHint: setSpecialHint,
      onJoinLive: joinStandaloneTrainingLive,
      onLaunch: launchStandaloneTraining,
      onReturnLobby: returnToLobby,
      phase,
      roomIdRef,
      showToast,
      socket,
    });
  });
  const requestSessionResumeSnapshotRef = useRef(null);
  const resumeLoginFromSessionRef = useRef(null);
  const previousAppViewRef = useRef(appView);
  const attemptSilentReconnectRef = useRef(null);
  const pingInFlightRef = useRef(false);
  const liveStateSyncInFlightRef = useRef(null);
  const handleForegroundRef = useRef(null);
  const runHealthCheckRef = useRef(null);
  const mobileExitGuardLeavingRef = useRef(false);
  const mobileExitGuardActiveRef = useRef(false);
  const deferredTraceUiTasksRef = useRef([]);
  const clearPhaseLoopTimer = React.useCallback(() => {
    if (phaseLoopTimerRef.current) {
      clearTimeout(phaseLoopTimerRef.current);
      phaseLoopTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    phaseLoopTestEnabledRef.current = phaseLoopTestEnabled;
  }, [phaseLoopTestEnabled]);
  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);
  useEffect(() => {
    isMobileLayoutRef.current = isMobileLayout;
  }, [isMobileLayout]);
  useEffect(() => {
    installIdRef.current = installId;
  }, [installId]);
  useEffect(() => {
    isAccountAuthenticatedRef.current = isAccountAuthenticated;
  }, [isAccountAuthenticated]);
  useEffect(() => {
    appViewRef.current = appView;
  }, [appView]);
  const signalLivePlayerActivity = React.useCallback(
    (kind = "interaction", options = {}) =>
      playerActivityFeature.signal(kind, options),
    [playerActivityFeature]
  );
  useEffect(() => () => clearPhaseLoopTimer(), [clearPhaseLoopTimer]);
  useEffect(() => {
    isDailyPlayRef.current = isDailyPlay;
  }, [isDailyPlay]);
  useEffect(() => {
    if (isLoggedIn && phase !== "lobby") return;
    clearCelebrationFx();
    stopAllActiveAudio({ suspendContext: false, immediate: true });
  }, [isLoggedIn, phase]);
  useEffect(() => {
    const currentView = appViewRef.current;
    const isIsolatedView =
      currentView === "training" ||
      currentView === "daily" ||
      currentView === "daily_play" ||
      currentView === "daily_results";
    if (isLoggedIn && !isIsolatedView) {
      setAppView("live");
    }
  }, [isLoggedIn]);
  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const pushMobileExitGuardHistoryEntry = React.useCallback(() => {
    if (typeof window === "undefined" || !window.history?.pushState) return;
    const marker = "__gobbleMobileExitGuard";
    const currentState =
      window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {};
    if (currentState?.[marker]) return;
    try {
      window.history.pushState({ ...currentState, [marker]: true }, "", window.location.href);
    } catch (_) {}
  }, []);
  useEffect(() => {
    if (!shouldProtectMobileLiveExit) {
      setMobileExitConfirmOpen(false);
      mobileExitGuardActiveRef.current = false;
      mobileExitGuardLeavingRef.current = false;
      return undefined;
    }

    mobileExitGuardActiveRef.current = true;
    mobileExitGuardLeavingRef.current = false;
    pushMobileExitGuardHistoryEntry();

    const onPopState = () => {
      if (!mobileExitGuardActiveRef.current || mobileExitGuardLeavingRef.current) return;
      setMobileExitConfirmOpen(true);
      window.setTimeout(pushMobileExitGuardHistoryEntry, 0);
    };
    const onBeforeUnload = (event) => {
      if (!mobileExitGuardActiveRef.current || mobileExitGuardLeavingRef.current) return undefined;
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [pushMobileExitGuardHistoryEntry, roundId, shouldProtectMobileLiveExit]);
  useEffect(() => {
    if (chatTab === "system") {
      setIsDesktopEmojiPickerOpen(false);
      setDesktopChatReactionPicker((prev) => (prev.open ? { ...prev, open: false } : prev));
      setDesktopChatReactionDetails((prev) => (prev.open ? { ...prev, open: false } : prev));
    }
  }, [chatTab]);
  useEffect(() => {
    isChatClosingRef.current = isChatClosing;
  }, [isChatClosing]);
  useEffect(() => {
    inputLockedRef.current = inputLocked;
  }, [inputLocked]);
  useEffect(() => {
    if (isSfxMuted) return;
    const warmEssentialSfx = async () => {
      try {
        await AssetManager.preload({
          priority: "high",
          includeTypes: ["sfx"],
          excludeTypes: ["image", "file"],
          concurrency: 2,
        });
      } catch (_) {}
    };
    warmEssentialSfx();
  }, [isSfxMuted]);
  useEffect(() => {
    if (!visualGobbleEnabled) {
      celebrationFeature.clearCelebrationFlash("gobbleFlash");
    }
  }, [celebrationFeature, visualGobbleEnabled]);
  useEffect(() => {
    if (!visualPraiseEnabled) {
      celebrationFeature.clearCelebrationFlash("praiseFlash");
    }
  }, [celebrationFeature, visualPraiseEnabled]);
  useEffect(() => {
    if (!visualScoreFlightsEnabled) {
      setScoreFlights([]);
    }
  }, [visualScoreFlightsEnabled]);
  useEffect(() => {
    if (phase === "playing") return;
    setScoreFlights((current) => (current.length > 0 ? [] : current));
  }, [phase]);
  useEffect(() => {
    if (!visualInvalidWordsEnabled) {
      celebrationFeature.clearCelebrationFlash("invalidFlash");
    }
  }, [celebrationFeature, visualInvalidWordsEnabled]);
  useEffect(() => {
    if (!visualScreenShakeEnabled) {
      progressFeature.clearInputShake();
      setGridShake(false);
      try {
        gridShakeAnimationRef.current?.cancel?.();
      } catch (_) {}
      gridShakeAnimationRef.current = null;
    }
  }, [progressFeature, visualScreenShakeEnabled]);
  useEffect(() => {
    if (!visualConfettiEnabled) {
      confettiBurstTokenRef.current += 1;
      try {
        confetti.reset?.();
      } catch (_) {}
    }
  }, [visualConfettiEnabled]);
  const desktopChatFontPx = Math.round(14 * chatDesktopFontScale * 10) / 10;
  const desktopChatMetaFontPx = Math.round(11 * chatDesktopFontScale * 10) / 10;
  const desktopChatMicroFontPx = Math.round(10 * chatDesktopFontScale * 10) / 10;
  const desktopChatInputFontPx = Math.round(14 * chatDesktopFontScale * 10) / 10;
  const desktopChatQuickReplyFontPx = Math.round(11 * chatDesktopFontScale * 10) / 10;
  const desktopChatLineHeightPx = Math.round(desktopChatFontPx * 1.38 * 10) / 10;
  const desktopChatMetaLineHeightPx = Math.round(desktopChatMetaFontPx * 1.4 * 10) / 10;
  const desktopChatInputLineHeightPx = Math.round(desktopChatInputFontPx * 1.4 * 10) / 10;
  const desktopChatScaleLabel = `${Math.round(chatDesktopFontScale * 100)}%`;
  useEffect(() => {
    currentRoomIdRef.current = currentRoomId;
  }, [currentRoomId]);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  useEffect(() => {
    roundIdRef.current = roundId;
  }, [roundId]);
  useEffect(() => {
    return () => {
      deferredTraceUiTasksRef.current = [];
    };
  }, []);
  useEffect(() => {
    breakKindRef.current = breakKind;
  }, [breakKind]);
  useEffect(() => {
    const syncTickRef = () => {
      const nextTick = clockFeature.store.getState().remainingSeconds;
      tickRef.current = nextTick;
      if (typeof window !== "undefined" && window.__gobbleCrashRuntime) {
        window.__gobbleCrashRuntime.tick = Number.isFinite(nextTick)
          ? nextTick
          : null;
      }
    };
    syncTickRef();
    return clockFeature.store.subscribe(syncTickRef);
  }, [clockFeature]);
  useEffect(() => {
    tournamentRef.current = tournament;
  }, [tournament]);
  // Les états du chat appartiennent au satellite chat.
  const chatMessagesRef = useRef(chatFeature.store.getState().messages);
  useEffect(() => {
    const syncChatMessagesRef = () => {
      chatMessagesRef.current = chatFeature.store.getState().messages;
    };
    syncChatMessagesRef();
    return chatFeature.store.subscribe(syncChatMessagesRef);
  }, [chatFeature]);
  useEffect(() => {
    chatReplyTargetRef.current = chatReplyTarget;
  }, [chatReplyTarget]);
  useEffect(() => {
    chatEditTargetRef.current = chatEditTarget;
  }, [chatEditTarget]);
  const playerProfileFetchRef = useRef({ requestId: 0, controller: null });
  const roundPlayerAnchorElementRef = useRef(null);
  const roundPlayerAnchorNickRef = useRef("");
  const handleVocabOverlayVisibilityChange = React.useCallback((open) => {
    setIsVocabOverlayOpen(!!open);
    if (!open) setVocabOverlayRequest(null);
  }, []);
  useEffect(() => {
    if (phase !== "playing" || !isAccountAuthenticated) return;
    void loadVocabProgressOverlay();
  }, [isAccountAuthenticated, phase]);
  const crashRuntimeSignatureRef = useRef("");
  const mobileResultsPageRuntimeRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentGameProgress = applicationKernel.getState().game;
    const runtime = {
      phase,
      appView,
      isMobileLayout,
      isUltraCompact,
      isFullscreen,
      isLoggedIn,
      isConnecting,
      isDailyView,
      isDailyPlay,
      isChatOpenMobile,
      isChatClosing,
      isHomeChatOpen,
      safeChatTab: chatTab === "system" ? "system" : "messages",
      resultsRankingMode,
      showAllWords,
      showHelp,
      canResumeSession,
      resumePending,
      authStatus: authState?.status || null,
      isAccountAuthenticated,
      accountUsername: authState?.user?.usernameDisplay || null,
      accountMustResetPassword: !!authState?.user?.mustResetPassword,
      connectionError: connectionError || "",
      loginError: loginError || "",
      weeklyStatsError: weeklyStatsError || "",
      duelError: duelStatus?.error || "",
      duelTeam: duelStatus?.team || null,
      serverStatus: serverStatus || "",
      socketConnected: !!socket.connected,
      roundId: roundId || null,
      roomId: roomId || null,
      gridSize: Number(gridSize) || null,
      score: Number.isFinite(currentGameProgress.score)
        ? currentGameProgress.score
        : null,
      tick: Number.isFinite(tickRef.current) ? tickRef.current : null,
      acceptedCount: Array.isArray(currentGameProgress.accepted)
        ? currentGameProgress.accepted.length
        : null,
      allWordsCount: Array.isArray(allWords) ? allWords.length : null,
      playersCount: Array.isArray(players) ? players.length : null,
      provisionalRankingCount: Array.isArray(provisionalRanking) ? provisionalRanking.length : null,
      finalResultsCount: Array.isArray(finalResults) ? finalResults.length : null,
      announcementsCount: Array.isArray(
        feedFeature.store.getState().announcements
      )
        ? feedFeature.store.getState().announcements.length
        : null,
      chatMessagesCount: Array.isArray(chatMessagesRef.current)
        ? chatMessagesRef.current.length
        : null,
      blockedInstallIdsCount: Array.isArray(blockedInstallIds) ? blockedInstallIds.length : null,
      mobileResultsPage: Number.isFinite(mobileResultsPageRuntimeRef.current)
        ? mobileResultsPageRuntimeRef.current
        : null,
      specialRoundType: specialRound?.type || null,
      specialRoundIsSpecial: !!specialRound?.isSpecial,
      targetSummaryOpen: !!targetSummary,
      vocabOverlayOpen: !!isVocabOverlayOpen,
      vocabCount: Number.isFinite(vocabCount) ? vocabCount : null,
      vocabWeeklyCount: Number.isFinite(vocabWeeklyCount) ? vocabWeeklyCount : null,
      vocabRoundDelta: Number.isFinite(vocabRoundDelta) ? vocabRoundDelta : null,
      vocabWeeklyRoundDelta: Number.isFinite(vocabWeeklyRoundDelta)
        ? vocabWeeklyRoundDelta
        : null,
      preferLiteVisualEffects: !!preferLiteVisualEffects,
      visualEffects: {
        gobble: !!visualGobbleEnabled,
        praise: !!visualPraiseEnabled,
        scoreFlights: !!visualScoreFlightsEnabled,
        invalidWords: !!visualInvalidWordsEnabled,
        screenShake: !!visualScreenShakeEnabled,
        confetti: !!visualConfettiEnabled,
        goldNickFx: !!visualGoldNickFxEnabled,
      },
      specialTutorialOpen: !!isSpecialTutorialOpen,
      guidedResultsStep: guidedResultsStep || null,
      installId: typeof installId === "string" ? installId : null,
      authenticatedUserId:
        Number.isInteger(Number(authenticatedUserId)) && Number(authenticatedUserId) > 0
          ? String(authenticatedUserId)
          : null,
    };
    window.__gobbleCrashRuntime = runtime;
    const runtimeSignature = JSON.stringify(runtime);
    if (runtimeSignature !== crashRuntimeSignatureRef.current) {
      crashRuntimeSignatureRef.current = runtimeSignature;
      try {
        const pushBreadcrumb = window.__pushGobbleCrashBreadcrumb;
        if (typeof pushBreadcrumb === "function") {
          pushBreadcrumb("app-state", {
            phase: runtime.phase,
            appView: runtime.appView,
            roomId: runtime.roomId,
            roundId: runtime.roundId,
            resultsRankingMode: runtime.resultsRankingMode,
            mobileResultsPage: runtime.mobileResultsPage,
            showAllWords: runtime.showAllWords,
            socketConnected: runtime.socketConnected,
            isMobileLayout: runtime.isMobileLayout,
            preferLiteVisualEffects: runtime.preferLiteVisualEffects,
            isAccountAuthenticated: runtime.isAccountAuthenticated,
            authStatus: runtime.authStatus,
            duelError: runtime.duelError,
            connectionError: runtime.connectionError,
          });
        }
      } catch (_) {}
    }
    return () => {
      try {
        delete window.__gobbleCrashRuntime;
      } catch (_) {}
    };
  }, [
    phase,
    appView,
    isMobileLayout,
    isUltraCompact,
    isFullscreen,
    isLoggedIn,
    isConnecting,
    isDailyView,
    isDailyPlay,
    isChatOpenMobile,
    isChatClosing,
    isHomeChatOpen,
    chatTab,
    resultsRankingMode,
    showAllWords,
    showHelp,
    canResumeSession,
    resumePending,
    authState,
    isAccountAuthenticated,
    connectionError,
    loginError,
    weeklyStatsError,
    duelStatus,
    serverStatus,
    applicationKernel,
    allWords,
    players,
    provisionalRanking,
    finalResults,
    feedFeature,
    blockedInstallIds,
    roundId,
    roomId,
    gridSize,
    specialRound,
    targetSummary,
    isVocabOverlayOpen,
    vocabCount,
    vocabWeeklyCount,
    vocabRoundDelta,
    vocabWeeklyRoundDelta,
    preferLiteVisualEffects,
    visualGobbleEnabled,
    visualPraiseEnabled,
    visualScoreFlightsEnabled,
    visualInvalidWordsEnabled,
    visualScreenShakeEnabled,
    visualConfettiEnabled,
    visualGoldNickFxEnabled,
    isSpecialTutorialOpen,
    guidedResultsStep,
    installId,
    authenticatedUserId,
  ]);

  const acceptedRef = useRef([]);
  const acceptedWordSetRef = useRef(new Set());
  const acceptedScoresRef = useRef(new Map());
  const acceptedBestPtsRef = useRef(new Map());
  const acceptedWordMetaRef = useRef(new Map());
  const dailyAcceptedPathsRef = useRef(new Map());
  const serverSolutionsReadyRef = useRef(false);
  const submissionStatusRef = useRef(new Map());
  const pendingWordsRef = useRef(new Set());
  const pendingQueueRef = useRef([]);
  const inFlightBatchesRef = useRef(new Map());
  const pendingSubmissionRecoveryRef = useRef(null);
  const batchTimerRef = useRef(null);
  const batchSeqRef = useRef(1);
  const batchUnsupportedRef = useRef(false);
  const lastRoundWindowRef = useRef({ startAt: null, endAt: null });
  const vocabBaselineRef = useRef(null);
  const vocabBaselineRoundRef = useRef(null);
  const vocabWeeklyBaselineRef = useRef(null);
  const vocabWeeklyBaselineRoundRef = useRef(null);
  const vocabWeeklyRankBaselineRef = useRef(null);
  const vocabOverlayRoundRef = useRef(null);
  const vocabOverlayRankSnapshotRef = useRef(null);
  const vocabOverlayControllerRef = useRef(null);
  const vocabOverlayRequestIdRef = useRef(0);
  const vocabResultsPendingRef = useRef(null);
  const skipVocabOverlayOnceRef = useRef(false);

  function clearAcceptedRuntimeCaches() {
    acceptedRef.current = [];
    acceptedWordSetRef.current = new Set();
    acceptedScoresRef.current = new Map();
    acceptedBestPtsRef.current = new Map();
    acceptedWordMetaRef.current = new Map();
    dailyAcceptedPathsRef.current = new Map();
  }

  function syncAcceptedRuntimeCaches(
    words,
    { scoreMap = null, bestScoreMap = null, metaMap = null } = {}
  ) {
    const safeWords = Array.isArray(words) ? words : [];
    acceptedRef.current = safeWords;
    acceptedWordSetRef.current = new Set(safeWords);
    acceptedScoresRef.current = scoreMap instanceof Map ? scoreMap : new Map();
    acceptedWordMetaRef.current = metaMap instanceof Map ? metaMap : new Map();
    if (bestScoreMap instanceof Map) {
      acceptedBestPtsRef.current = bestScoreMap;
      return;
    }
    if (scoreMap instanceof Map) {
      acceptedBestPtsRef.current = new Map(scoreMap);
      return;
    }
    acceptedBestPtsRef.current = new Map();
  }

  function registerAcceptedWordRuntime(
    word,
    {
      score = null,
      bestPts = null,
      usedFakeTwins = false,
      fakeTwinsCompletionWord = false,
      fakeTwinsBonusOnly = false,
      rareBonusWord = false,
      rareBonusPoints = 0,
      rarityBucket = "",
      cultureThemeWord = false,
    } = {}
  ) {
    if (!word) return;
    acceptedWordSetRef.current.add(word);
    if (Number.isFinite(score)) {
      acceptedScoresRef.current.set(word, score);
    }
    if (Number.isFinite(bestPts)) {
      acceptedBestPtsRef.current.set(word, bestPts);
    }
    if (usedFakeTwins || rareBonusWord || cultureThemeWord) {
      acceptedWordMetaRef.current.set(word, {
        usedFakeTwins: !!usedFakeTwins,
        fakeTwinsCompletionWord: !!fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!fakeTwinsBonusOnly,
        rareBonusWord: !!rareBonusWord,
        rareBonusPoints: Number(rareBonusPoints) || 0,
        rarityBucket: String(rarityBucket || ""),
        cultureThemeWord: !!cultureThemeWord,
      });
    } else if (!acceptedWordMetaRef.current.has(word)) {
      acceptedWordMetaRef.current.set(word, { usedFakeTwins: false, cultureThemeWord: false });
    }
  }

  function normalizeCultureThemeChallengePayload(payload) {
    const source = payload?.challenge && typeof payload.challenge === "object"
      ? payload.challenge
      : payload;
    const words = Array.isArray(source?.words)
      ? Array.from(new Set(source.words.map((word) => normalizeWord(word)).filter(Boolean)))
      : [];
    if (!words.length) return null;
    return {
      theme: String(source?.theme || ""),
      line: String(source?.line || ""),
      bonus: Math.max(0, Math.trunc(Number(source?.bonus) || 0)),
      words,
      requiredCount: Math.max(
        1,
        Math.min(words.length, Math.trunc(Number(source?.requiredCount) || Math.ceil(words.length * 0.7)))
      ),
      wordSet: new Set(words),
    };
  }

  function markEntriesWithCultureTheme(entries, challenge = cultureThemeChallengeRef.current) {
    const wordSet = challenge?.wordSet instanceof Set ? challenge.wordSet : null;
    if (!wordSet || !wordSet.size) return Array.isArray(entries) ? entries : [];
    return (Array.isArray(entries) ? entries : []).map((entry) => {
      const word = normalizeWord(entry?.word || "");
      return word && wordSet.has(word) ? { ...entry, cultureThemeWord: true } : entry;
    });
  }

  function markSolutionMapWithCultureTheme(map, challenge = cultureThemeChallengeRef.current) {
    if (!(map instanceof Map)) return map;
    const wordSet = challenge?.wordSet instanceof Set ? challenge.wordSet : null;
    if (!wordSet || !wordSet.size) return map;
    for (const word of wordSet) {
      const meta = map.get(word);
      if (meta) {
        map.set(word, { ...meta, cultureThemeWord: true });
      }
    }
    return map;
  }

  function isCurrentCultureThemeWord(word) {
    const norm = normalizeWord(word);
    if (!norm) return false;
    return !!cultureThemeChallengeRef.current?.wordSet?.has(norm);
  }

  function setCultureThemeChallengeRuntime(payload) {
    const normalized = normalizeCultureThemeChallengePayload(payload);
    cultureThemeChallengeRef.current = normalized;
    setCultureThemeChallenge(normalized);
    return normalized;
  }

  function applyCultureThemeChallengeToWordStores(payload) {
    const challenge = setCultureThemeChallengeRuntime(payload);
    if (!challenge) return;
    markSolutionMapWithCultureTheme(solutionsRef.current, challenge);
    serverAllWordsRef.current = markEntriesWithCultureTheme(serverAllWordsRef.current, challenge);
    setAllWords((prev) => markEntriesWithCultureTheme(prev, challenge));
    acceptedRef.current.forEach((word) => {
      if (!challenge.wordSet.has(normalizeWord(word))) return;
      const current = acceptedWordMetaRef.current.get(word) || {};
      acceptedWordMetaRef.current.set(word, { ...current, cultureThemeWord: true });
    });
    submissionStatusRef.current.forEach((meta, word) => {
      if (!challenge.wordSet.has(normalizeWord(word))) return;
      submissionStatusRef.current.set(word, { ...meta, cultureThemeWord: true });
    });
    touchSubmissionState();
  }
  const lastVocabFetchAtRef = useRef(0);
  const chatInputRef = useRef(null);
  const chatBodyLockHeightRef = useRef(0);
  const gameViewportFreezeHeightRef = useRef(0);
  const mobileGameViewportLockRef = useRef({ width: 0, height: 0 });
  const chatDesktopListRef = useRef(null);
  const chatDesktopStickToBottomRef = useRef(true);
  const chatDesktopFocusRestoreUntilRef = useRef(0);
  const chatDesktopFocusWasAtBottomRef = useRef(true);
  const chatDesktopAutoScrollRafRef = useRef(null);
  const chatDesktopAutoScrollTimersRef = useRef([]);
  const pendingDesktopChatFontScaleScrollRef = useRef(false);
  const desktopReactionDetailsCloseTimerRef = useRef(null);
  const suppressChatResizeRef = useRef(false);
  const isChatOpenMobileRef = useRef(false);
  const isChatClosingRef = useRef(isChatClosing);
  const wasMobileLiveLobbyRef = useRef(false);
  const chatInputValueRef = useRef(chatFeature.store.getState().input);
  const isMobileLayoutRef = useRef(isMobileLayout);
  const installIdRef = useRef(installId);
  const isAccountAuthenticatedRef = useRef(isAccountAuthenticated);
  const mobileRoundIntroTokenRef = useRef(0);
  const mobileRoundIntroTimersRef = useRef([]);
  const mobileRoundIntroSuppressRoundStartRef = useRef(false);
  const roundIntroServerWindowRef = useRef({
    roundId: null,
    startsAt: null,
    introMs: 0,
    status: "running",
  });
  const roundIntroStartedForRoundRef = useRef(null);
  const clearTileIntroAnimationFnRef = useRef(() => {});
  const triggerTileIntroAnimationFnRef = useRef(() => 0);
  const isHomeChatOpenRef = useRef(false);
  const lobbyPresenceRef = useRef(new Set());
  const lobbyChatSubscriptionRef = useRef({
    roomId: null,
    subscribed: false,
    inFlight: false,
    connectPending: false,
  });
  const wordHistoryRef = useRef([]);
  const wordHistoryIndexRef = useRef(-1);
  const chatHistoryRef = useRef([]);
  const chatHistoryIndexRef = useRef(-1);
  const solutionsRef = useRef(new Map());
  const serverAllWordsRef = useRef([]);
  const allWordsComputeRef = useRef({ kickoff: null, timer: null, idle: null, key: null });
  const chatLastSentRef = useRef(0);
  const chatReplyTargetRef = useRef(null);
  const chatEditTargetRef = useRef(null);
  const lastKeyboardInsetRef = useRef(0);
  useEffect(() => {
    const syncChatInputRef = () => {
      chatInputValueRef.current = chatFeature.store.getState().input;
    };
    syncChatInputRef();
    return chatFeature.store.subscribe(syncChatInputRef);
  }, [chatFeature]);
  const gobblarToastDelayTimersRef = useRef(new Set());
  const gridShakeTimerRef = useRef(null);
  const gridShakeAnimationRef = useRef(null);
  const submissionTickRafRef = useRef(null);
  const submissionTickPendingRef = useRef(false);
  const submissionTickDeferredByTraceRef = useRef(false);
  const confettiBurstTokenRef = useRef(0);
  const lastGobbleAtRef = useRef(0);
  const praiseLastRef = useRef(0);
  const cultureThemeChallengeRef = useRef(null);
  const invalidLastRef = useRef(0);
  const scoreFlightSequenceRef = useRef(0);
  const lastTargetConfettiRef = useRef(null);
  const targetDefinitionRequestRef = useRef(0);
  const chatScrollLockRef = useRef(0);
  const definitionRequestIdRef = useRef(0);
  const definitionBlinkTimerRef = useRef(null);
  const vaultWordOfDayRequestIdRef = useRef(0);
  const vaultWordOfDayAttemptedRef = useRef(new Set());
  const patchNotesOpeningRef = useRef(false);
  const facebookInviteAttemptedAudienceRef = useRef("");
  const manualRefreshTimerRef = useRef(null);
  const manualDisconnectRef = useRef(false);
  const liveSessionReadyRef = useRef(false);
  const loginInFlightRef = useRef(false);
  const lastLoginPayloadRef = useRef({ nick: "", roomId: "" });
  const bestGridMaxRef = useRef(0);
  const bestGridMaxLenRef = useRef(0);
  const bestWordAnnounceRef = useRef(-1);
  const tournamentCelebrationPlayedRef = useRef(false);
  const audioEngine = useAudioEngine({
    isSfxMuted,
    soundMasterVolume,
    soundMasterVolumeRef,
  });
  const {
    audioCtxRef,
    audioSystemRef,
    audioUnlockedRef,
    audioVoiceRef,
    blackHoleHandleRef,
    blackHoleChebHandleRef,
    blackHoleClavierHandleRef,
    blackHoleSourisLoopRef,
    blackHoleClavierFadeRef,
    blackHoleAuxStopRef,
    blackHoleSyncTokenRef,
    getAudioSystem,
    shouldPlay,
    startVoiceCount,
    playOneShotAudio,
    playSfxHandle,
    playCombinedScoreSound,
    stopBlackHoleAudio,
    requestAudioUnlock,
  } = audioEngine;
  useEffect(() => {
    AssetManager.setAudioSystemProvider(getAudioSystem);
    return () => AssetManager.setAudioSystemProvider(null);
  }, [getAudioSystem]);
  const ambientAudio = useAmbientMusic({
    ambientTracksRef,
    appViewRef,
    breakCountdownRef,
    isAmbientMutedRef,
    isLoggedInRef,
    isSamsungBrowserRef,
    phaseRef,
    resolveAmbientSrc,
    soundMasterVolumeRef,
  });
  const {
    ambientStartPendingRef,
    ambientRetryRef,
    lastAmbientPhaseRef,
    primeAmbientAudio,
    resetAmbientOrder,
    startAmbientMusic,
    stopAmbientMusic,
  } = ambientAudio;
  const gameSounds = useGameSounds({
    appViewRef,
    devMode: DEV_MODE,
    getAudioSystem,
    isDailyPlayRef,
    isLoggedInRef,
    isMobileLayoutRef,
    isSfxMuted,
    mobileRoundIntroCountdownFrom: MOBILE_ROUND_INTRO_COUNTDOWN_FROM,
    nickname,
    nicknameRef,
    phaseRef,
    playCombinedScoreSound,
    playOneShotAudio,
    roundIdRef,
    shouldPlay,
    soundGobbleEnabled,
    soundInvalidErrorEnabled,
    soundTileStepEnabled,
    soundTimerEnabled,
    soundValidationEnabled,
    startVoiceCount,
  });
  const {
    introCountdownTickGuardRef,
    introCountdownPlayedRoundRef,
    roundStartPendingRef,
    roundStartRetryRef,
    maybePlayAnnouncementSound,
    playAlreadyPlayedSound,
    playBonusVoice,
    playCloseSound,
    playCountdownTickSound,
    playDailySpecialLockValidationSound,
    playDoubleGobbleVoice,
    playDuplicateErrorTone,
    playErrorSound,
    playGobbleVoice,
    playInvalidWordSound,
    playRoundStartSound,
    playScoreSound,
    playShortWordSound,
    playSpecialFoundSound,
    playSwipeSound,
    playTickSound,
    playTileStepSound,
    playTournamentCelebrationSound,
    playVocabOverlayClingSound,
    playVocabOverlayTickSound,
    playVocabOverlayZeroSound,
    stopIntroCountdownSound,
    stopRoundEndTickSound,
    stopRoundStartSound,
  } = gameSounds;
  const stopAllActiveAudio = React.useCallback(
    ({ suspendContext = false, immediate = false } = {}) => {
      stopRoundEndTickSound({ fadeMs: immediate ? 0 : 120 });
      stopBlackHoleAudio({ fadeMs: immediate ? 0 : 220 });
      stopAmbientMusic({ fadeMs: immediate ? 0 : 700, keepAlive: false, immediate });
      ambientStartPendingRef.current = false;
      ambientRetryRef.current = false;
      if (!suspendContext) return;
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "running") {
        ctx.suspend().catch(() => {});
      }
    },
    [
      ambientRetryRef,
      ambientStartPendingRef,
      audioCtxRef,
      stopAmbientMusic,
      stopBlackHoleAudio,
      stopRoundEndTickSound,
    ]
  );

  const specialScoreConfig = React.useMemo(() => {
    if (specialRound?.type === FINALE_TYPE) {
      return {
        type: FINALE_TYPE,
        tileBonusMultiplier:
          Number(specialRound?.tileBonusMultiplier) || FINALE_TILE_BONUS_MULTIPLIER,
      };
    }
    if (specialRound?.type === "bonus_letter" && specialRound?.bonusLetter) {
      return {
        bonusLetter: specialRound.bonusLetter,
        bonusLetterScore: specialRound.bonusLetterScore ?? 20,
        disableBonuses: true,
      };
    }
    if (specialRound?.type === MASSIVE_BOGGLE_TYPE) {
      return {
        classicBoggleScoring: true,
        minWordLength: specialRound.minWordLength || 3,
        disableBonuses: true,
      };
    }
    if (
      specialRound?.type === FAKE_TWINS_TYPE ||
      (isDailyPlay && dailyPlayMode === DAILY_FAKE_TWINS_MODE)
    ) {
      return {
        type: FAKE_TWINS_TYPE,
        minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
        disableBonuses: true,
      };
    }
    return null;
  }, [dailyPlayMode, isDailyPlay, specialRound]);
  const bonusLetterKey =
    specialRound?.type === "bonus_letter" ? normalizeLetterKey(specialRound.bonusLetter) : null;
  const bonusLetterScore =
    specialRound?.type === "bonus_letter" ? (specialRound.bonusLetterScore ?? 20) : null;
  const dailyBoardForScore = React.useMemo(() => {
    if (!isSpecial3WordsMode) return board;
    const effectivePlacements = getEffectiveDailySpecialPlacements(
      dailySpecialPlacements,
      dailySpecialDrag,
      Array.isArray(board) ? board.length : 0
    );
    return applyDailySpecialPlacements(board, effectivePlacements);
  }, [isSpecial3WordsMode, board, dailySpecialPlacements, dailySpecialDrag]);
  const dailyWordSlotsScored = React.useMemo(() => {
    if (!isSpecial3WordsMode) return [];
    return (Array.isArray(dailyWordSlots) ? dailyWordSlots : []).map((slot) => {
      const word = String(slot?.word || "").trim();
      const path = Array.isArray(slot?.path) ? slot.path : [];
      if (!word || !path.length) {
        return { ...slot, pts: null };
      }
      return {
        ...slot,
        pts: computeScore(word, path, dailyBoardForScore, specialScoreConfig),
      };
    });
  }, [isSpecial3WordsMode, dailyWordSlots, dailyBoardForScore, specialScoreConfig]);
  const special3LockedStartTileSet = React.useMemo(() => {
    const used = new Set();
    if (!isSpecial3WordsMode) return used;
    dailyWordSlotsScored.forEach((slot) => {
      const startTile = getDailySpecialWordStartTile(slot?.path);
      if (startTile != null) used.add(startTile);
    });
    return used;
  }, [isSpecial3WordsMode, dailyWordSlotsScored]);
  const dailyAcceptedWords = React.useMemo(() => {
    if (!isSpecial3WordsMode) return [];
    return dailyWordSlotsScored
      .map((slot) => String(slot?.word || "").trim())
      .filter(Boolean);
  }, [isSpecial3WordsMode, dailyWordSlotsScored]);
  const dailyTotalScore = React.useMemo(() => {
    if (!isSpecial3WordsMode) return 0;
    return dailyWordSlotsScored.reduce((sum, slot) => sum + (Number(slot?.pts) || 0), 0);
  }, [isSpecial3WordsMode, dailyWordSlotsScored]);

  useEffect(() => {
    if (!isSpecial3WordsMode) return;
    setScore(dailyTotalScore);
    setAccepted((prev) => {
      if (areStringArraysEqual(prev, dailyAcceptedWords)) {
        acceptedRef.current = prev;
        acceptedWordSetRef.current = new Set(prev);
        return prev;
      }
      acceptedRef.current = dailyAcceptedWords;
      acceptedWordSetRef.current = new Set(dailyAcceptedWords);
      return dailyAcceptedWords;
    });
    const scoreMap = new Map();
    dailyWordSlotsScored.forEach((slot) => {
      const word = String(slot?.word || "").trim();
      if (!word || !Number.isFinite(slot?.pts)) return;
      scoreMap.set(word, slot.pts);
    });
    acceptedScoresRef.current = scoreMap;
    acceptedBestPtsRef.current = new Map(scoreMap);
  }, [isSpecial3WordsMode, dailyAcceptedWords, dailyTotalScore, dailyWordSlotsScored]);

  useEffect(() => {
    if (!isSpecial3WordsMode) {
      if (!isDailyPlay) {
        setDailyPlayMode(DAILY_SPECIAL_MODE);
      }
      setDailySpecialPlacements(createDailySpecialPlacements());
      setDailyWordSlots(createDailyWordSlots());
      setDailyActiveSlot(0);
      setDailyInvalidSlot(null);
      setDailySpecialDrag(null);
      dailySpecialDragRef.current = null;
      dailyTictocPlayedRef.current = false;
    }
  }, [isDailyPlay, isSpecial3WordsMode]);

  // drag souris
  const draggingRef = useRef(false);
  const {
    buildGridHitboxMetrics,
    clearGridHitboxCache,
    getTileGeometryByBoardIndex,
    getTileIndexFromPoint,
    gridHitboxRef,
  } = useGridHitboxController({
    activeMetricsRef: dragGridMetricsRef,
    board,
    gridRef,
    gridRotationTurns,
    gridSize,
    isDraggingRef: draggingRef,
    isMobileLayout,
    isUltraCompact,
    phase,
  });
  const {
    dragMoveRafRef,
    dragPendingPointRef,
    flushPendingDragMove,
    lastTouchMoveSampleRef,
    queueDragMove,
    resetDragMovePipeline,
  } = useGridDragPipeline({
    draggingRef,
    getNow: getSamsungDiagNowMs,
    getTileIndexFromPoint,
    onCounter: bumpSamsungDiagCounter,
    onEvent: pushSamsungDiagEvent,
    onTileEnter: handleMouseEnter,
  });
  const mainGridDesktopRef = useRef(null);
  const playColumnRef = useRef(null);
  const desktopGridResizeMaxTrackWidthRef = useRef(Number.POSITIVE_INFINITY);
  const mobileSpecial3TutorialHostRef = useRef(null);
  const mobileSpecial3FirstSlotRef = useRef(null);
  const mobileSpecial3SecondSlotRef = useRef(null);
  const mobileSpecial3GridWrapRef = useRef(null);
  const mobileSpecial3BonusTrayRef = useRef(null);
  const desktopColumnResizeRef = useRef({
    active: false,
    moveHandler: null,
    upHandler: null,
    bodyCursor: "",
    bodyUserSelect: "",
  });
  const desktopColumnOrderHydratedInstallIdRef = useRef("");
  const desktopColumnOrderPersistSignatureRef = useRef("");
  const desktopColumnOrderRef = useRef(desktopColumnOrder);
  const desktopColumnNodeMapRef = useRef(new Map());
  const desktopColumnGhostNodeRef = useRef(null);
  const desktopColumnGhostOffsetRef = useRef({ x: 0, y: 0 });
  const desktopColumnPointerDragRef = useRef({
    active: false,
    pointerId: null,
    pointerTarget: null,
    lastClientX: null,
    lastSwapDirection: null,
    lastSwapClientX: null,
    moveHandler: null,
    upHandler: null,
  });
  const desktopColumnFractionsRef = useRef(desktopColumnFractions);
  const desktopColumnFractionsHydratedInstallIdRef = useRef("");
  const desktopColumnFractionsPersistSignatureRef = useRef("");
  const desktopViewportResizeTimerRef = useRef(null);
  const desktopColumnOrderSafe = React.useMemo(
    () => normalizeDesktopColumnOrder(desktopColumnOrder, desktopColumnBaseDefs),
    [desktopColumnOrder, desktopColumnBaseDefs]
  );
  const desktopColumnDefsByOrder = React.useMemo(
    () =>
      desktopColumnOrderSafe
        .map((id) => desktopColumnBaseDefs.find((entry) => entry.id === id))
        .filter(Boolean),
    [desktopColumnOrderSafe, desktopColumnBaseDefs]
  );
  const desktopColumnDefaultFractions = React.useMemo(
    () => desktopColumnDefsByOrder.map((entry) => entry.defaultFraction),
    [desktopColumnDefsByOrder]
  );
  const desktopColumnMinWidthsPx = React.useMemo(
    () => desktopColumnDefsByOrder.map((entry) => entry.minWidthPx),
    [desktopColumnDefsByOrder]
  );
  const desktopColumnOrderIndexById = React.useMemo(
    () => new Map(desktopColumnOrderSafe.map((id, idx) => [id, idx + 1])),
    [desktopColumnOrderSafe]
  );
  const desktopColumnHandleLabels = React.useMemo(
    () =>
      new Map([
        ["players", "joueurs"],
        ["grid", "grille"],
        ["side", "score et résultats"],
        ["chat", "chat"],
      ]),
    []
  );
  const areDesktopColumnOrdersEqual = React.useCallback((left, right) => {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }, []);
  const areDesktopHandleLayoutsEqual = React.useCallback((left, right) => {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const a = left[index];
      const b = right[index];
      if (
        !a ||
        !b ||
        a.id !== b.id ||
        a.label !== b.label ||
        Math.abs((a.left || 0) - (b.left || 0)) > 0.5 ||
        Math.abs((a.top || 0) - (b.top || 0)) > 0.5
      ) {
        return false;
      }
    }
    return true;
  }, []);
  const setDesktopColumnNode = React.useCallback((columnId, node) => {
    const id = String(columnId || "").trim();
    if (!id) return;
    if (node) desktopColumnNodeMapRef.current.set(id, node);
    else desktopColumnNodeMapRef.current.delete(id);
  }, []);
  const clearDesktopColumnDragState = React.useCallback(() => {
    const dragState = desktopColumnPointerDragRef.current;
    if (dragState.moveHandler) {
      window.removeEventListener("pointermove", dragState.moveHandler);
      dragState.moveHandler = null;
    }
    if (dragState.upHandler) {
      window.removeEventListener("pointerup", dragState.upHandler);
      window.removeEventListener("pointercancel", dragState.upHandler);
      dragState.upHandler = null;
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    dragState.active = false;
    if (
      dragState.pointerTarget &&
      dragState.pointerId != null &&
      typeof dragState.pointerTarget.releasePointerCapture === "function"
    ) {
      try {
        dragState.pointerTarget.releasePointerCapture(dragState.pointerId);
      } catch (_) {}
    }
    dragState.pointerId = null;
    dragState.pointerTarget = null;
    dragState.lastClientX = null;
    dragState.lastSwapDirection = null;
    dragState.lastSwapClientX = null;
    if (desktopColumnGhostNodeRef.current?.parentNode) {
      desktopColumnGhostNodeRef.current.parentNode.removeChild(desktopColumnGhostNodeRef.current);
    }
    desktopColumnGhostNodeRef.current = null;
    setDesktopColumnDragId(null);
  }, []);
  const computeDesktopColumnOrderForPointer = React.useCallback(
    (dragId, clientX, movingLeft) => {
      const sourceId = String(dragId || "").trim();
      if (!sourceId) {
        return normalizeDesktopColumnOrder(desktopColumnOrderRef.current, desktopColumnBaseDefs);
      }
      const current = normalizeDesktopColumnOrder(desktopColumnOrderRef.current, desktopColumnBaseDefs);
      const sourceIndex = current.indexOf(sourceId);
      if (sourceIndex < 0) {
        return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
      }
      const sourceRect = desktopColumnNodeMapRef.current.get(sourceId)?.getBoundingClientRect?.();
      if (
        !sourceRect ||
        !Number.isFinite(sourceRect.left) ||
        !Number.isFinite(sourceRect.right)
      ) {
        return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
      }
      if (movingLeft) {
        if (sourceIndex <= 0) return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
        const previousId = current[sourceIndex - 1];
        const previousRect =
          desktopColumnNodeMapRef.current.get(previousId)?.getBoundingClientRect?.();
        if (
          !previousRect ||
          !Number.isFinite(previousRect.right) ||
          !Number.isFinite(previousRect.left)
        ) {
          return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
        }
        const separatorX = (previousRect.right + sourceRect.left) / 2;
        if (clientX >= separatorX) {
          return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
        }
        const next = [...current];
        next[sourceIndex - 1] = sourceId;
        next[sourceIndex] = previousId;
        return normalizeDesktopColumnOrder(next, desktopColumnBaseDefs);
      }
      if (sourceIndex >= current.length - 1) {
        return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
      }
      const nextId = current[sourceIndex + 1];
      const nextRect = desktopColumnNodeMapRef.current.get(nextId)?.getBoundingClientRect?.();
      if (!nextRect || !Number.isFinite(nextRect.left) || !Number.isFinite(nextRect.right)) {
        return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
      }
      const separatorX = (sourceRect.right + nextRect.left) / 2;
      if (clientX <= separatorX) {
        return normalizeDesktopColumnOrder(current, desktopColumnBaseDefs);
      }
      const next = [...current];
      next[sourceIndex] = nextId;
      next[sourceIndex + 1] = sourceId;
      return normalizeDesktopColumnOrder(next, desktopColumnBaseDefs);
    },
    [desktopColumnBaseDefs]
  );
  const handleDesktopColumnPointerDown = React.useCallback(
    (event, columnId, label) => {
      if (isMobileLayoutRef.current) return;
      if (event.button !== 0) return;
      const id = String(columnId || "").trim();
      if (!id) return;
      const node = desktopColumnNodeMapRef.current.get(id);
      const rect = node?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      clearDesktopColumnDragState();
      if (typeof document !== "undefined" && document.body) {
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      const ghostNode =
        typeof document !== "undefined" ? node.cloneNode(true) : null;
      if (ghostNode instanceof HTMLElement && typeof document !== "undefined") {
        ghostNode.setAttribute("aria-hidden", "true");
        ghostNode.style.position = "fixed";
        ghostNode.style.left = "0";
        ghostNode.style.top = "0";
        ghostNode.style.width = `${rect.width}px`;
        ghostNode.style.height = `${rect.height}px`;
        ghostNode.style.margin = "0";
        ghostNode.style.pointerEvents = "none";
        ghostNode.style.zIndex = "120";
        ghostNode.style.overflow = "hidden";
        ghostNode.style.opacity = "0.92";
        ghostNode.style.boxShadow = "0 24px 54px rgba(15, 23, 42, 0.28)";
        ghostNode.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(1deg)`;
        ghostNode.style.willChange = "transform";
        ghostNode.style.borderColor = "rgba(59,130,246,0.72)";
        ghostNode.style.transition = "none";
        document.body.appendChild(ghostNode);
        desktopColumnGhostNodeRef.current = ghostNode;
      }
      desktopColumnGhostOffsetRef.current = {
        x: Math.max(0, event.clientX - rect.left),
        y: Math.max(0, event.clientY - rect.top),
      };
      setDesktopColumnDragId(id);
      const dragState = desktopColumnPointerDragRef.current;
      dragState.active = true;
      dragState.pointerId = event.pointerId;
      dragState.pointerTarget = event.currentTarget || null;
      if (
        dragState.pointerTarget &&
        dragState.pointerId != null &&
        typeof dragState.pointerTarget.setPointerCapture === "function"
      ) {
        try {
          dragState.pointerTarget.setPointerCapture(dragState.pointerId);
        } catch (_) {}
      }
      dragState.lastClientX = Number.isFinite(event.clientX) ? event.clientX : null;
      dragState.lastSwapDirection = null;
      dragState.lastSwapClientX = null;
      dragState.moveHandler = (moveEvent) => {
        if (!desktopColumnPointerDragRef.current.active) return;
        const clientX = Number(moveEvent.clientX);
        const clientY = Number(moveEvent.clientY);
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
        const previousClientX = desktopColumnPointerDragRef.current.lastClientX;
        const deltaX = Number.isFinite(previousClientX) ? clientX - previousClientX : 0;
        const movingLeft =
          Number.isFinite(previousClientX) && deltaX < -0.5;
        const movingRight =
          Number.isFinite(previousClientX) && deltaX > 0.5;
        desktopColumnPointerDragRef.current.lastClientX = clientX;
        const ghost = desktopColumnGhostNodeRef.current;
        if (ghost) {
          ghost.style.transform = `translate3d(${
            clientX - desktopColumnGhostOffsetRef.current.x
          }px, ${clientY - desktopColumnGhostOffsetRef.current.y}px, 0) rotate(1deg)`;
        }
        if (!movingLeft && !movingRight) return;
        const direction = movingLeft ? "left" : "right";
        const lastSwapDirection = desktopColumnPointerDragRef.current.lastSwapDirection;
        const lastSwapClientX = desktopColumnPointerDragRef.current.lastSwapClientX;
        if (
          lastSwapDirection &&
          lastSwapDirection !== direction &&
          Number.isFinite(lastSwapClientX) &&
          Math.abs(clientX - lastSwapClientX) < 14
        ) {
          return;
        }
        const currentOrder = normalizeDesktopColumnOrder(
          desktopColumnOrderRef.current,
          desktopColumnBaseDefs
        );
        const nextOrder = computeDesktopColumnOrderForPointer(id, clientX, movingLeft);
        const didSwap = !areDesktopColumnOrdersEqual(currentOrder, nextOrder);
        if (didSwap) {
          desktopColumnOrderRef.current = nextOrder;
          desktopColumnPointerDragRef.current.lastSwapDirection = direction;
          desktopColumnPointerDragRef.current.lastSwapClientX = clientX;
        }
        setDesktopColumnOrder((prev) => {
          const normalizedPrev = normalizeDesktopColumnOrder(prev, desktopColumnBaseDefs);
          return areDesktopColumnOrdersEqual(normalizedPrev, nextOrder) ? prev : nextOrder;
        });
      };
      dragState.upHandler = () => {
        clearDesktopColumnDragState();
      };
      window.addEventListener("pointermove", dragState.moveHandler);
      window.addEventListener("pointerup", dragState.upHandler);
      window.addEventListener("pointercancel", dragState.upHandler);
    },
    [
      areDesktopColumnOrdersEqual,
      clearDesktopColumnDragState,
      computeDesktopColumnOrderForPointer,
      desktopColumnBaseDefs,
    ]
  );
  const renderDesktopColumnHandle = React.useCallback(
    (columnId, label) => {
      if (isMobileLayout) return null;
      const isDragging = desktopColumnDragId === columnId;
      return (
        <button
          type="button"
          onPointerDown={(event) => handleDesktopColumnPointerDown(event, columnId, label)}
          className={`pointer-events-auto touch-none inline-flex h-7 min-w-[34px] items-center justify-center rounded-full border px-2 shadow-sm transition ${
            isDragging
              ? "border-blue-500/80 bg-blue-600/85 text-white"
              : darkMode
              ? "border-slate-600/80 bg-slate-900/72 text-slate-100 hover:bg-slate-800/85"
              : "border-slate-300/85 bg-white/72 text-slate-600 hover:bg-white/88"
          }`}
          style={{ touchAction: "none" }}
          aria-label={`Déplacer la colonne ${label}`}
          title={`Déplacer la colonne ${label}`}
        >
          <span className="flex flex-col gap-[3px]" aria-hidden="true">
            <span className="block h-[2px] w-2.5 rounded-full bg-current" />
            <span className="block h-[2px] w-2.5 rounded-full bg-current" />
            <span className="block h-[2px] w-2.5 rounded-full bg-current" />
          </span>
        </button>
      );
    },
    [
      darkMode,
      desktopColumnDragId,
      handleDesktopColumnPointerDown,
      isMobileLayout,
    ]
  );
  useEffect(() => {
    desktopColumnOrderRef.current = desktopColumnOrderSafe;
  }, [desktopColumnOrderSafe]);
  useLayoutEffect(() => {
    if (isMobileLayout || typeof window === "undefined") {
      setDesktopColumnHandleLayout((prev) => (prev.length ? [] : prev));
      return undefined;
    }
    let rafId = 0;
    const measure = () => {
      const next = desktopColumnOrderSafe
        .map((id) => {
          const node = desktopColumnNodeMapRef.current.get(id);
          const rect = node?.getBoundingClientRect?.();
          if (!rect || rect.width <= 0 || rect.height <= 0) return null;
          return {
            id,
            label: desktopColumnHandleLabels.get(id) || id,
            left: rect.left + rect.width / 2,
            top: rect.top,
          };
        })
        .filter(Boolean);
      setDesktopColumnHandleLayout((prev) =>
        areDesktopHandleLayoutsEqual(prev, next) ? prev : next
      );
    };
    const scheduleMeasure = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : null;
    if (mainGridDesktopRef.current) observer?.observe(mainGridDesktopRef.current);
    desktopColumnOrderSafe.forEach((id) => {
      const node = desktopColumnNodeMapRef.current.get(id);
      if (node) observer?.observe(node);
    });
    scheduleMeasure();
    const unsubscribeViewport = layoutFeature.subscribeViewport(scheduleMeasure, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
    ]);
    window.addEventListener("scroll", scheduleMeasure, true);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      unsubscribeViewport();
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [
    areDesktopHandleLayoutsEqual,
    desktopColumnHandleLabels,
    desktopColumnOrderSafe,
    isMobileLayout,
    layoutFeature,
  ]);
  useEffect(() => {
    if (!isMobileLayout) return undefined;
    clearDesktopColumnDragState();
    return undefined;
  }, [clearDesktopColumnDragState, isMobileLayout]);
  useEffect(() => () => clearDesktopColumnDragState(), [clearDesktopColumnDragState]);
  useEffect(() => {
    const key = String(installId || "").trim();
    if (!key) return;
    const persisted = readDesktopColumnOrderForInstall(
      key,
      desktopColumnStorageScope,
      desktopColumnBaseDefs
    );
    const normalized = normalizeDesktopColumnOrder(persisted, desktopColumnBaseDefs);
    desktopColumnOrderPersistSignatureRef.current = JSON.stringify(normalized);
    desktopColumnOrderHydratedInstallIdRef.current = `${desktopColumnStorageScope}:${key}`;
    setDesktopColumnOrder((prev) => {
      const prevNormalized = normalizeDesktopColumnOrder(prev, desktopColumnBaseDefs);
      return JSON.stringify(prevNormalized) === JSON.stringify(normalized) ? prev : normalized;
    });
  }, [installId, desktopColumnBaseDefs, desktopColumnStorageScope]);
  useEffect(() => {
    const key = String(installId || "").trim();
    if (!key) return;
    if (desktopColumnOrderHydratedInstallIdRef.current !== `${desktopColumnStorageScope}:${key}`) {
      return;
    }
    const normalized = normalizeDesktopColumnOrder(desktopColumnOrder, desktopColumnBaseDefs);
    const signature = JSON.stringify(normalized);
    if (desktopColumnOrderPersistSignatureRef.current === signature) return;
    writeDesktopColumnOrderForInstall(
      key,
      desktopColumnStorageScope,
      normalized,
      desktopColumnBaseDefs
    );
    desktopColumnOrderPersistSignatureRef.current = signature;
  }, [installId, desktopColumnOrder, desktopColumnBaseDefs, desktopColumnStorageScope]);
  useEffect(() => {
    desktopColumnFractionsRef.current = desktopColumnFractions;
  }, [desktopColumnFractions]);
  useEffect(() => {
    const key = String(installId || "").trim();
    if (!key) return;
    const persisted = readDesktopColumnFractionsForInstall(
      key,
      desktopColumnStorageScope,
      desktopColumnDefaultFractions
    );
    const normalized = normalizeDesktopColumnFractions(
      persisted,
      desktopColumnDefaultFractions
    );
    desktopColumnFractionsRef.current = normalized;
    desktopColumnFractionsPersistSignatureRef.current = JSON.stringify(normalized);
    desktopColumnFractionsHydratedInstallIdRef.current = `${desktopColumnStorageScope}:${key}`;
    setDesktopColumnFractions((prev) =>
      areDesktopFractionsEqual(prev, normalized) ? prev : normalized
    );
  }, [installId, desktopColumnDefaultFractions, desktopColumnStorageScope]);
  useEffect(() => {
    const key = String(installId || "").trim();
    if (!key) return;
    if (desktopColumnFractionsHydratedInstallIdRef.current !== `${desktopColumnStorageScope}:${key}`) {
      return;
    }
    const normalized = normalizeDesktopColumnFractions(
      desktopColumnFractionsRef.current,
      desktopColumnDefaultFractions
    );
    const signature = JSON.stringify(normalized);
    if (desktopColumnFractionsPersistSignatureRef.current === signature) return;
    writeDesktopColumnFractionsForInstall(
      key,
      desktopColumnStorageScope,
      normalized,
      desktopColumnDefaultFractions
    );
    desktopColumnFractionsPersistSignatureRef.current = signature;
  }, [installId, desktopColumnFractions, desktopColumnDefaultFractions, desktopColumnStorageScope]);
  const [setDesktopGridStageNode, desktopGridStageSize] = useElementSize(!isMobileLayout);

  // Débloque le contexte audio au premier geste utilisateur (mobile/desktop)
  useEffect(() => {
    function unlockAudio(event) {
      const hasCtx = requestAudioUnlock(event);
      primeAmbientAudio();
      if (ambientStartPendingRef.current) {
        ambientStartPendingRef.current = false;
      }
      if (
        roundStartPendingRef.current &&
        phaseRef.current === "playing" &&
        roundIdRef.current === roundStartPendingRef.current
      ) {
        roundStartPendingRef.current = null;
        playRoundStartSound();
      }
      const bc = breakCountdownRef.current;
      const hasCountdown = typeof bc === "number";
      const view = appViewRef.current;
      const canPlayLiveAmbient =
        isLoggedInRef.current &&
        view !== "daily" &&
        view !== "daily_play" &&
        view !== "daily_results";
      const shouldBeAudible =
        canPlayLiveAmbient &&
        phaseRef.current === "results" &&
        !isAmbientMutedRef.current &&
        (!hasCountdown || bc > 14);
      if (shouldBeAudible) {
        const fadeMs =
          hasCountdown && typeof bc === "number"
            ? Math.max(0, Math.round((bc - 10) * 1000))
            : null;
        startAmbientMusic({ silent: false, fadeMs });
      } else {
        stopAmbientMusic({ fadeMs: 220, keepAlive: false });
      }
      const stopListening = () => {
        if (hasCtx && audioCtxRef.current?.state === "running") {
          window.removeEventListener("pointerdown", unlockAudio);
          window.removeEventListener("touchstart", unlockAudio);
          window.removeEventListener("keydown", unlockAudio);
        }
      };
      stopListening();
    }
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const el = playColumnRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const commitGridWidth = (value) => {
      const clamped = clampGridWidth(value);
      if (!clamped) return;
      setGridWidth((prev) => (isSameMeasuredPx(prev, clamped) ? prev : clamped));
    };

    const commitPlayColumnHeight = (value) => {
      const nextHeight = normalizeMeasuredPx(value);
      if (!nextHeight) return;
      setPlayColumnHeight((prev) => (isSameMeasuredPx(prev, nextHeight) ? prev : nextHeight));
    };

    // init immédiat (on enlève un petit padding interne pour coller au contenu)
    const initialWidth = el.getBoundingClientRect().width;
    const initialHeight = el.getBoundingClientRect().height;
    if (initialWidth) {
      commitGridWidth(initialWidth);
    }
    if (initialHeight) commitPlayColumnHeight(initialHeight);

    const observer = new ResizeObserver((entries) => {
      const target = entries[0]?.target;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const w = rect.width; // border-box width (incl. padding)
      const h = rect.height;
      if (w) {
        commitGridWidth(w);
      }
      if (h) commitPlayColumnHeight(h);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobileLayout, appView, phase, isLoggedIn]);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", darkMode);
    // Active aussi la classe Tailwind "dark" pour aligner les variantes sur le toggle interne
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    } catch (_) {}
  }, [darkMode]);

  useEffect(() => {
    const contrastClassNames = ["theme-contrast-soft", "theme-contrast-strong"];
    contrastClassNames.forEach((name) => document.body.classList.remove(name));
    if (uiContrastPreset === "soft") {
      document.body.classList.add("theme-contrast-soft");
    } else if (uiContrastPreset === "strong") {
      document.body.classList.add("theme-contrast-strong");
    }
  }, [uiContrastPreset]);

  useEffect(() => {
    try {
      const body = document.body;
      if (!body) return;
      const preset = FONT_MAP[tileLetterFontPreset] ? tileLetterFontPreset : DEFAULT_THEME_PRESET.font;
      body.setAttribute("data-tile-font-preset", preset);
    } catch (_) {}
  }, [tileLetterFontPreset]);

  useEffect(() => {
    try {
      const rootStyle = document.documentElement?.style;
      if (!rootStyle) return;
      rootStyle.setProperty("--tile-letter-font", tileLetterFontFamily);
      rootStyle.setProperty("--tile-letter-size-scale", String(tileLetterScaleValue));
      rootStyle.setProperty("--tile-letter-color", tileLetterColorValue);
      rootStyle.setProperty("--theme-tile-bg", tileColorValue.bg || "#fdba74");
      rootStyle.setProperty("--theme-tile-border", tileColorValue.border || "#f97316");
    } catch (_) {}
  }, [tileLetterFontFamily, tileLetterScaleValue, tileLetterColorValue, tileColorValue]);

  useEffect(() => {
    try {
      const bodyStyle = document.body?.style;
      if (!bodyStyle) return;
      const bg = backgroundThemeValue?.style || {};
      if (backgroundThemeValue?.native) {
        document.body.classList.remove("theme-custom-bg");
        bodyStyle.removeProperty("--theme-bg-color");
        bodyStyle.removeProperty("--theme-bg-image");
        bodyStyle.removeProperty("--theme-bg-size");
        bodyStyle.removeProperty("--theme-bg-repeat");
        bodyStyle.removeProperty("--theme-bg-position");
        return;
      }
      bodyStyle.setProperty("--theme-bg-color", bg.color || "#dbeafe");
      bodyStyle.setProperty("--theme-bg-image", bg.image || "none");
      bodyStyle.setProperty("--theme-bg-size", bg.size || "auto");
      bodyStyle.setProperty("--theme-bg-repeat", bg.repeat || "repeat");
      bodyStyle.setProperty("--theme-bg-position", bg.position || "center");
      document.body.classList.add("theme-custom-bg");
    } catch (_) {}
  }, [backgroundThemeValue]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      isTouchDeviceRef.current =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      canVibrateRef.current = true;
      setCanVibrate(true);
    } else {
      canVibrateRef.current = false;
      setCanVibrate(false);
    }
  }, []);

  useEffect(
    () =>
      layoutFeature.subscribeViewport(() => {
        if (isChatOpenMobileRef.current) return;
        layoutFeature.refreshViewportMode();
      }, [VIEWPORT_EVENTS.VISUAL_RESIZE]),
    [layoutFeature]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const preventTouchScrollDuringDrag = (event) => {
      if (!draggingRef.current) return;
      if (event?.cancelable) {
        event.preventDefault();
      }
    };
    window.addEventListener("touchmove", preventTouchScrollDuringDrag, {
      passive: false,
    });
    return () => {
      window.removeEventListener("touchmove", preventTouchScrollDuringDrag);
    };
  }, []);

  useEffect(() => {
    if (!isMobileLayout) return;
    if (typeof screen === "undefined") return;
    const orientation = screen.orientation;
    if (!orientation || typeof orientation.lock !== "function") return;
    orientation.lock("portrait").catch(() => {});
  }, [isMobileLayout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldLockViewport =
      isMobileLayout &&
      (phase === "playing" || phase === "results");
    if (!shouldLockViewport) {
      mobileGameViewportLockRef.current = { width: 0, height: 0 };
      return;
    }

    const updateViewportLock = () => {
      if (isChatOpenMobileRef.current || isChatClosingRef.current) return;
      const widthCandidates = [window.innerWidth, document.documentElement?.clientWidth].filter(
        (v) => Number.isFinite(v) && v > 0
      );
      const heightCandidates = [window.innerHeight, document.documentElement?.clientHeight].filter(
        (v) => Number.isFinite(v) && v > 0
      );
      const measuredWidth = widthCandidates.length ? Math.min(...widthCandidates) : 0;
      const measuredHeight = heightCandidates.length ? Math.min(...heightCandidates) : 0;
      if (!(measuredWidth > 0) || !(measuredHeight > 0)) return;

      const prev = mobileGameViewportLockRef.current || { width: 0, height: 0 };
      const prevWidth = Number(prev.width) || 0;
      const prevHeight = Number(prev.height) || 0;
      const widthDelta = Math.abs(measuredWidth - prevWidth);

      // Orientation or major viewport changes: recapture lock from scratch.
      if (!(prevWidth > 0) || !(prevHeight > 0) || widthDelta > 64) {
        mobileGameViewportLockRef.current = {
          width: Math.round(measuredWidth),
          height: Math.round(measuredHeight),
        };
        return;
      }

      // Keep a stable height while Safari toolbars animate (only shrink if needed).
      const nextHeight = Math.min(prevHeight, Math.round(measuredHeight));
      if (nextHeight !== prevHeight) {
        mobileGameViewportLockRef.current = {
          width: prevWidth,
          height: nextHeight,
        };
      }
    };

    updateViewportLock();
    return layoutFeature.subscribeViewport(updateViewportLock, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
      VIEWPORT_EVENTS.ORIENTATION_CHANGE,
      VIEWPORT_EVENTS.VISUAL_RESIZE,
    ]);
  }, [isMobileLayout, isChatOpenMobile, isChatClosing, layoutFeature]);

  useEffect(() => {
    isChatOpenMobileRef.current = isChatOpenMobile;

    if (!isMobileLayout) return;
    if (!isChatOpenMobile) {
      setActiveArea("game");
      return;
    }

    if (chatTab !== "system") {
      setMobileChatUnreadCount(0);
      setMobileChatBotUnreadCount(0);
    }
    setActiveArea("chat");
  }, [isChatOpenMobile, isMobileLayout, chatTab]);

  useLayoutEffect(() => {
    const isMobileLiveLobby =
      isMobileLayout && isLoggedIn && appView === "live" && phase === "lobby";
    const wasMobileLiveLobby = wasMobileLiveLobbyRef.current;
    wasMobileLiveLobbyRef.current = isMobileLiveLobby;

    if (isMobileLiveLobby) {
      // Le carnet du salon remplace le tiroir : on neutralise tout ancien état
      // d'ouverture sans toucher au champ actuellement utilisé dans le carnet.
      resetMobileChatPanelImmediately({ preserveInputFocus: true });
      return undefined;
    }

    if (
      !wasMobileLiveLobby ||
      !isMobileLayout ||
      !isLoggedIn ||
      appView !== "live"
    ) {
      return undefined;
    }

    if (!hasActiveChatDraft(chatInputValueRef.current)) {
      resetMobileChatPanelImmediately();
      return undefined;
    }

    // Un vrai brouillon était en cours dans le carnet : le tiroir prend le
    // relais et rend le focus au champ pour ne pas interrompre la rédaction.
    openChatPanel();
    if (typeof window === "undefined") return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      try {
        chatInputRef.current?.focus?.({ preventScroll: true });
      } catch (_) {
        try {
          chatInputRef.current?.focus?.();
        } catch (_) {}
      }
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [appView, isLoggedIn, isMobileLayout, phase]);

  useEffect(() => {
    isHomeChatOpenRef.current = isHomeChatOpen;
    if (isHomeChatOpen && chatTab !== "system") {
      setHomeChatUnreadCount(0);
      setHomeChatBotUnreadCount(0);
    }
  }, [isHomeChatOpen, chatTab]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (chatTab === "system") return;
    if (isMobileLayout && (!isChatOpenMobile || isChatClosing)) return;
    setMobileChatUnreadCount(0);
    setMobileChatBotUnreadCount(0);
  }, [isLoggedIn, chatTab, isMobileLayout, isChatOpenMobile, isChatClosing]);

  useEffect(() => {
    if (isLoggedIn) return;
    if (chatTab === "system") return;
    const messagesVisible = isMobileLayout
      ? isChatOpenMobile && !isChatClosing
      : isHomeChatOpen;
    if (!messagesVisible) return;
    setHomeChatUnreadCount(0);
    setHomeChatBotUnreadCount(0);
  }, [
    isLoggedIn,
    chatTab,
    isMobileLayout,
    isHomeChatOpen,
    isChatOpenMobile,
    isChatClosing,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isChatOpenMobile) {
      chatBaselineHeightRef.current = 0;
      setChatViewportHeight(0);
      setChatKeyboardInsetPx(0);
      return;
    }

    const vv = window.visualViewport;

    const baseHeight =
      chatBodyLockHeightRef.current ||
      chatBaselineHeightRef.current ||
      Math.round(window.innerHeight || vv?.height || 0);
    chatBaselineHeightRef.current = baseHeight;
    setChatViewportHeight((prev) => (prev === baseHeight ? prev : baseHeight));

    const updateInset = () => {
      if (suppressChatResizeRef.current) return;
      const nextHeight =
        chatBodyLockHeightRef.current ||
        chatBaselineHeightRef.current ||
        Math.round(window.innerHeight || vv?.height || 0);
      if (nextHeight > 0) {
        chatBaselineHeightRef.current = nextHeight;
        setChatViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
      const nextInset =
        vv && Number.isFinite(vv.height)
          ? Math.max(
              0,
              Math.round(
                nextHeight -
                  vv.height -
                  (Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0)
              )
            )
          : 0;
      if (nextInset > 0) {
        lastKeyboardInsetRef.current = nextInset;
      } else {
        lastKeyboardInsetRef.current = 0;
      }
      if (!chatDrawerCalibrationRef.current && nextHeight > 0) {
        const keyboardThresholdPx = Math.max(
          CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
          Math.round(nextHeight * 0.12)
        );
        if (nextInset >= keyboardThresholdPx) {
          const topInsetPx = isFullscreen ? mobileHeaderOffsetPx : 0;
          const ceilingPx = Math.max(
            220,
            Math.round(nextHeight - topInsetPx - CHAT_DRAWER_TOP_GAP_PX)
          );
          const observedHeightPx = clampValue(
            Math.round(nextHeight - nextInset - topInsetPx),
            Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, ceilingPx),
            Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, ceilingPx)
          );
          const nextCalibration = {
            ratio: clampValue(
              observedHeightPx / nextHeight,
              CHAT_DRAWER_CALIBRATION_MIN_RATIO,
              CHAT_DRAWER_CALIBRATION_MAX_RATIO
            ),
            heightPx: observedHeightPx,
            orientation: getChatDrawerOrientationKey(),
          };
          chatDrawerCalibrationRef.current = nextCalibration;
          writeStoredChatDrawerCalibration(nextCalibration);
        }
      }
      setChatKeyboardInsetPx((prev) => (prev === nextInset ? prev : nextInset));
    };

    updateInset();
    const unsubscribeViewport = layoutFeature.subscribeViewport(updateInset, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
      VIEWPORT_EVENTS.VISUAL_RESIZE,
      VIEWPORT_EVENTS.VISUAL_SCROLL,
    ]);
    window.addEventListener("focusin", updateInset, true);
    window.addEventListener("focusout", updateInset, true);
    return () => {
      unsubscribeViewport();
      window.removeEventListener("focusin", updateInset, true);
      window.removeEventListener("focusout", updateInset, true);
    };
  }, [isChatOpenMobile, isFullscreen, layoutFeature, mobileHeaderOffsetPx]);

  useEffect(() => {
    if (!isChatRulesOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsChatRulesOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const raf = window.requestAnimationFrame(() => {
      chatRulesConfirmRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(raf);
    };
  }, [isChatRulesOpen]);

  useEffect(() => {
    if (!userMenu.open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeUserMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenu.open]);

  useEffect(() => {
    if (!definitionModal.open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDefinition();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [definitionModal.open]);

  useEffect(() => {
    if (!definitionModal.open) return;
    if (appView !== "live") return;
    if (phase === "lobby" && !isWeeklyOpen) closeDefinition();
  }, [definitionModal.open, phase, roundId, isWeeklyOpen, appView]);
  useEffect(() => {
    if (!roundPlayerModal.open) return;
    if (phase !== "results") {
      closeRoundPlayerModal({ withSound: false });
    }
  }, [roundPlayerModal.open, phase]);

  const clearDesktopChatAutoScroll = React.useCallback(() => {
    if (typeof window !== "undefined" && chatDesktopAutoScrollRafRef.current != null) {
      window.cancelAnimationFrame(chatDesktopAutoScrollRafRef.current);
    }
    chatDesktopAutoScrollRafRef.current = null;
    chatDesktopAutoScrollTimersRef.current.forEach((id) => clearTimeout(id));
    chatDesktopAutoScrollTimersRef.current = [];
  }, []);

  const isDesktopChatNearBottom = React.useCallback((listEl) => {
    if (!listEl) return true;
    const remaining = listEl.scrollHeight - listEl.clientHeight - listEl.scrollTop;
    return remaining <= DESKTOP_CHAT_BOTTOM_EPSILON_PX;
  }, []);

  const handleDesktopChatScroll = React.useCallback(
    (event) => {
      const listEl = event?.currentTarget || chatDesktopListRef.current;
      if (
        typeof Date !== "undefined" &&
        Date.now() < chatDesktopFocusRestoreUntilRef.current &&
        !isDesktopChatNearBottom(listEl)
      ) {
        return;
      }
      chatDesktopStickToBottomRef.current = isDesktopChatNearBottom(listEl);
    },
    [isDesktopChatNearBottom]
  );

  const scheduleDesktopChatAutoScroll = React.useCallback((options = {}) => {
    if (typeof window === "undefined") return;
    if (isMobileLayoutRef.current) return;
    const force = !!options?.force;
    if (!force && !chatDesktopStickToBottomRef.current) return;
    const scrollToBottom = () => {
      const listEl = chatDesktopListRef.current;
      if (!listEl) return;
      const target = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
      listEl.scrollTop = target;
      chatDesktopStickToBottomRef.current = true;
    };
    clearDesktopChatAutoScroll();
    scrollToBottom();
    const raf1 = window.requestAnimationFrame(() => {
      scrollToBottom();
      const raf2 = window.requestAnimationFrame(scrollToBottom);
      chatDesktopAutoScrollRafRef.current = raf2;
    });
    chatDesktopAutoScrollRafRef.current = raf1;
    [80, 180, 320].forEach((delayMs) => {
      const id = setTimeout(scrollToBottom, delayMs);
      chatDesktopAutoScrollTimersRef.current.push(id);
    });
  }, [clearDesktopChatAutoScroll]);

  const prepareDesktopChatInputFocus = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (isMobileLayoutRef.current) return;
    const listEl = chatDesktopListRef.current;
    chatDesktopFocusWasAtBottomRef.current =
      chatDesktopStickToBottomRef.current || isDesktopChatNearBottom(listEl);
  }, [isDesktopChatNearBottom]);

  const restoreDesktopChatAfterInputFocus = React.useCallback(
    (wasAtBottom = chatDesktopFocusWasAtBottomRef.current) => {
      if (typeof window === "undefined") return;
      if (isMobileLayoutRef.current) return;
      if (!wasAtBottom) return;
      chatDesktopFocusRestoreUntilRef.current = Date.now() + 450;
      chatDesktopStickToBottomRef.current = true;
      scheduleDesktopChatAutoScroll({ force: true });
    },
    [scheduleDesktopChatAutoScroll]
  );

  const handleChatDesktopFontScaleChange = React.useCallback((nextValue) => {
    pendingDesktopChatFontScaleScrollRef.current = true;
    chatDesktopStickToBottomRef.current = true;
    setChatDesktopFontScale(
      normalizeChatDesktopFontScale(nextValue, CHAT_DESKTOP_FONT_SCALE_DEFAULT)
    );
  }, []);

  useEffect(() => {
    if (isMobileLayout) return;
    if (!pendingDesktopChatFontScaleScrollRef.current) return;
    pendingDesktopChatFontScaleScrollRef.current = false;
    scheduleDesktopChatAutoScroll({ force: true });
  }, [chatDesktopFontScale, isMobileLayout, scheduleDesktopChatAutoScroll]);

  const setChatDesktopListNode = React.useCallback(
    (node) => {
      chatDesktopListRef.current = node;
      if (!node || typeof window === "undefined" || isMobileLayoutRef.current) return;
      chatDesktopStickToBottomRef.current = true;
      window.requestAnimationFrame(() => {
        if (chatDesktopListRef.current !== node) return;
        scheduleDesktopChatAutoScroll({ force: true });
      });
    },
    [scheduleDesktopChatAutoScroll]
  );

  const setDesktopChatColumnNode = React.useCallback(
    (node) => setDesktopColumnNode("chat", node),
    [setDesktopColumnNode]
  );

  useEffect(() => clearDesktopChatAutoScroll, [clearDesktopChatAutoScroll]);
  useEffect(
    () => () => {
      if (desktopReactionDetailsCloseTimerRef.current) {
        clearTimeout(desktopReactionDetailsCloseTimerRef.current);
        desktopReactionDetailsCloseTimerRef.current = null;
      }
      clearMobileChatReactionToasts();
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobileLayout) return;
    let previousMessages = null;
    const handleMessagesChanged = () => {
      const state = chatFeature.store.getState();
      if (state.messages === previousMessages) return;
      previousMessages = state.messages;
      const el = chatDesktopListRef.current;
      if (!el) return;
      chatDesktopStickToBottomRef.current = isDesktopChatNearBottom(el);
      const safeTab = state.tab === "system" ? "system" : "messages";
      const blockedSet = new Set(state.blockedInstallIds || []);
      const hasActiveMessage = (state.messages || []).some((msg) => {
        const authorInstallId =
          typeof msg?.installId === "string" ? msg.installId : "";
        if (authorInstallId && blockedSet.has(authorInstallId)) return false;
        const isSystem = isSystemChatMessage(msg);
        return safeTab === "system" ? isSystem : !isSystem;
      });
      if (hasActiveMessage) scheduleDesktopChatAutoScroll();
    };
    handleMessagesChanged();
    return chatFeature.store.subscribe(handleMessagesChanged);
  }, [
    chatFeature,
    isMobileLayout,
    isDesktopChatNearBottom,
    scheduleDesktopChatAutoScroll,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobileLayout) return;
    if (isDailyPlay) return;
    const listEl = chatDesktopListRef.current;
    if (!listEl) return;
    scheduleDesktopChatAutoScroll({ force: true });
  }, [
    isMobileLayout,
    isDailyPlay,
    isLoggedIn,
    phase,
    appView,
    scheduleDesktopChatAutoScroll,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobileLayout) return;
    chatDesktopStickToBottomRef.current = true;
    scheduleDesktopChatAutoScroll({ force: true });
  }, [isMobileLayout, chatTab, scheduleDesktopChatAutoScroll]);

  useEffect(() => {
    if (!isMobileLayout) return;
  }, [isMobileLayout]);

  // Safe-area top probe: avoids hardcoded fullscreen offsets.
  const measureSafeAreaTopPx = React.useCallback(() => {
    if (typeof window === "undefined") return 0;
    const probe = safeAreaTopProbeRef.current;
    if (!probe) return 0;
    const paddingTop = window.getComputedStyle(probe).paddingTop || "0";
    const value = parseFloat(paddingTop);
    return Number.isFinite(value) ? value : 0;
  }, []);

  const getSafeTopPx = React.useCallback(
    (forceFullscreen = false) => {
      const shouldUse = forceFullscreen || isFullscreen;
      if (!shouldUse) return 0;
      const measured = measureSafeAreaTopPx();
      if (measured > 0) return Math.round(measured);
      if (typeof window === "undefined") return 0;
      // Fallback when env(safe-area-inset-top) reports 0 in fullscreen.
      return Math.round(Math.min(48, Math.max(0, window.innerHeight * 0.03)));
    },
    [isFullscreen, measureSafeAreaTopPx]
  );

  const getHeaderOffsetPx = React.useCallback(() => {
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return 0;
    const rect = headerEl.getBoundingClientRect?.();
    const rectBottom =
      rect && Number.isFinite(rect.bottom) ? Math.round(rect.bottom) : 0;
    if (rectBottom > 0) return rectBottom;
    const height = Math.round(headerEl.offsetHeight || 0);
    return height + getSafeTopPx();
  }, [getSafeTopPx]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileLayout || !(phase === "playing" || phase === "results")) return;

    let rafId = null;
    let timeoutId = null;

    const commitMobileLayoutSizing = (nextLayout) => {
      if (!nextLayout) return;
      setMobileLayoutSizing((prev) =>
        areMobileLayoutSizingsEqual(prev, nextLayout) ? prev : nextLayout
      );
    };

    const computeMobileLayoutNow = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (isChatOpenMobileRef.current) return;
      const lockedGameViewportHeight =
        Number(mobileGameViewportLockRef.current?.height) || 0;
      const lockedGameViewportWidth =
        Number(mobileGameViewportLockRef.current?.width) || 0;
      const viewportHeightCandidates = [
        lockedGameViewportHeight,
        window.innerHeight,
        document.documentElement?.clientHeight,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const viewportHeight = viewportHeightCandidates.length
        ? Math.min(...viewportHeightCandidates)
        : 0;

      const viewportWidthCandidates = [
        lockedGameViewportWidth,
        window.innerWidth,
        document.documentElement?.clientWidth,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const viewportWidth = viewportWidthCandidates.length
        ? Math.min(...viewportWidthCandidates)
        : 0;
      if (viewportHeight < 120 || viewportWidth < 120) return;
      if (!safeAreaProbeRef.current && typeof document !== "undefined") {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.left = "0";
        probe.style.top = "0";
        probe.style.height = "0";
        probe.style.paddingBottom = "env(safe-area-inset-bottom)";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        document.body.appendChild(probe);
        safeAreaProbeRef.current = probe;
      }
      if (!safeAreaTopProbeRef.current && typeof document !== "undefined") {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.left = "0";
        probe.style.top = "0";
        probe.style.height = "0";
        probe.style.paddingTop = "env(safe-area-inset-top)";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        document.body.appendChild(probe);
        safeAreaTopProbeRef.current = probe;
      }

      const headerOffsetPx = getHeaderOffsetPx();
      if (headerOffsetPx > 0) {
        setMobileHeaderOffsetPx((prev) =>
          prev === headerOffsetPx ? prev : headerOffsetPx
        );
      }
      const headerHeightForBody = headerOffsetPx;
      const helpEl = mobileHelpRef.current;
      const helpHeight = helpEl?.offsetHeight || 0;
      const helpMargins = helpEl
        ? (() => {
            const styles = window.getComputedStyle(helpEl);
            const mt = parseFloat(styles.marginTop || "0") || 0;
            const mb = parseFloat(styles.marginBottom || "0") || 0;
            return mt + mb;
          })()
        : 0;
      const extraTopHeight = helpHeight + helpMargins;
      const safeBottomPx = 5;
      const safeAreaBottomPx =
        isFullscreen && safeAreaProbeRef.current && typeof window !== "undefined"
          ? parseFloat(
              window.getComputedStyle(safeAreaProbeRef.current).paddingBottom || "0"
            ) || 0
          : 0;
      const bodyHeight = Math.max(
        0,
        viewportHeight -
          headerHeightForBody -
          extraTopHeight -
          safeBottomPx -
          safeAreaBottomPx
      );
      if (bodyHeight < 120) return;

      // marges/gaps principaux (px-3, pb-2 + espacements entre blocs)
      const verticalPadding = 4 + 8;
      const layoutGaps = 8 + 4; // gap-1 entre blocs (2 x 4px) + gap-1 entre grille/flux (4px)
      const availableHeight = Math.max(
        0,
        bodyHeight - verticalPadding - layoutGaps
      );
      const blocksBudget = availableHeight > 0 ? availableHeight : bodyHeight;
      const availableWidth = Math.max(
        0,
        Math.min(viewportWidth - 24, MOBILE_GRID_MAX_WIDTH)
      ); // px-3 (12px) de chaque c?t?) + limite max mobile

      const baseFontSize =
        parseFloat(
          window.getComputedStyle(document.documentElement).fontSize || "16"
        ) || 16;
      const liveFeedRowPx = Math.max(12, Math.round(baseFontSize * 1.05));
      const liveFeedHeaderPx = Math.max(12, Math.round(baseFontSize * 1.05));
      const liveFeedGapPx = 4;
      const liveFeedPaddingPx = 16;
      const liveFeedMinHeight =
        liveFeedPaddingPx +
        liveFeedHeaderPx +
        liveFeedGapPx +
        liveFeedRowPx * 3 +
        liveFeedGapPx * 2;
      const minRanking = 120;
      const maxRanking = 150;
      const minPreview = 36;
      let rankingTarget = clampValue(
        Math.round(Math.max(baseFontSize * 7, bodyHeight * 0.26)),
        minRanking,
        maxRanking
      );
      let previewTarget = clampValue(
        Math.round(Math.max(baseFontSize * 2.6, bodyHeight * 0.08)),
        minPreview,
        68
      );
      let requiredBelowGrid = rankingTarget + previewTarget + liveFeedMinHeight;
      let maxGridFromHeight = Math.max(100, blocksBudget - requiredBelowGrid);

      if (maxGridFromHeight < availableWidth) {
        let needed = Math.max(0, availableWidth - maxGridFromHeight);
        if (needed > 0) {
          const previewShrink = Math.min(needed, previewTarget - minPreview);
          previewTarget -= previewShrink;
          needed -= previewShrink;
        }
        if (needed > 0) {
          const rankingShrink = Math.min(needed, rankingTarget - minRanking);
          rankingTarget -= rankingShrink;
          needed -= rankingShrink;
        }
        requiredBelowGrid = rankingTarget + previewTarget;
        maxGridFromHeight = Math.max(100, blocksBudget - requiredBelowGrid);
      }

      const gridSide = Math.max(100, Math.min(availableWidth, maxGridFromHeight));

      const remaining = Math.max(0, blocksBudget - gridSide);

      if (remaining <= 0) {
        commitMobileLayoutSizing({
          viewportWidth,
          viewportHeight,
          gridSide,
          rankingHeight: rankingTarget,
          wordPreviewHeight: previewTarget,
          liveFeedHeight: 0,
          liveFeedMinHeight,
          bodyHeight,
        });
        return;
      }

      const reservedLiveFeed = Math.min(remaining, liveFeedMinHeight);
      const remainingAfterFeed = Math.max(0, remaining - reservedLiveFeed);
      let rankingHeight = 0;
      let wordPreviewHeight = 0;
      if (remainingAfterFeed > 0) {
        const previewBias = 1.25;
        const totalTarget = rankingTarget + previewTarget;
        if (remainingAfterFeed >= totalTarget) {
          rankingHeight = rankingTarget;
          wordPreviewHeight = previewTarget;
        } else {
          const weightedTotal = rankingTarget + previewTarget * previewBias;
          const previewShare =
            (previewTarget * previewBias) / Math.max(1, weightedTotal);
          const previewRaw = remainingAfterFeed * previewShare;
          wordPreviewHeight = Math.max(
            0,
            Math.min(previewTarget, Math.floor(previewRaw))
          );
          rankingHeight = Math.max(0, remainingAfterFeed - wordPreviewHeight);
        }
      }
      const leftover = Math.max(
        0,
        remaining - reservedLiveFeed - rankingHeight - wordPreviewHeight
      );
      const liveFeedHeight = reservedLiveFeed + leftover;

      commitMobileLayoutSizing({
        viewportWidth,
        viewportHeight,
        gridSide: gridSide || 0,
        rankingHeight: rankingHeight || 0,
        wordPreviewHeight: wordPreviewHeight || 0,
        liveFeedHeight: liveFeedHeight || 0,
        liveFeedMinHeight,
        bodyHeight,
      });
    };

    const scheduleComputeMobileLayout = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(computeMobileLayoutNow);

      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(computeMobileLayoutNow, 180);
    };

    scheduleComputeMobileLayout();
    const unsubscribeViewport = layoutFeature.subscribeViewport(
      scheduleComputeMobileLayout,
      [
        VIEWPORT_EVENTS.WINDOW_RESIZE,
        VIEWPORT_EVENTS.ORIENTATION_CHANGE,
        VIEWPORT_EVENTS.PAGE_SHOW,
        VIEWPORT_EVENTS.VISUAL_RESIZE,
      ]
    );
    document?.addEventListener?.("visibilitychange", scheduleComputeMobileLayout);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
      unsubscribeViewport();
      document?.removeEventListener?.("visibilitychange", scheduleComputeMobileLayout);
      if (safeAreaProbeRef.current && safeAreaProbeRef.current.parentNode) {
        safeAreaProbeRef.current.parentNode.removeChild(safeAreaProbeRef.current);
        safeAreaProbeRef.current = null;
      }
      if (safeAreaTopProbeRef.current && safeAreaTopProbeRef.current.parentNode) {
        safeAreaTopProbeRef.current.parentNode.removeChild(safeAreaTopProbeRef.current);
        safeAreaTopProbeRef.current = null;
      }
    };
  }, [
    areMobileLayoutSizingsEqual,
    isMobileLayout,
    phase,
    gridSize,
    showHelp,
    isFullscreen,
    getHeaderOffsetPx,
    layoutFeature,
  ]);

  useEffect(() => {
    if (!isMobileLayout) return;
    if (typeof window === "undefined") return;
    if (typeof ResizeObserver === "undefined") return;
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return;

    const updateHeight = () => {
      const nextOffset = getHeaderOffsetPx();
      if (!nextOffset) return;
      setMobileHeaderOffsetPx((prev) =>
        prev === nextOffset ? prev : nextOffset
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(headerEl);
    const unsubscribeViewport = layoutFeature.subscribeViewport(updateHeight, [
      VIEWPORT_EVENTS.VISUAL_RESIZE,
    ]);
    return () => {
      observer.disconnect();
      unsubscribeViewport();
    };
  }, [isMobileLayout, isFullscreen, getHeaderOffsetPx, layoutFeature]);

  useLayoutEffect(() => {
    if (!isMobileLayout) return;
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return;
    const nextOffset = getHeaderOffsetPx();
    if (!nextOffset) return;
    setMobileHeaderOffsetPx((prev) => (prev === nextOffset ? prev : nextOffset));
  }, [isMobileLayout, isFullscreen, getHeaderOffsetPx]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldPin =
      isMobileLayout && (phase === "playing" || phase === "results");
    if (!shouldPin) return;
    window.scrollTo(0, 0);
  }, [isMobileLayout, phase]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const shouldLock =
      (isMobileLayout && (phase === "playing" || phase === "results")) ||
      isChatOpenMobile ||
      isChatClosing;
    if (!shouldLock) return;

    const previousOverflow = document.body.style.overflow;
    const previousHeight = document.body.style.height;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousLeft = document.body.style.left;
    const previousRight = document.body.style.right;
    const previousTouchAction = document.body.style.touchAction;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlHeight = document.documentElement.style.height;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const previousHtmlPosition = document.documentElement.style.position;
    const previousHtmlWidth = document.documentElement.style.width;
    const previousHtmlLeft = document.documentElement.style.left;
    const previousHtmlRight = document.documentElement.style.right;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.documentElement.style.position = "fixed";
    document.documentElement.style.width = "100%";
    document.documentElement.style.left = "0";
    document.documentElement.style.right = "0";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.touchAction = "none";

    if (!chatScrollLockRef.current) {
      chatScrollLockRef.current =
        typeof window !== "undefined" ? window.scrollY || 0 : 0;
    }
    document.body.style.top = `-${chatScrollLockRef.current}px`;
    window.scrollTo(0, 0);

    const applyLockedHeight = () => {
      const frozen =
        (isChatOpenMobileRef.current || isChatClosing) &&
        gameViewportFreezeHeightRef.current > 0
          ? gameViewportFreezeHeightRef.current
          : 0;
      const lockedGameHeight =
        Number(mobileGameViewportLockRef.current?.height) || 0;

      // Quand le chat est ouvert, on fige le fond (layout viewport) et on laisse
      // uniquement le tiroir chat s'adapter au clavier via visualViewport.
      const candidates = frozen
        ? [frozen]
        : [lockedGameHeight, window.innerHeight, document.documentElement?.clientHeight];

      const filtered = candidates.filter((v) => Number.isFinite(v) && v > 0);
      const h = filtered.length ? Math.min(...filtered) : 0;
      if (h > 0) {
        const px = `${Math.round(h)}px`;
        document.body.style.height = px;
        document.documentElement.style.height = px;
      }
    };

    applyLockedHeight();
    const unsubscribeViewport = layoutFeature.subscribeViewport(applyLockedHeight, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
      VIEWPORT_EVENTS.VISUAL_RESIZE,
    ]);

    return () => {
      unsubscribeViewport();
      document.body.style.overflow = previousOverflow;
      document.body.style.height = previousHeight;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.body.style.left = previousLeft;
      document.body.style.right = previousRight;
      document.body.style.touchAction = previousTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.height = previousHtmlHeight;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      document.documentElement.style.position = previousHtmlPosition;
      document.documentElement.style.width = previousHtmlWidth;
      document.documentElement.style.left = previousHtmlLeft;
      document.documentElement.style.right = previousHtmlRight;
      document.body.style.overscrollBehavior = previousOverscroll;
      if (chatScrollLockRef.current) {
        window.scrollTo(0, chatScrollLockRef.current);
        chatScrollLockRef.current = 0;
      }
    };
  }, [
    isMobileLayout,
    phase === "playing" || phase === "results",
    isChatOpenMobile,
    isChatClosing,
    layoutFeature,
  ]);

  useEffect(() => {
    if (phase !== "lobby") return;
    const nextSize = getGridSizeForRoom(roomId);
    setGridSize(nextSize);
    setBoard(Array(nextSize * nextSize).fill({ letter: "?", bonus: null }));
  }, [roomId, phase]);

  async function handleInstallApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      const res = await installPrompt.userChoice;
      if (res && res.outcome === "accepted") {
        setInstallMessage("Ajout\u00e9 \u00e0 l'\u00e9cran d'accueil");
      } else {
        setInstallMessage("Ajout annul\u00e9");
      }
    } catch (_) {
      setInstallMessage("Impossible de proposer l'ajout");
    } finally {
      setInstallPrompt(null);
      setTimeout(() => setInstallMessage(""), 2500);
    }
  }

  function ensureTournamentBaseline(tournamentPayload, { captureRanking = false } = {}) {
    const tournamentId = tournamentPayload?.id || null;
    if (!tournamentId) return;
    let baseline = tournamentBaselineRef.current;
    if (baseline.id !== tournamentId) {
      tournamentBaselineRef.current = {
        id: tournamentId,
        weeklyStats: weeklyStatsSnapshotRef.current || null,
        rankingMap: null,
        rankingRound: null,
      };
      baseline = tournamentBaselineRef.current;
    }
    if (!baseline.weeklyStats && weeklyStatsSnapshotRef.current) {
      baseline.weeklyStats = weeklyStatsSnapshotRef.current;
    }
    if (
      captureRanking &&
      !baseline.rankingMap &&
      Array.isArray(tournamentPayload?.ranking) &&
      tournamentPayload.ranking.length
    ) {
      const visibleRanking = tournamentPayload.ranking.filter(
        (entry) => getTournamentPoints(entry) > 0
      );
      const rankMap = new Map();
      visibleRanking.forEach((entry, idx) => {
        if (!entry?.nick) return;
        const posNow = idx + 1;
        rankMap.set(entry.nick, posNow);
      });
      baseline.rankingMap = rankMap;
      baseline.rankingRound = Number.isFinite(tournamentPayload?.round)
        ? tournamentPayload.round
        : null;
    }
  }

  function getTournamentPoints(entry) {
    if (!entry) return 0;
    if (Number.isFinite(entry.points)) return entry.points;
    if (Number.isFinite(entry.score)) return entry.score;
    return 0;
  }

  const clearMobileRoundIntroTimers = React.useCallback(() => {
    mobileRoundIntroTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    mobileRoundIntroTimersRef.current = [];
  }, []);

  const { startMobileRoundIntro, stopMobileRoundIntro } = useMobileRoundIntro(
    clearMobileRoundIntroTimers,
    clearTileIntroAnimationFnRef,
    createMonotonicDeadline,
    flushSync,
    getDeadlineRemainingSeconds,
    getDelayUntilDeadlineWindow,
    getMonotonicNowMs,
    getNextDeadlineTickDelay,
    getNowServerMs,
    getSpecialRoundDescription,
    getSpecialRoundDisplayLabel,
    inputLockedRef,
    introCountdownTickGuardRef,
    isMobileLayoutRef,
    MOBILE_ROUND_INTRO_COUNTDOWN_FROM,
    MOBILE_ROUND_INTRO_COUNTDOWN_TOTAL_MS,
    MOBILE_ROUND_INTRO_GO_LABEL,
    MOBILE_ROUND_INTRO_GO_TOTAL_MS,
    MOBILE_ROUND_INTRO_INTRO_FADE_IN_MS,
    MOBILE_ROUND_INTRO_TILE_HOLD_MS,
    MOBILE_ROUND_INTRO_TITLE_FADE_MS,
    MOBILE_ROUND_INTRO_TITLE_HOLD_MS,
    mobileRoundIntroSuppressRoundStartRef,
    mobileRoundIntroTimersRef,
    mobileRoundIntroTokenRef,
    playCountdownTickSound,
    playRoundStartSound,
    roundId,
    roundIdRef,
    roundIntroServerWindowRef,
    roundIntroStartedForRoundRef,
    roundStartSoundRef,
    setInputLocked,
    setMobileRoundIntroCountdown,
    setMobileRoundIntroHideTiles,
    setMobileRoundIntroRoundDescription,
    setMobileRoundIntroRoundLabel,
    setMobileRoundIntroRoundTypeLabel,
    setMobileRoundIntroStage,
    specialRound,
    stopIntroCountdownSound,
    tournament,
    triggerTileIntroAnimationFnRef,
  );

  const {
    triggerConfettiBurst,
    triggerGridShake,
    triggerInvalidFlash,
    triggerPraiseFlash,
    triggerScoreFlight,
  } = useLazyObjectController(
    createCelebrationController,
    [
    celebrationFeature,
    canVibrateRef,
    confettiBurstTokenRef,
    gridRef,
    gridShakeAnimationRef,
    gridShakeTimerRef,
    invalidLastRef,
    isMobileLayout,
    isMobileLayoutRef,
    isVibrationEnabledRef,
    lastGobbleAtRef,
    phaseRef,
    praiseLastRef,
    preferLiteVisualEffectsRef,
    scoreFlightSequenceRef,
    setGridShake,
    setScoreFlights,
    tileRefs,
    visualConfettiEnabledRef,
    visualGobbleEnabledRef,
    visualInvalidWordsEnabledRef,
    visualPraiseEnabledRef,
    visualScoreFlightsEnabledRef,
    visualScreenShakeEnabledRef,
    ],
    CELEBRATION_CONTROLLER_METHODS,
  );

  useEffect(() => {
    if (phase !== "playing") {
      setHighlightPath([]);
    }
  }, [phase]);

  useEffect(() => {
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    const keepTargetDefinition =
      phase === "results" && typeof targetSummary?.word === "string" && targetSummary.word.trim();
    if ((!isTargetRoundNow || !targetSummary?.word) && !keepTargetDefinition) {
      targetDefinitionRequestRef.current += 1;
      setTargetDefinition({
        lookupWord: "",
        word: "",
        loading: false,
        ok: false,
        definition: "",
        definitions: [],
        etymology: "",
        complete: false,
        lemma: "",
        lemmaLabel: "",
        lemmaGuess: false,
        participleLabel: "",
        participleBase: "",
        participleGuess: false,
        inflectionLabel: "",
        inflectionBase: "",
        inflectionGuess: false,
        matchedTitle: "",
        phraseGuess: false,
        source: "",
        url: "",
      });
      return;
    }
    const clean = String(targetSummary.word || "").trim();
    if (!clean) return;
    const resolvedDefinitionWord = String(targetSummary.definitionTitle || clean).trim() || clean;
    const cachedDefinition =
      typeof targetSummary?.definition === "string"
        ? targetSummary.definition.trim()
        : "";
    const wantsCompleteDefinition =
      !targetSummary?.ocid && (isTargetRoundNow || !!keepTargetDefinition);
    if (cachedDefinition && !wantsCompleteDefinition) {
      if (
        targetDefinition.lookupWord === clean &&
        targetDefinition.ok &&
        targetDefinition.definition === cachedDefinition
      ) {
        return;
      }
      setTargetDefinition({
        lookupWord: clean,
        word: resolvedDefinitionWord,
        loading: false,
        ok: true,
        definition: cachedDefinition,
        definitions: [],
        etymology: "",
        complete: false,
        lemma: targetSummary.lemma || targetSummary.definitionLemma || "",
        lemmaLabel: targetSummary.lemmaLabel || targetSummary.definitionLemmaLabel || "",
        lemmaGuess: !!(targetSummary.lemmaGuess || targetSummary.definitionLemmaGuess),
        participleLabel:
          targetSummary.participleLabel || targetSummary.definitionParticipleLabel || "",
        participleBase:
          targetSummary.participleBase || targetSummary.definitionParticipleBase || "",
        participleGuess: !!(
          targetSummary.participleGuess || targetSummary.definitionParticipleGuess
        ),
        inflectionLabel:
          targetSummary.inflectionLabel || targetSummary.definitionInflectionLabel || "",
        inflectionBase:
          targetSummary.inflectionBase || targetSummary.definitionInflectionBase || "",
        inflectionGuess: !!(
          targetSummary.inflectionGuess || targetSummary.definitionInflectionGuess
        ),
        matchedTitle: targetSummary.matchedTitle || targetSummary.definitionMatchedTitle || "",
        phraseGuess: !!(targetSummary.phraseGuess || targetSummary.definitionPhraseGuess),
        source: targetSummary.definitionSource || "",
        url: targetSummary.definitionUrl || "",
      });
      return;
    }
    if (
      targetDefinition.lookupWord === clean &&
      (targetDefinition.loading ||
        (wantsCompleteDefinition ? targetDefinition.complete : targetDefinition.ok))
    ) {
      return;
    }
    const requestId = ++targetDefinitionRequestRef.current;
    setTargetDefinition({
      lookupWord: clean,
      word: clean,
      loading: true,
      ok: !!cachedDefinition,
      definition: cachedDefinition,
      definitions: [],
      etymology: "",
      complete: false,
      lemma: "",
      lemmaLabel: "",
      lemmaGuess: false,
      participleLabel: "",
      participleBase: "",
      participleGuess: false,
      inflectionLabel: "",
      inflectionBase: "",
      inflectionGuess: false,
      matchedTitle: "",
      phraseGuess: false,
      source: "",
      url: "",
    });
    const forceFreshDefinition = wantsCompleteDefinition;
    const tried = new Set();
    const baseKey = normalizeWord(clean);
    if (baseKey) tried.add(baseKey);

    const fetchDefinition = (word) => {
      const definitionUrl = forceFreshDefinition
        ? `/api/define?word=${encodeURIComponent(word)}&full=1&nocache=1`
        : `/api/define?word=${encodeURIComponent(word)}`;
      fetch(definitionUrl)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (requestId !== targetDefinitionRequestRef.current) return;
          if (!data) {
            setTargetDefinition((prev) => ({
              ...prev,
              loading: false,
              ok: prev.ok || !!prev.definition,
            }));
            return;
          }
          const definitionText = pickDefinitionText(data);
          const definitionList = pickDefinitionList(data);
          const ok = !!definitionText || !!data.ok;
          if (!definitionText) {
            const fallbacks = buildDefinitionFallbacks(clean, data, tried);
            if (fallbacks.length) {
              fetchDefinition(fallbacks[0]);
              return;
            }
          }
          setTargetDefinition({
            lookupWord: clean,
            word: data.displayWord || data.word || clean,
            loading: false,
            ok,
            definition: definitionText,
            definitions: definitionList,
            etymology: forceFreshDefinition
              ? sanitizeDefinitionText(data.etymology)
              : "",
            complete: forceFreshDefinition,
            lemma: data.lemma || "",
            lemmaLabel: data.lemmaLabel || "",
            lemmaGuess: !!data.lemmaGuess,
            participleLabel: data.participleLabel || "",
            participleBase: data.participleBase || "",
            participleGuess: !!data.participleGuess,
            inflectionLabel: data.inflectionLabel || "",
            inflectionBase: data.inflectionBase || "",
            inflectionGuess: !!data.inflectionGuess,
            matchedTitle: data.matchedTitle || "",
            phraseGuess: !!data.phraseGuess,
            source: data.source || "",
            url: data.url || "",
          });
        })
        .catch(() => {
          if (requestId !== targetDefinitionRequestRef.current) return;
          setTargetDefinition((prev) => ({
            ...prev,
            loading: false,
            ok: prev.ok || !!prev.definition,
          }));
        });
    };

    fetchDefinition(clean);
  }, [
    specialRound?.type,
    targetSummary,
    targetDefinition.lookupWord,
    targetDefinition.ok,
    targetDefinition.loading,
    targetDefinition.complete,
    phase,
  ]);

  useEffect(() => {
    if (!foundTargetThisRound) return;
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    if (!isTargetRoundNow) return;
    if (roundId && lastTargetConfettiRef.current === roundId) return;
    lastTargetConfettiRef.current = roundId || "target";
    triggerConfettiBurst("target");
  }, [foundTargetThisRound, specialRound?.type, roundId]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (!roundId) return;
    if (roundStartSoundRef.current === roundId) return;
    if (mobileRoundIntroSuppressRoundStartRef.current) return;
    roundStartSoundRef.current = roundId;
    if (!audioUnlockedRef.current) {
      roundStartPendingRef.current = roundId;
      return;
    }
    playRoundStartSound();
  }, [phase, roundId, mobileRoundIntroStage]);

  const playClockOneShotAudio = useStableEvent(playOneShotAudio);
  const playClockTickSound = useStableEvent(playTickSound);
  useEffect(
    () =>
      bindRoundClockAudio({
        clock: clockFeature,
        getContext: () => {
          const state = applicationKernel.getState();
          const currentPhase = state.game.phase;
          const specialRoundType = state.realtime.specialRound?.type || null;
          const currentView = state.navigation.view;
          const voteEndsAt = ocidFeature.store.getState().vote?.voteEndsAt || null;
          return {
            isLiveSpecial3WordsMode:
              currentView !== "daily_play" &&
              currentPhase === "playing" &&
              specialRoundType === DAILY_SPECIAL_MODE,
            phase: currentPhase,
            resetToken: `${state.realtime.roundId || ""}:${voteEndsAt || ""}`,
            specialRoundType,
          };
        },
        playOneShotAudio: playClockOneShotAudio,
        playTickSound: playClockTickSound,
      }),
    [
      applicationKernel,
      clockFeature,
      ocidFeature,
      playClockOneShotAudio,
      playClockTickSound,
    ]
  );

  useEffect(() => {
    const prevPhase = previousPhaseRef.current;
    previousPhaseRef.current = phase;

    if (phase === "playing" && roundId) {
      const introWindow = roundIntroServerWindowRef.current || {};
      const introRoundId = introWindow.roundId || null;
      const introStartsAt = Number.isFinite(introWindow.startsAt)
        ? Number(introWindow.startsAt)
        : null;
      const introStatus = String(introWindow.status || "");
      const hasPendingIntro =
        introRoundId &&
        introRoundId === roundId &&
        introStatus === "intro" &&
        Number.isFinite(introStartsAt) &&
        introStartsAt > getNowServerMs() + 80;
      if (hasPendingIntro && roundIntroStartedForRoundRef.current !== roundId) {
        startMobileRoundIntro();
        return;
      }
      if ((prevPhase === "results" || prevPhase === "lobby") && !hasPendingIntro) {
        roundIntroStartedForRoundRef.current = roundId;
      }
    }

    if (phase !== "playing" && mobileRoundIntroStage !== "idle") {
      stopMobileRoundIntro({ unlockInput: false });
    }
  }, [phase, roundId, mobileRoundIntroStage, startMobileRoundIntro, stopMobileRoundIntro]);

  useEffect(() => {
    if (phase === "playing") return;
    stopRoundEndTickSound({ fadeMs: 80 });
    stopIntroCountdownSound({ fadeMs: 80 });
  }, [phase]);
  useEffect(() => {
    if (phase === "playing") return;
    stopRoundStartSound({ fadeMs: 80 });
  }, [phase]);

  useEffect(() => {
    const isResults = phase === "results";
    const wasResults = lastAmbientPhaseRef.current === "results";
    lastAmbientPhaseRef.current = phase;
    const canPlayLiveAmbient =
      isLoggedIn &&
      !isDailyView &&
      phase === "results";

    if (isResults && !wasResults) {
      resetAmbientOrder();
    }

    if (isAmbientMuted || !canPlayLiveAmbient) {
      stopAmbientMusic({ fadeMs: 700, keepAlive: false });
      return;
    }

    startAmbientMusic({ silent: false });
  }, [phase, isAmbientMuted, isLoggedIn, isDailyView]);

  useEffect(() => {
    if (phase !== "playing") {
      setAnalysis(null);
      setHighlightPath([]);
      setHighlightPlayers([]);
    }
  }, [phase]);

  const {
    buildVocabOverlayRaceSnapshot,
    dedupeWeeklyEntries,
    getSelfWeeklyVocabRankFromStats,
    getWeeklyVocabRankForCount,
  } = React.useMemo(
    () => createWeeklyStatsRuntimeModel(installIdRef, nicknameRef, weeklyStats),
    [weeklyStats]
  );

  function stopVocabOverlayAnimation() {
    setVocabOverlayRequest(null);
    vocabOverlayControllerRef.current?.stop();
  }

  function skipVocabOverlayAnimation() {
    vocabOverlayControllerRef.current?.skip();
  }

  function startVocabOverlayAnimation(payload) {
    vocabOverlayRequestIdRef.current += 1;
    setVocabOverlayRequest({
      id: vocabOverlayRequestIdRef.current,
      payload,
    });
  }

  useEffect(() => {
    if (phase !== "results") {
      stopVocabOverlayAnimation();
      return;
    }
    if (targetSummary) {
      stopVocabOverlayAnimation();
      return;
    }
    if (!isAccountAuthenticated || !accountSeenReady) return;
    if (!Number.isFinite(vocabCount)) return;
    if (!vocabResultsReadyKey) return;
    const overlayKey = vocabResultsReadyKey;
    if (vocabOverlayRoundRef.current === overlayKey) return;
    const accountMarker = buildVocabOverlaySeenMarker(overlayKey);
    if (accountSeenMarkers.has(accountMarker)) {
      vocabOverlayRoundRef.current = overlayKey;
      return;
    }
    vocabOverlayRoundRef.current = overlayKey;
    markAccountSeen(accountMarker);

    const selfKey = (nicknameRef.current || nickname || "").trim();
    const selfResult =
      Array.isArray(finalResults) && selfKey
        ? finalResults.find((entry) => entry.nick === selfKey)
        : null;
    const hasNewVocabWords =
      selfResult && Object.prototype.hasOwnProperty.call(selfResult, "newVocabWords");
    const rawWordList = hasNewVocabWords
      ? Array.isArray(selfResult?.newVocabWords)
        ? selfResult.newVocabWords
        : []
      : Array.isArray(acceptedRef.current)
      ? acceptedRef.current
      : Array.isArray(accepted)
      ? accepted
      : [];
    const sortedWords = Array.from(new Set(rawWordList))
      .map((word) => String(word || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    const weeklyWordSource = Array.isArray(acceptedRef.current)
      ? acceptedRef.current
      : Array.isArray(accepted)
      ? accepted
      : rawWordList;
    const sortedWeeklyWords = Array.from(new Set(weeklyWordSource))
      .map((word) => String(word || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    let deltaCount = Number.isFinite(vocabRoundDelta)
      ? Math.max(0, vocabRoundDelta)
      : 0;
    if (hasNewVocabWords) {
      deltaCount = sortedWords.length;
    } else if (!Number.isFinite(deltaCount) || deltaCount <= 0) {
      const hasReliableBaseline =
        Number.isFinite(vocabBaselineRef.current) &&
        (!roundId || !vocabBaselineRoundRef.current || vocabBaselineRoundRef.current === roundId);
      if (hasReliableBaseline) {
        deltaCount = Math.max(0, vocabCount - vocabBaselineRef.current);
      } else {
        // En reprise tardive (resume) on evite un faux delta massif.
        deltaCount = sortedWords.length;
      }
    }
    let baseCount = Number.isFinite(vocabCount) ? Math.max(0, vocabCount - deltaCount) : 0;
    if (!Number.isFinite(baseCount)) baseCount = 0;
    const targetCount = baseCount + deltaCount;
    const weeklyTargetCount = Number.isFinite(vocabWeeklyCount)
      ? Math.max(0, vocabWeeklyCount)
      : null;
    let weeklyDeltaCount = Number.isFinite(vocabWeeklyRoundDelta)
      ? Math.max(0, vocabWeeklyRoundDelta)
      : 0;
    if (!Number.isFinite(weeklyDeltaCount) || weeklyDeltaCount <= 0) {
      const hasReliableWeeklyBaseline =
        Number.isFinite(vocabWeeklyBaselineRef.current) &&
        (!roundId ||
          !vocabWeeklyBaselineRoundRef.current ||
          vocabWeeklyBaselineRoundRef.current === roundId);
      if (hasReliableWeeklyBaseline && Number.isFinite(weeklyTargetCount)) {
        weeklyDeltaCount = Math.max(0, weeklyTargetCount - vocabWeeklyBaselineRef.current);
      } else {
        weeklyDeltaCount = Math.max(deltaCount, sortedWeeklyWords.length);
      }
    }
    weeklyDeltaCount = Math.max(weeklyDeltaCount, deltaCount);
    const weeklyBaseCount = Number.isFinite(weeklyTargetCount)
      ? Math.max(0, weeklyTargetCount - weeklyDeltaCount)
      : null;
    const serverWeeklyRank =
      selfResult?.vocabWeeklyRank && typeof selfResult.vocabWeeklyRank === "object"
        ? selfResult.vocabWeeklyRank
        : null;
    const serverRankBeforeValue =
      serverWeeklyRank?.before == null ? null : Number(serverWeeklyRank.before);
    const serverRankAfterValue =
      serverWeeklyRank?.after == null ? null : Number(serverWeeklyRank.after);
    const rankSnapshot =
      vocabOverlayRankSnapshotRef.current?.key === overlayKey
        ? vocabOverlayRankSnapshotRef.current
        : null;
    const computedRankStart = Number.isFinite(weeklyBaseCount)
      ? getWeeklyVocabRankForCount(weeklyBaseCount)
      : null;
    const computedRankEnd = Number.isFinite(weeklyTargetCount)
      ? getWeeklyVocabRankForCount(weeklyTargetCount)
      : null;
    const rankStart = Number.isFinite(serverRankBeforeValue)
      ? serverRankBeforeValue
      : Number.isFinite(rankSnapshot?.rankStart)
      ? rankSnapshot.rankStart
      : computedRankStart;
    const rankEnd = Number.isFinite(serverRankAfterValue)
      ? serverRankAfterValue
      : Number.isFinite(rankSnapshot?.rankEnd)
      ? rankSnapshot.rankEnd
      : computedRankEnd;
    const raceSnapshot =
      rankSnapshot?.race ||
      buildVocabOverlayRaceSnapshot({
        statsSource: weeklyStats,
        roundResults: finalResults,
        weeklyBaseCount,
        weeklyTargetCount,
        rankStart,
        rankEnd,
      });

    startVocabOverlayAnimation({
      baseCount,
      deltaCount,
      targetCount,
      weeklyBaseCount,
      weeklyDeltaCount,
      weeklyTargetCount,
      rankStart,
      rankEnd,
      raceSnapshot,
      words: sortedWeeklyWords.length ? sortedWeeklyWords : sortedWords,
    });
  }, [
    accepted,
    accountSeenMarkers,
    accountSeenReady,
    finalResults,
    phase,
    roundId,
    nickname,
    tournamentSummaryAt,
    isAccountAuthenticated,
    markAccountSeen,
    vocabCount,
    vocabWeeklyCount,
    vocabRoundDelta,
    vocabWeeklyRoundDelta,
    vocabResultsReadyKey,
    weeklyStats,
    targetSummary,
  ]);

  useEffect(() => {
    return () => {
      if (gridRotateTimerRef.current) {
        clearTimeout(gridRotateTimerRef.current);
        gridRotateTimerRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const pending = gridRotateAnimRef.current;
    if (!pending) return;
    gridRotateAnimRef.current = null;
    if (!pending.prevRects || pending.prevRects.size === 0) return;

    const durationMs = GRID_ROTATE_ANIM_MS;
    const easing = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    const spinDeg = Number.isFinite(pending.spin) ? pending.spin : 0;
    const letterSpin = spinDeg >= 0 ? 360 : -360;

    pending.prevRects.forEach((prev, index) => {
      const el = tileRefs.current[index];
      if (!el) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (!dx && !dy) return;

      const orbitFrames = [
        { transform: `translate(${dx}px, ${dy}px) rotate(${spinDeg}deg)` },
        { transform: "translate(0px, 0px) rotate(0deg)" },
      ];

      if (typeof el.animate === "function") {
        el.animate(orbitFrames, {
          duration: durationMs,
          easing,
          fill: "both",
        });
      } else {
        el.style.transition = `transform ${durationMs}ms ${easing}`;
        el.style.transform = orbitFrames[0].transform;
        requestAnimationFrame(() => {
          el.style.transform = orbitFrames[1].transform;
        });
        setTimeout(() => {
          el.style.transition = "";
          el.style.transform = "";
        }, durationMs);
      }

      const letterEl = el.querySelector(".tile-letter");
      if (!letterEl) return;
      const letterFrames = [
        { transform: "rotate(0deg)" },
        { transform: `rotate(${letterSpin}deg)` },
      ];
      const letterDuration = Math.round(durationMs * 0.85);
      if (typeof letterEl.animate === "function") {
        letterEl.animate(letterFrames, {
          duration: letterDuration,
          easing,
          fill: "both",
        });
      } else {
        letterEl.style.transition = `transform ${letterDuration}ms ${easing}`;
        letterEl.style.transform = letterFrames[0].transform;
        requestAnimationFrame(() => {
          letterEl.style.transform = letterFrames[1].transform;
        });
        setTimeout(() => {
          letterEl.style.transition = "";
          letterEl.style.transform = "";
        }, letterDuration);
      }
    });
  }, [gridRotationTurns]);

  const [clearTileIntroAnimation, clearSelection, stopImplodePhase] =
    useGridTransitionEffects(
      tileIntroTimerRef,
      tileRefs,
      gridRef,
      clearTileIntroAnimationFnRef,
      triggerTileIntroAnimationFnRef,
      implodeTimerRef,
      implodePhaseTimerRef,
      implodeFallbackRef,
      pendingRoundEndRef,
      pendingBreakStartRef,
      setImplodeActive,
      commitTraceSelection,
      activeTraceStartedAtRef,
      roundIdRef,
      implodeRoundRef,
      draggingRef,
      processRoundEndedRef,
      setServerStatus,
      setPhase,
      processBreakStartedRef
    );

  useRoundLifecycle({
    appViewRef,
    blackHoleAuxStopRef,
    blackHoleChebHandleRef,
    blackHoleClavierFadeRef,
    blackHoleClavierHandleRef,
    blackHoleHandleRef,
    blackHoleOverlayRef,
    blackHoleSourisLoopRef,
    blackHoleSyncTokenRef,
    buildObjectiveToastMessage,
    buildVocabOverlayRaceSnapshot,
    clearQueuedRankingUpdate,
    clearSelection,
    clearTileIntroAnimation,
    currentRoomIdRef,
    currentRoundTrainingRef,
    draggingRef,
    ensureTournamentBaseline,
    fetchThemeProfileRef,
    fetchWeeklyStatsSnapshot,
    FINAL_ROUND_RESULTS_SECONDS,
    gameplaySession: gameplaySessionFeature,
    gameplaySessionIdRef: gameplaySessionFeature.refs.sessionId,
    gameplaySessionTokenRef,
    getNowServerMs,
    getSelfWeeklyVocabRankFromStats,
    getTournamentPoints,
    getWeeklyVocabRankForCount,
    gridRef,
    implodeFallbackRef,
    inputLockedRef,
    isDailyPlayRef,
    isLoggedInRef,
    isSfxMuted,
    isTargetWordsObjective,
    LIVE_ROUND_END_PAYLOAD_WAIT_MS,
    nicknameRef,
    normalizeNickKey,
    outroInFlightRef,
    outroRoundRef,
    pendingBreakStartRef,
    pendingRoundEndRef,
    phaseRef,
    playOneShotAudio,
    playOutroThenResultsRef,
    playSfxHandle,
    processBreakStartedRef,
    processRoundEndedRef,
    renderTournamentTotalRightLabel,
    requestVocabCount,
    roundIdRef,
    roundStartAtRef,
    serverAllWordsRef,
    setAllWords,
    setAnnouncements,
    setBreakKind,
    setCurrentRoomId,
    setFinalResults,
    setInputLocked,
    setNextStartAt,
    setPhase,
    setProvisionalRanking,
    setResultsRankingMode,
    setResultsTeamDelta,
    setRoomId,
    setRoundId,
    setRoundPreparing,
    setScore,
    setServerEndsAt,
    setServerRoundDurationMs,
    setServerStatus,
    setTargetSummary,
    setTournament,
    setTournamentFinaleHoldUntil,
    setTournamentLobby,
    setTournamentRanking,
    setTournamentRoundPoints,
    setTournamentSummary,
    setTournamentSummaryAt,
    setTournamentTotals,
    setUpcomingSpecial,
    setVocabResultsReadyKey,
    setVocabRoundDelta,
    setVocabWeeklyRoundDelta,
    showToast,
    skipVocabOverlayOnceRef,
    standaloneTrainingSessionRef,
    STATS_SEASON_TARGET_LIMIT,
    stopImplodePhase,
    stopRoundEndTickSound,
    tileRefs,
    tournamentBaselineRef,
    tournamentDuelDeltaRef,
    tournamentRef,
    vocabBaselineRef,
    vocabOverlayRankSnapshotRef,
    vocabResultsPendingRef,
    vocabWeeklyBaselineRef,
    vocabWeeklyRankBaselineRef,
    weeklyStatsSnapshotRef,
  });

  function maybeAnnounceBestWord(nick, word, pts) {
    if (typeof pts !== "number") return;
    const maxPossiblePts = bestGridMaxRef.current || 0;
    const maxPossibleLen = bestGridMaxLenRef.current || 0;
    const normalizedWord = normalizeWord(word || "");
    const wordLen = normalizedWord.length;

    if (maxPossibleLen === 0 && maxPossiblePts === 0) return;

    // On ne déclenche l'annonce que pour le mot de longueur maximale
    if (maxPossibleLen > 0 && wordLen !== maxPossibleLen) return;
    if (maxPossiblePts > 0 && pts < maxPossiblePts) return;

    const announceKey =
      maxPossibleLen > 0 ? `len-${maxPossibleLen}` : `pts-${maxPossiblePts}`;
    if (bestWordAnnounceRef.current === announceKey) return;
    bestWordAnnounceRef.current = announceKey;
    setAnnouncements((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: `${nick} a battu le record avec (${pts} pts)`,
      },
    ]);
  }

  function clearToasts() {
    notificationsFeature.clear();
    gobblarToastDelayTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    gobblarToastDelayTimersRef.current.clear();
    ocidResultToastDelayTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    ocidResultToastDelayTimersRef.current = [];
  }

  function showToast(message, durationMs = 2800, options = {}) {
    const toast = notificationsFeature.show(message, durationMs, options);
    if (!toast) return;
    playOneShotAudio(SFX_KEYS.vocabCling, {
      cooldownKey: "toastPop",
      cooldownMs: 100,
      eqKey: "vocabCling",
    });
  }

  useEffect(() => {
    showToastRef.current = showToast;
  });

  const {
    applyPlaytimeLimitStatus,
    clearDevPlaytimeLimit,
    devPlaytimeLimits,
    fetchDevPlaytimeLimits,
    playtimeLimit,
    playtimeRemainingMs,
    setPlaytimeLimitFromSettings,
  } = usePlaytimeLimit({
    appView,
    authenticatedUserId,
    isAccountAuthenticated,
    isLoggedIn,
    onBlocked: returnToLobby,
    setDevControlsBusy,
    showGlobalRedAnnouncement,
    showToast,
  });

  function getObjectiveBucketLabel(bucket) {
    const key = String(bucket || "").toLowerCase();
    if (key === "easy") return "facile";
    if (key === "medium") return "moyen";
    if (key === "hard") return "difficile";
    return "";
  }

  function isTargetWordsObjective(entry) {
    const id = String(entry?.id || entry?.objectiveId || "").toLowerCase();
    const title = String(entry?.title || entry?.objectiveTitle || "").toLowerCase();
    return id.includes("target_word") || title.includes("mot cible");
  }

  function buildObjectiveToastMessage(entry, { validated = false } = {}) {
    const points = Number(entry?.teamPointsAwarded) || Number(entry?.teamPoints) || Number(entry?.points) || 0;
    const pointsSuffix = points > 0 ? ` (+${points} équipe)` : "";
    const title = String(entry?.title || entry?.objectiveTitle || "Objectif").trim() || "Objectif";
    if (!isTargetWordsObjective(entry)) {
      return `✅ Objectif validé : ${title}${pointsSuffix}`;
    }
    const target = Math.max(0, Number(entry?.target ?? entry?.objectiveTarget) || 0);
    const progressRaw = Math.max(0, Number(entry?.progress ?? entry?.objectiveProgress) || 0);
    if (validated) {
      const bucketLabel = getObjectiveBucketLabel(entry?.bucket || entry?.objectiveBucket);
      const bucketSuffix = bucketLabel ? ` (${bucketLabel})` : "";
      const ratio = target > 0 ? ` (${target}/${target})` : "";
      return `🎯 Objectif mots cibles${bucketSuffix} atteint !${ratio}${pointsSuffix}`;
    }
    if (target > 0) {
      const progress = Math.min(progressRaw, target);
      return `🎯 Mots cibles trouvés : ${progress}/${target}`;
    }
    return `🎯 Mots cibles trouvés`;
  }

  useEffect(() => {
    return () => {
      clearToasts();
    };
  }, []);

  useEffect(() => {
    diagnosticsFeature.configure({
      audioVoiceRef,
      currentTilesRef,
      dragGridMetricsRef,
      draggingRef,
      dragMoveRafRef,
      dragPendingPointRef,
      gridHitboxRef,
      phaseRef,
      tickRef,
    });
  }, [
    audioVoiceRef,
    currentTilesRef,
    diagnosticsFeature,
    dragGridMetricsRef,
    draggingRef,
    dragMoveRafRef,
    dragPendingPointRef,
    gridHitboxRef,
    phaseRef,
    tickRef,
  ]);
  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        syncServerTime();
      }
    };

    const onFocus = () => {
      syncServerTime();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const stopAudioForBackground = () => {
      stopAllActiveAudio({ suspendContext: true, immediate: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopAudioForBackground();
      }
    };
    window.addEventListener("pagehide", stopAudioForBackground);
    window.addEventListener("beforeunload", stopAudioForBackground);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", stopAudioForBackground);
      window.removeEventListener("beforeunload", stopAudioForBackground);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const allWordsMap = React.useMemo(
    () => new Map((Array.isArray(allWords) ? allWords : []).map((w) => [w.word, w])),
    [allWords]
  );

  const {
    requeueInFlightSubmissions,
    restorePendingSubmissionEntries,
    scheduleBatchFlush,
    submit,
    syncLiveSpecial3WordsState,
    tryAutoSubmitCurrentWordAtRoundEnd,
  } = useLazyObjectController(
    createWordSubmissionController,
    [
    acceptedBestPtsRef,
    acceptedRef,
    acceptedScoresRef,
    acceptedWordMetaRef,
    acceptedWordSetRef,
    activeTraceStartedAtRef,
    allWordsMap,
    appViewRef,
    areStringArraysEqual,
    batchSeqRef,
    batchTimerRef,
    batchUnsupportedRef,
    bestGridMaxLenRef,
    bestGridMaxRef,
    board,
    clearSelection,
    currentTilesRef,
    dailyAcceptedPathsRef,
    dailyActiveSlot,
    dailySpecialPlacements,
    dailyWordSlots,
    dictionary,
    draggingRef,
    dragGridMetricsRef,
    error,
    finishStandaloneTraining,
    foundTargetThisRound,
    getMassiveBoggleFeedbackPoints,
    getNextLiveFeedTs,
    handleForeground,
    highlightPathRef,
    inFlightBatchesRef,
    inputLockedRef,
    isCurrentCultureThemeWord,
    isDailyPlayRef,
    isLiveSpecial3WordsMode,
    isLoggedIn,
    isLoggedInRef,
    isMobileLayoutRef,
    isSpecial3WordsMode,
    isTouchDeviceRef,
    keyboardRecallSubmittedWordRef,
    lastInputModeRef,
    liveSessionReadyRef,
    maybeAnnounceBestWord,
    nickname,
    ocidLatestProposalRef,
    pendingQueueRef,
    pendingWordsRef,
    playAlreadyPlayedSound,
    playDoubleGobbleVoice,
    playGobbleVoice,
    playOneShotAudio,
    playScoreSound,
    pushWordHistory,
    registerAcceptedWordRuntime,
    resetDragMovePipeline,
    roundId,
    roundIdRef,
    roundStats,
    scheduleForegroundRetry,
    serverSolutionsReadyRef,
    setAccepted,
    setDailyActiveSlot,
    setDailyInvalidPulseKey,
    setDailyInvalidSlot,
    setDailySpecialPlacements,
    setDailyWordSlots,
    setFoundTargetThisRound,
    setFoundTargetWord,
    setHighlightPath,
    setLastWords,
    setOcidProposal,
    setOcidProposalPath,
    setOcidProposalSubmitted,
    setOcidStatusMessage,
    setScore,
    setStatusMessageWithHold,
    showToast,
    socket,
    solutionsRef,
    SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK,
    specialRound,
    specialScoreConfig,
    standaloneTrainingSessionRef,
    submissionStatusRef,
    touchSubmissionState,
    triggerConfettiBurst,
    triggerPraiseFlash,
    triggerScoreFlight,
    WORD_BATCH_ACK_TIMEOUT_MS,
    WORD_BATCH_FLUSH_MS,
    WORD_BATCH_MAX,
    ],
    WORD_SUBMISSION_CONTROLLER_METHODS,
  );

  useRealtimeEventBindings({
    applyCultureThemeChallengeToWordStores,
    appViewRef,
    clearQueuedRankingUpdate,
    clearSavedSession,
    currentRoomIdRef,
    currentRoundTrainingRef,
    dailySpecialDragRef,
    ensureTournamentBaseline,
    getNowServerMs,
    getWeeklyVocabRankForCount,
    gobblarsKnownBalanceRef,
    gobblarToastDelayTimersRef,
    inputLockedRef,
    isDailyPlayRef,
    isLoggedInRef,
    nicknameRef,
    ocidLatestProposalRef,
    outroInFlightRef,
    outroRoundRef,
    pendingBreakStartRef,
    pendingRoundEndRef,
    pendingSubmissionRecoveryRef,
    phaseLoopTestEnabledRef,
    phaseRef,
    playGobbleVoice,
    playOutroThenResultsRef,
    playSpecialFoundSound,
    processBreakStartedRef,
    processRoundEndedRef,
    requestVocabCount,
    roundHandlersRef,
    roundIdRef,
    roundStartAtRef,
    setAnnouncements,
    setBreakKind,
    setConnectionError,
    setCurrentRoomId,
    setDailyActiveSlot,
    setDailyInvalidSlot,
    setDailySpecialDrag,
    setDailySpecialPlacements,
    setDailyWordSlots,
    setFinalResults,
    setFoundTargetThisRound,
    setFoundTargetWord,
    setGobblarsBalance,
    setInputLocked,
    setIsLoggedIn,
    setLoginError,
    setMedals,
    setMobileResultsOutroFadeActive,
    setNextStartAt,
    setOcidProposal,
    setOcidProposalPath,
    setOcidProposalSubmitted,
    setOcidSelectedOptionId,
    setOcidStatusMessage,
    setOcidVote,
    setPhase,
    setProvisionalRanking,
    setResultsTeamDelta,
    setRoomId,
    setRoundPreparing,
    setServerEndsAt,
    setServerRoundDurationMs,
    setServerStatus,
    setSpecialHint,
    setSpecialSolvedOverlay,
    setTargetSummary,
    setTick,
    setTournament,
    setTournamentFinaleHoldUntil,
    setTournamentLobby,
    setTournamentSummary,
    setTournamentSummaryAt,
    setTrainingBusy,
    setUpcomingSpecial,
    setVocabResultsReadyKey,
    setVocabRoundDelta,
    setVocabWeeklyRoundDelta,
    showGlobalRedAnnouncement,
    showToast,
    showToastRef,
    socket,
    standaloneTrainingSessionRef,
    startGameFromServerRef,
    stopImplodePhase,
    submissionStatusRef,
    triggerConfettiBurst,
    triggerPraiseFlash,
    vocabBaselineRef,
    vocabBaselineRoundRef,
    vocabResultsPendingRef,
    vocabWeeklyBaselineRef,
    vocabWeeklyBaselineRoundRef,
    vocabWeeklyRankBaselineRef,
  });
  useEffect(() => {
    liveRoundFeature.configureRealtime({
      appViewRef,
      currentRoomIdRef,
      gameplaySession: gameplaySessionFeature,
      handlersRef: roundHandlersRef,
      isLoggedInRef,
      liveSessionReadyRef,
      onHydrateSnapshot: applyResumeSnapshot,
      phaseLoopTestEnabledRef,
      socket,
      standaloneTrainingSessionRef,
    });
  });
  useEffect(() => {
    statsFeature.configureRealtime({
      appViewRef,
      currentRoomIdRef,
      gameplaySession: gameplaySessionFeature,
      installIdRef,
      isLoggedInRef,
      liveSessionReadyRef,
      phaseLoopTestEnabledRef,
      socket,
      standaloneTrainingSessionRef,
    });
  });
  useEffect(() => {
    ocidFeature.configureRealtime({
      appViewRef,
      currentRoomIdRef,
      gameplaySession: gameplaySessionFeature,
      getNowServerMs,
      isLoggedInRef,
      liveSessionReadyRef,
      phaseLoopTestEnabledRef,
      setServerEndsAt,
      setServerRoundDurationMs,
      setStatusMessageWithHold,
      setTick,
      socket,
      standaloneTrainingSessionRef,
      stopRoundEndTickSound,
    });
  });
  useEffect(() => {
    feedFeature.configureRealtime({
      appViewRef,
      buildObjectiveToastMessage,
      currentRoomIdRef,
      gameplaySession: gameplaySessionFeature,
      isLoggedInRef,
      lastGobbleAtRef,
      liveSessionReadyRef,
      maybePlayAnnouncementSound,
      nickname,
      nicknameRef,
      phaseLoopTestEnabledRef,
      phaseRef,
      showToast,
      socket,
      standaloneTrainingSessionRef,
      triggerConfettiBurst,
      triggerPraiseFlash,
    });
  });
  useEffect(() => {
    rosterFeature.configureRealtime({
      appViewRef,
      currentRoomIdRef,
      gameplaySession: gameplaySessionFeature,
      isLoggedInRef,
      isSamsungBrowserRef,
      isTraceActive: shouldHoldLiveUiDuringTrace,
      liveSessionReadyRef,
      onDiagnosticCounter: bumpSamsungDiagCounter,
      onEvent: recordPerfEvent,
      phaseLoopTestEnabledRef,
      roundIdRef,
      socket,
      standaloneTrainingSessionRef,
      startTransition: React.startTransition,
    });
  });
  useEffect(() => {
    chatFeature.configureRealtime({
      deferNonessentialUiDuringTrace,
      installIdRef,
      isLoggedInRef,
      isMobileLayoutRef,
      nicknameRef,
      onReactionToast: enqueueMobileChatReactionToast,
      scheduleDesktopChatAutoScroll,
      socket,
    });
  });
  useEffect(() => {
    connectionFeature.configureRealtime({
      appViewRef,
      attemptSilentReconnectRef,
      autoResumeEnabledRef,
      batchUnsupportedRef,
      clearQueuedRankingUpdate,
      disconnectGraceMs: DISCONNECT_GRACE_MS,
      hasSavedSession,
      isChatOpenMobileRef,
      isHomeChatOpenRef,
      isLoggedInRef,
      liveSessionReadyRef,
      lobbyChatSubscriptionRef,
      manualDisconnectRef,
      requeueInFlightSubmissions,
      resumeLockAtRef,
      resumeLockRef,
      resumeLoginFromSessionRef,
      setFoundTargetThisRound,
      setFoundTargetWord,
      setPlayers,
      setProvisionalRanking,
      setSpecialHint,
      setSpecialSolvedOverlay,
      showToast,
      socket,
      standaloneTrainingSessionRef,
      subscribeLobbyChat,
      tournamentDuelDeltaRef,
      transientHomeConnectionErrors: TRANSIENT_HOME_CONNECTION_ERRORS,
    });
  });
  const roundClockMaxSeconds = Number.isFinite(serverRoundDurationMs)
    ? Math.max(1, Math.round(serverRoundDurationMs / 1000))
    : ROOM_OPTIONS[currentRoomId || roomId]?.duration ?? DEFAULT_DURATION;
  const handleRoundClockExpired = useStableEvent((effectSessionToken) => {
    const completeFinalizeRound = () => {
      if (gameplaySessionTokenRef.current !== effectSessionToken) return;
      tryAutoSubmitCurrentWordAtRoundEnd();
      playOutroThenResultsRef.current?.(null, { fallback: true });
    };
    const hadPendingDragMove = flushPendingDragMove();
    if (hadPendingDragMove && typeof window !== "undefined") {
      window.setTimeout(completeFinalizeRound, 0);
      return;
    }
    completeFinalizeRound();
  });
  const handleRoundClockCountdownElapsed = useStableEvent(() => startGame());
  const handleOcidClockExpired = useStableEvent(() => {
    stopRoundEndTickSound({ fadeMs: 80 });
  });
  useRoundClockController({
    countdownSeconds: COUNTDOWN,
    deadlineServerMs: serverEndsAt,
    disabled: isDailySpecial3TutorialActive,
    getServerNowMs: getNowServerMs,
    maxSeconds: roundClockMaxSeconds,
    onCountdownElapsed: handleRoundClockCountdownElapsed,
    onOcidExpired: handleOcidClockExpired,
    onRoundExpired: handleRoundClockExpired,
    phase,
    sessionTokenRef: gameplaySessionTokenRef,
    specialRoundType: specialRound?.type || null,
  });

  const intermissionFeature = useIntermissionClockController({
    getServerNowMs: getNowServerMs,
    nextStartAt,
  });
  useEffect(() => {
    const syncBreakCountdownRef = () => {
      breakCountdownRef.current =
        intermissionFeature.store.getState().remainingSeconds;
    };
    syncBreakCountdownRef();
    return intermissionFeature.store.subscribe(syncBreakCountdownRef);
  }, [intermissionFeature]);

  useEffect(() => {
    if (phase !== "results") return;
    if (isDailyPlay) return;
    if (specialRound?.type === "target_long") return;
    if (specialRound?.type === "target_score") return;
    if (specialRound?.type === OCID_TYPE) return;
    if (allWords.length > 0) return;
    if (serverAllWordsRef.current.length > 0) {
      setAllWords(serverAllWordsRef.current);
      return;
    }
    if (!dictionary) return;

    scheduleAllWordsCompute(board, {
      updateBestRefs: true,
      jobKey: `results-${roundId || Date.now()}`,
      delayMs: 0,
    });
  }, [
    phase,
    board,
    dictionary,
    allWords.length,
    specialScoreConfig,
    specialRound,
    upcomingSpecial,
    showAllWords,
    roundId,
  ]);

  useEffect(() => {
    if (!isDailyPlay) return;
    if (phase !== "results") return;
    submitDailyScore();
  }, [isDailyPlay, phase]);

  // Attribue des médailles locales à la fin d'une manche
  // Médailles : gérées côté serveur (événement "medalsUpdate")

  function getNowServerMs() {
    return readServerClockMs(serverClockRef.current);
  }

  function syncServerTime(next) {
    if (!socket?.connected) {
      next?.();
      return;
    }
    const t0 = getMonotonicNowMs();
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      next?.();
    }, 1200);
    socket.emit("timeSync", null, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const t1 = getMonotonicNowMs();
      if (res?.ok && typeof res.serverNow === "number") {
        const rtt = Math.max(0, t1 - t0);
        serverClockRef.current = updateServerClockFromSample(serverClockRef.current, {
          sampledServerNowMs: res.serverNow + rtt / 2,
        });
      }
      next?.();
    });
  }

  function loadSessionFromStorage() {
    return sessionPersistenceFeature.readStoredSession();
  }

  function persistSession(session) {
    const payload = sessionPersistenceFeature.persistSession(session, {
      fallbackInstallId: installId,
    });
    if (payload) setCanResumeSession(true);
    return payload;
  }

  function clearSavedSession() {
    sessionPersistenceFeature.clearSavedSession();
    setCanResumeSession(false);
    setResumePending(false);
    setResumeSnapshot(null);
    resumeProbeRef.current = { inFlight: false, lastAt: 0 };
  }

  function hasSavedSession() {
    return sessionPersistenceFeature.hasSavedSession();
  }

  useEffect(() => {
    sessionPersistenceFeature.configureActivity({
      enabled: isLoggedIn && appView === "live",
    });
  }, [appView, isLoggedIn, sessionPersistenceFeature]);

  function clearQueuedRankingUpdate() {
    clearQueuedRosterUpdates();
    deferredTraceUiTasksRef.current = [];
  }

  function shouldHoldLiveUiDuringTrace() {
    return phaseRef.current === "playing" && !!draggingRef.current;
  }

  function deferNonessentialUiDuringTrace(task, label = "ui") {
    if (!shouldHoldLiveUiDuringTrace() || typeof task !== "function") return false;
    deferredTraceUiTasksRef.current.push(task);
    recordPerfEvent(`${label}-held`);
    return true;
  }

  function flushDeferredLiveUiAfterTrace() {
    if (shouldHoldLiveUiDuringTrace()) return;
    const flushedRoster = flushQueuedRosterUpdates();
    const pendingUiTasks = deferredTraceUiTasksRef.current;
    deferredTraceUiTasksRef.current = [];
    if (flushedRoster.players || flushedRoster.ranking || pendingUiTasks.length) {
      recordPerfEvent("live-ui-flush", {
        players: flushedRoster.players,
        ranking: flushedRoster.ranking,
        tasks: pendingUiTasks.length,
      });
    }
    if (submissionTickDeferredByTraceRef.current) {
      submissionTickDeferredByTraceRef.current = false;
      touchSubmissionState();
    }
    pendingUiTasks.forEach((task) => {
      try {
        task();
      } catch (_) {}
    });
  }

  function pingServer(reason = "ping") {
    if (!socket.connected) {
      return Promise.reject(new Error("disconnected"));
    }
    if (pingInFlightRef.current) return pingInFlightRef.current;
    const promise = new Promise((resolve, reject) => {
      let done = false;
      const startedAt = getMonotonicNowMs();
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("timeout"));
      }, PING_SERVER_TIMEOUT_MS);
      socket.emit("timeSync", null, (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (res?.ok && typeof res.serverNow === "number") {
          const completedAt = getMonotonicNowMs();
          const rtt = Math.max(0, completedAt - startedAt);
          serverClockRef.current = updateServerClockFromSample(serverClockRef.current, {
            monotonicNowMs: completedAt,
            sampledServerNowMs: res.serverNow + rtt / 2,
          });
          resolve(res);
        } else {
          reject(new Error("bad_response"));
        }
      });
    }).finally(() => {
      pingInFlightRef.current = null;
    });
    pingInFlightRef.current = promise;
    return promise;
  }

  function fetchWeeklyStatsSnapshot(topN = 200) {
    const requestedTopN = Number.isFinite(topN)
      ? Math.min(200, Math.max(1, Math.round(topN)))
      : 200;
    const query = requestedTopN ? `?topN=${requestedTopN}` : "";
    return fetch(`/api/stats/weekly${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(`http_${res.status || "error"}`);
        return text ? JSON.parse(text) : null;
      })
      .then((data) => {
        if (data && typeof data === "object") {
          setWeeklyStats(data);
          setWeeklyStatsError("");
          return data;
        }
        return null;
      })
      .catch((err) => {
        console.warn("weekly stats snapshot failed", err);
        return null;
      });
  }

  function fetchWeeklyStats(force = false, topN = null) {
    const now = Date.now();
    const requestedTopN = Number.isFinite(topN)
      ? Math.min(200, Math.max(1, Math.round(topN)))
      : null;
    const inFlight = weeklyFetchStateRef.current;
    const sameInFlightTopN =
      !!inFlight?.controller && inFlight.topN === requestedTopN;
    if (sameInFlightTopN) return;
    if (inFlight?.controller) {
      if (!force) return;
      try {
        inFlight.controller.abort();
      } catch (_) {}
    }
    const sameAsLastTopN = weeklyFetchRef.current.lastTopN === requestedTopN;
    if (sameAsLastTopN && now < weeklyFetchRetryAfterRef.current) return;
    if (!force && weeklyStatsLoading) return;
    if (
      !force &&
      weeklyFetchRef.current.last &&
      now - weeklyFetchRef.current.last < 4000 &&
      weeklyFetchRef.current.lastTopN === requestedTopN
    ) {
      return;
    }
    weeklyFetchRef.current.last = now;
    weeklyFetchRef.current.lastTopN = requestedTopN;
    setWeeklyStatsLoading(true);
    setWeeklyStatsError("");
    const controller = new AbortController();
    weeklyFetchStateRef.current = {
      controller,
      topN: requestedTopN,
      startedAt: now,
    };
    const timer = setTimeout(() => controller.abort(), 6500);
    const query = requestedTopN ? `?topN=${requestedTopN}` : "";
    fetch(`/api/stats/weekly${query}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(`http_${res.status || "error"}`);
        try {
          return text ? JSON.parse(text) : null;
        } catch (_) {
          throw new Error("bad_json");
        }
      })
      .then((data) => {
        if (weeklyFetchStateRef.current.controller !== controller) return;
        weeklyFetchRetryAfterRef.current = 0;
        setWeeklyStats(data || null);
      })
      .catch((err) => {
        if (weeklyFetchStateRef.current.controller !== controller) return;
        if (err.name === "AbortError") {
          setWeeklyStatsError("timeout");
        } else if (err.message === "bad_json") {
          setWeeklyStatsError("format");
        } else {
          setWeeklyStatsError("erreur");
        }
        weeklyFetchRetryAfterRef.current = Date.now() + 2500;
      })
      .finally(() => {
        clearTimeout(timer);
        if (weeklyFetchStateRef.current.controller !== controller) return;
        const startedAt = weeklyFetchStateRef.current.startedAt || now;
        weeklyFetchStateRef.current = {
          controller: null,
          topN: null,
          startedAt: 0,
        };
        const elapsed = Math.max(0, Date.now() - startedAt);
        const delay = Math.max(0, 220 - elapsed);
        setTimeout(() => {
          if (weeklyFetchStateRef.current.controller) return;
          setWeeklyStatsLoading(false);
        }, delay);
      });
  }

  function fetchDailyStatus() {
    setDailyStatus((prev) => ({ ...prev, loading: true, error: "" }));
    const query = installId ? `?installId=${encodeURIComponent(installId)}` : "";
    fetch(`/api/daily/status${query}`, {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
          throw new Error(data?.error || `http_${res.status || "error"}`);
        }
        return data;
      })
      .then((data) => {
        setDailyStatus({
          loading: false,
          ready: !!data?.ready,
          hasPlayed: !!data?.hasPlayed,
          hasPlayedMonstrous: !!data?.hasPlayedMonstrous,
          hasPlayedSpecial: !!data?.hasPlayedSpecial,
          hasPlayedFakeTwins: !!data?.hasPlayedFakeTwins,
          dateId: data?.dateId || null,
          myResult: data?.myResult || null,
          myMonstrousResult: data?.myMonstrousResult || null,
          mySpecialResult: data?.mySpecialResult || null,
          myFakeTwinsResult: data?.myFakeTwinsResult || null,
          champion: data?.champion || null,
          maintenanceMode: !!data?.maintenanceMode,
          maintenanceMessage: data?.maintenanceMessage || "",
          error: "",
        });
        if (data?.duel && typeof data.duel === "object") {
          setDuelStatus({
            loading: false,
            error: "",
            dateId: data.duel.dateId || null,
            weekId: data.duel.weekId || null,
            team: data.duel.team || null,
            crowned: !!data.duel.crowned,
            weekly: data.duel.weekly || null,
            objectives: data.duel.objectives || null,
            dailyBattle: data.duel.dailyBattle || null,
            tutorialVersion: data.duel.tutorialVersion || null,
          });
        }
      })
      .catch(() => {
        setDailyStatus((prev) => ({
          ...prev,
          loading: false,
          error: "erreur",
        }));
      });
  }

  function fetchBroadcastNotice() {
    setBroadcastNotice((prev) => ({ ...prev, loading: true, error: "" }));
    fetch("/api/broadcast/current", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (_) {
          throw new Error("bad_json");
        }
        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || `http_${res.status || "error"}`);
        }
        return data;
      })
      .then((data) => {
        const nextMessage =
          data?.message && typeof data.message === "object" ? data.message : null;
        setBroadcastNotice({
          loading: false,
          message: nextMessage,
          error: "",
        });
      })
      .catch(() => {
        setBroadcastNotice((prev) => ({
          ...prev,
          loading: false,
          error: "erreur",
        }));
      });
  }

  function dismissBroadcastNotice() {
    const messageKey = getBroadcastMessageKey(broadcastNotice?.message);
    if (!messageKey) return;
    markAccountSeen(buildBroadcastSeenMarker(messageKey));
  }

  function markVaultWordOfDaySeen(dateId = vaultWordOfDayPopup.dateId) {
    markAccountSeen(buildVaultWordOfDaySeenMarker(dateId));
  }

  function closeVaultWordOfDayPopup() {
    markVaultWordOfDaySeen();
    setVaultWordOfDayPopup((prev) => ({ ...prev, open: false }));
  }

  function openVaultFromWordOfDay() {
    markVaultWordOfDaySeen();
    setVaultWordOfDayPopup((prev) => ({ ...prev, open: false }));
    openWordVaultPage();
  }

  async function fetchDuelStatus({ dateId = null, retryAuth = true, force = false } = {}) {
    if (!installId) return;
    if (!isAccountAuthenticated) {
      setDuelStatus((prev) => ({
        ...prev,
        loading: false,
        error: "",
      }));
      return;
    }
    const requestKey = `${installId}|${dateId || ""}`;
    const fetchState = duelStatusFetchStateRef.current;
    if (!force && fetchState.inFlight) {
      return;
    }
    fetchState.inFlight = true;
    fetchState.key = requestKey;
    fetchState.startedAt = Date.now();
    setDuelStatus((prev) => ({ ...prev, loading: true, error: "" }));
    const params = new URLSearchParams();
    params.set("installId", installId);
    if (dateId) params.set("dateId", dateId);
    try {
      let data = null;
      let errorCode = "erreur";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const query = new URLSearchParams(params);
        if (attempt > 0) {
          query.set("r", String(Date.now()));
        }
        const controller =
          typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeoutId =
          controller && typeof window !== "undefined"
            ? window.setTimeout(() => controller.abort(), 12000)
            : null;
        let res = null;
        try {
          res = await fetch(`/api/duel/status?${query.toString()}`, {
            cache: "no-store",
            credentials: "include",
            signal: controller?.signal,
            headers: {
              Accept: "application/json",
              "Cache-Control": "no-store, no-cache, max-age=0",
              Pragma: "no-cache",
            },
          });
        } finally {
          if (timeoutId) window.clearTimeout(timeoutId);
        }
        const parsed = await readJsonResponseLoose(res);
        if (!res.ok) {
          errorCode = String(parsed?.data?.error || `http_${res.status || "error"}`);
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            continue;
          }
          throw new Error(errorCode);
        }
        if (!parsed.parseOk || !parsed.data || typeof parsed.data !== "object") {
          errorCode = parsed.isLikelyHtml ? "bad_payload_html" : "bad_payload";
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            continue;
          }
          throw new Error(errorCode);
        }
        data = parsed.data;
        break;
      }
      if (!data || typeof data !== "object") {
        throw new Error(errorCode);
      }
      setDuelStatus({
        loading: false,
        error: "",
        dateId: data?.dateId || null,
        weekId: data?.weekId || null,
        team: data?.team || null,
        crowned: !!data?.crowned,
        weekly: data?.weekly || null,
        lastWeekSummary: data?.lastWeekSummary || null,
        objectives: data?.objectives || null,
        dailyBattle: data?.dailyBattle || null,
        tutorialVersion: data?.tutorialVersion || null,
      });
      setAccountNotice((prev) =>
        prev === ACCOUNT_SESSION_UNAVAILABLE_MESSAGE
          ? ""
          : prev
      );
    } catch (err) {
      const code = String(err?.message || "erreur");
      console.warn("[duel/status] fetch failed", {
        code,
        installId,
        dateId: dateId || null,
      });
      if (code === "auth_required") {
        if (retryAuth) {
          const refreshed = await refreshAuthStatus({ silent: true });
          if (refreshed?.status === "authenticated" && refreshed?.user) {
            await fetchDuelStatus({ dateId, retryAuth: false, force: true });
            return;
          }
        }
        setDuelStatus((prev) => ({
          ...prev,
          loading: false,
          error: "auth_required",
        }));
        setAccountNotice(ACCOUNT_SESSION_UNAVAILABLE_MESSAGE);
        return;
      }
      setDuelStatus((prev) => ({
        ...prev,
        loading: false,
        error: code,
      }));
    } finally {
      if (duelStatusFetchStateRef.current.key === requestKey) {
        duelStatusFetchStateRef.current.inFlight = false;
        duelStatusFetchStateRef.current.key = "";
        duelStatusFetchStateRef.current.startedAt = 0;
      }
    }
  }

  useEffect(() => {
    const summary = duelStatus?.lastWeekSummary;
    const weekId = String(summary?.weekId || "").trim();
    if (!isAccountAuthenticated || !weekId) return;
    if (!accountSeenReady) return;
    if (shouldShowTutorial || isNewPlayerPopupQuiet) return;
    if (isLoggedIn || isDailyPlay || appView !== "home") return;
    if (duelWeekRecapOpen) return;
    const accountMarker = buildDuelWeekRecapSeenMarker(weekId);
    if (
      accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.legacyBaseline) &&
      !accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.legacyDuelRecapConsumed)
    ) {
      markAccountSeen([
        accountMarker,
        ACCOUNT_SEEN_MARKERS.legacyDuelRecapConsumed,
      ]);
      return;
    }
    if (accountSeenMarkers.has(accountMarker)) return;
    if (!isWeeklyRecapPodiumReady(summary, weeklyStats)) {
      if (
        !weeklyStatsLoading &&
        duelWeekRecapWeeklyRefreshRef.current !== weekId
      ) {
        duelWeekRecapWeeklyRefreshRef.current = weekId;
        fetchWeeklyStats(true);
      }
      return;
    }
    duelWeekRecapWeeklyRefreshRef.current = "";
    setDuelWeekRecapPreviewMode(false);
    setDuelWeekRecapPage(0);
    setDuelWeekRecapOpen(true);
  }, [
    accountSeenMarkers,
    accountSeenReady,
    appView,
    duelStatus?.lastWeekSummary,
    duelWeekRecapOpen,
    isAccountAuthenticated,
    isDailyPlay,
    isNewPlayerPopupQuiet,
    isLoggedIn,
    shouldShowTutorial,
    markAccountSeen,
    weeklyStats,
    weeklyStatsLoading,
  ]);

  useEffect(() => {
    if (!duelWeekRecapOpen) return;
    if (!isLoggedIn && !isDailyPlay && appView === "home") return;
    setDuelWeekRecapOpen(false);
    setDuelWeekRecapPage(0);
    setDuelWeekRecapPreviewMode(false);
  }, [appView, duelWeekRecapOpen, isDailyPlay, isLoggedIn]);

  function rerollDuelObjective(bucket) {
    if (!installId || !bucket) return;
    setDuelRerollBusyBucket(bucket);
    fetch("/api/duel/objectives/reroll", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ installId, bucket }),
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok || !data?.ok) {
          const code = data?.error || "reroll_error";
          throw new Error(code);
        }
        return data;
      })
      .then((data) => {
        setDuelStatus((prev) => ({
          ...prev,
          objectives: {
            ...(prev?.objectives || {}),
            dateId: data?.dateId || prev?.objectives?.dateId || null,
            rerollUsed: !!data?.rerollUsed,
            objectives: Array.isArray(data?.objectives) ? data.objectives : prev?.objectives?.objectives || [],
          },
        }));
        showToast(`🎲 Nouvel objectif : ${data?.objective?.title || "Objectif"}`, 2600);
      })
      .catch((err) => {
        const code = err?.message || "";
        if (code === "all_validated") {
          showToast("Reroll indisponible (objectifs déjà validés)", 2600);
        } else if (code === "reroll_used") {
          showToast("Reroll déjà utilisé aujourd'hui", 2200);
        } else {
          showToast("Reroll indisponible", 2000);
        }
      })
      .finally(() => {
        setDuelRerollBusyBucket(null);
        fetchDuelStatus();
      });
  }

  function handleDuelObjectiveValidated(objective) {
    const objectiveKey =
      objective?.id ||
      objective?.title ||
      objective?.bucket ||
      "validated";
    playOneShotAudio(SFX_KEYS.vocabCling, {
      cooldownKey: `duelObjectiveValidated:${objectiveKey}`,
      cooldownMs: 0,
      eqKey: "vocabCling",
    });
  }

  function getDuelConsumedValidatedKeys(view) {
    const safeView = view === "popup" ? "popup" : "page";
    const currentDateId = duelStatus?.objectives?.dateId || duelStatus?.dateId || "";
    const state = duelConsumedValidatedByView?.[safeView];
    if (!state || state.dateId !== currentDateId) return [];
    return Array.isArray(state.keys) ? state.keys : [];
  }

  function markDuelValidatedObjectiveConsumed(view, _objective, key) {
    const consumedKey = String(key || "").trim();
    if (!consumedKey) return;
    const safeView = view === "popup" ? "popup" : "page";
    const currentDateId = duelStatus?.objectives?.dateId || duelStatus?.dateId || "";
    if (!currentDateId) return;
    setDuelConsumedValidatedByView((prev) => {
      const current = prev?.[safeView] || { dateId: "", keys: [] };
      const baseKeys =
        current.dateId === currentDateId && Array.isArray(current.keys) ? current.keys : [];
      if (baseKeys.includes(consumedKey)) return prev;
      return {
        ...prev,
        [safeView]: {
          dateId: currentDateId,
          keys: [...baseKeys, consumedKey],
        },
      };
    });
  }

  function duelObjectivesAreCompleted() {
    const list = Array.isArray(duelStatus?.objectives?.objectives)
      ? duelStatus.objectives.objectives
      : [];
    if (!list.length) return false;
    return list.every((objective) => !!objective?.validated);
  }

  function canShowDuelObjectivesPopup() {
    const dateId = duelStatus?.objectives?.dateId || duelStatus?.dateId || "";
    if (!dateId) return false;
    if (duelObjectivesAreCompleted()) return false;
    return duelObjectivesPopupDismissedDateId !== dateId;
  }

  function closeDuelObjectivesPopup() {
    const dateId = duelStatus?.objectives?.dateId || duelStatus?.dateId || "";
    if (dateId) {
      setDuelObjectivesPopupDismissedDateId(dateId);
    }
    setDuelPopupState({ mode: null, step: 0, team: null, weekId: null });
  }

  function acknowledgeDuelTeamPopup() {
    if (!isAccountAuthenticated || !duelStatus?.weekId) {
      setDuelPopupState({ mode: null, step: 0, team: null, weekId: null });
      return;
    }
    markAccountSeen(buildDuelWeekSeenMarker(duelStatus.weekId));
    const version = duelStatus?.tutorialVersion || "duel-v1";
    if (!accountSeenMarkers.has(buildDuelTutorialSeenMarker(version))) {
      setDuelPopupState({
        mode: "tutorial",
        step: 0,
        team: duelStatus?.team || null,
        weekId: duelStatus?.weekId || null,
      });
      return;
    }
    if (canShowDuelObjectivesPopup()) {
      setDuelPopupState({
        mode: "objectives",
        step: 0,
        team: duelStatus?.team || null,
        weekId: duelStatus?.weekId || null,
      });
      return;
    }
    setDuelPopupState({ mode: null, step: 0, team: null, weekId: null });
  }

  function advanceDuelTutorial() {
    setDuelPopupState((prev) => {
      const nextStep = Number(prev?.step || 0) + 1;
      if (nextStep >= DUEL_TUTORIAL_STEPS.length) {
        const version = duelStatus?.tutorialVersion || "duel-v1";
        markAccountSeen(buildDuelTutorialSeenMarker(version));
        if (canShowDuelObjectivesPopup()) {
          return {
            mode: "objectives",
            step: 0,
            team: duelStatus?.team || null,
            weekId: duelStatus?.weekId || null,
          };
        }
        return { mode: null, step: 0, team: null, weekId: null };
      }
      return { ...prev, step: nextStep };
    });
  }

  function fetchDailyHistory(days = 10) {
    if (dailyHistoryLoading) return;
    setDailyHistoryLoading(true);
    setDailyHistoryError("");
    const params = new URLSearchParams();
    params.set("days", String(days));
    if (installId) params.set("installId", installId);
    fetch(`/api/daily/history?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
          throw new Error(data?.error || `http_${res.status || "error"}`);
        }
        return data;
      })
      .then((data) => {
        const safeDays = Array.isArray(data?.days) ? data.days : [];
        const rawCrowns = Array.isArray(data?.crownTotals)
          ? data.crownTotals
          : Array.isArray(data?.medalTotals)
          ? data.medalTotals
          : [];
        const safeCrowns = rawCrowns.map((entry) => ({
          nick: entry?.nick || "Joueur",
          crowns: Number.isFinite(entry?.crowns)
            ? entry.crowns
            : Number.isFinite(entry?.gold)
            ? entry.gold
            : 0,
        }));
        setDailyHistory({ days: safeDays, crownTotals: safeCrowns });
      })
      .catch(() => {
        setDailyHistory({ days: [], crownTotals: [] });
        setDailyHistoryError("erreur");
      })
      .finally(() => {
        setDailyHistoryLoading(false);
      });
  }

  function fetchDailyBoard(dateId = null) {
    setDailyBoard((prev) => ({ ...prev, loading: true, error: "" }));
    const query = dateId ? `?dateId=${encodeURIComponent(dateId)}` : "";
    fetch(`/api/daily/board${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!data || typeof data !== "object") {
          throw new Error(`http_${res.status || "error"}`);
        }
        return data;
      })
      .then((data) => {
        setDailyBoard({
          loading: false,
          ready: !!data?.ready,
          dateId: data?.dateId || null,
          entries: Array.isArray(data?.entries) ? data.entries : [],
          battle: data?.battle || null,
          error: "",
        });
      })
      .catch(() => {
        setDailyBoard((prev) => ({
          ...prev,
          loading: false,
          error: "erreur",
        }));
      });
  }

  function openDailyHome() {
    setDailyStartError("");
    setDailySubmitError("");
    setDailyResult(null);
    setDailySection(DAILY_OVERVIEW_SECTION);
    setDailyLaunchDialog(null);
    clearMobileChatReactionToasts();
    appViewRef.current = "daily";
    isDailyPlayRef.current = false;
    setAppView("daily");
    fetchDailyStatus();
    fetchDailyBoard();
    fetchDailyHistory(10);
    fetchDuelStatus();
  }

  const [
    parsePossiblyDirtyJson,
    isLikelyHtmlPayload,
    readJsonResponseLoose,
    formatAuthError,
    postAuthJson,
    connectSocketWithAuth,
    buildAuthFormForMode,
    openAuthDialog,
    closeAuthDialog,
    refreshAuthStatus,
    ensureAuthenticated,
    submitAuthDialog,
    handleAccountLogout,
  ] = useLazyArrayController(createAuthController, [
    socket,
    socketConnectPromiseRef,
    isAccountAuthenticated,
    AUTH_MODAL_MODES,
    legacyProfileUsername,
    authState,
    nickname,
    setAuthModalMode,
    setAuthError,
    setAuthInfo,
    setAuthForm,
    setAuthSubmitting,
    authSubmitting,
    deviceInstallId,
    setAuthState,
    setAccountNotice,
    ACCOUNT_SERVER_BUSY_MESSAGE,
    isAuthStatusPending,
    isAuthServerUnavailable,
    setLoginError,
    setDailyStartError,
    authModalMode,
    authForm,
    ACCOUNT_SESSION_UNAVAILABLE_MESSAGE,
    setNickname,
    setIsAccountMenuOpen,
    clearSavedSession,
    isLoggedIn,
    returnToLobby,
  ], 13);

  const {
    wordVault,
    wordVaultActionPending,
    isWordInVault,
    fetchWordVault,
    openWordVaultPage,
    setWordVaultSortMode,
    addWordToVault,
    removeWordFromVault,
  } = useWordVault({
    isAccountAuthenticated,
    authenticatedUserId,
    appView,
    setAppView,
    refreshAuthStatus,
    ensureAuthenticated,
    postAuthJson,
    readJsonResponseLoose,
    showToast,
  });

  useEffect(() => {
    void refreshAuthStatus();
  }, [deviceInstallId]);

  useEffect(() => {
    if (!isAuthServerUnavailable) return;
    const timer = setTimeout(() => {
      void refreshAuthStatus({ silent: false });
    }, 5000);
    return () => clearTimeout(timer);
  }, [deviceInstallId, isAuthServerUnavailable]);

  useEffect(() => {
    if (!isAccountAuthenticated) return;
    if (!socket.connected) return;
    if (isLoggedInRef.current) return;
    socket.disconnect();
  }, [isAccountAuthenticated, authenticatedUserId]);

  useEffect(() => {
    if (
      authState.status !== "legacy_profile_found" ||
      !authState.legacyProfile ||
      (authModalMode !== AUTH_MODAL_MODES.REGISTER && authModalMode !== AUTH_MODAL_MODES.LOGIN)
    ) {
      return;
    }
    setAuthError("");
    setAuthInfo("");
    setAuthModalMode(AUTH_MODAL_MODES.CLAIM_LEGACY);
    setAuthForm(buildAuthFormForMode(AUTH_MODAL_MODES.CLAIM_LEGACY));
  }, [
    authModalMode,
    authState.legacyProfile,
    authState.status,
  ]);

  useEffect(() => {
    const accountUsername = String(authState.user?.usernameDisplay || "").trim();
    if (!isAccountAuthenticated || !accountUsername) return;
    if (isLoggedIn) return;
    if (nickname !== accountUsername) {
      setNickname(accountUsername);
    }
    try {
      localStorage.setItem("boggle_nick", accountUsername);
    } catch (_) {}
  }, [authState.user?.usernameDisplay, isAccountAuthenticated, isLoggedIn, nickname]);

  useEffect(() => {
    if (!isAccountAuthenticated || !authState.user?.mustResetPassword) return;
    if (authModalMode === AUTH_MODAL_MODES.CHANGE_PASSWORD) return;
    openAuthDialog(AUTH_MODAL_MODES.CHANGE_PASSWORD);
  }, [authModalMode, authState.user?.mustResetPassword, isAccountAuthenticated]);

  function emitSocketAck(eventName, payload, { timeoutMs = 6500 } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        socket.off("connect", onConnect);
        socket.off("connect_error", onConnectError);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const settleResolve = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const settleReject = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const send = () => {
        timeoutId = setTimeout(() => {
          settleReject(new Error("timeout"));
        }, timeoutMs);
        socket.emit(eventName, payload, (res) => {
          if (!res || typeof res !== "object") {
            settleReject(new Error("bad_payload"));
            return;
          }
          if (res.ok === false) {
            const err = new Error(String(res.error || "error"));
            err.payload = res;
            settleReject(err);
            return;
          }
          settleResolve(res);
        });
      };

      function onConnect() {
        send();
      }

      function onConnectError(err) {
        settleReject(new Error(err?.message || "connect_error"));
      }

      if (socket.connected) {
        send();
        return;
      }

      socket.once("connect", onConnect);
      socket.once("connect_error", onConnectError);
      void connectSocketWithAuth();
    });
  }

  const [
    startDailyGame,
    submitDailyScore,
    openDailyLaunchDialog,
    closeDailyLaunchDialog,
    confirmDailyLaunch,
  ] = useLazyArrayController(createDailyGameController, [
    getGameProgress,
    acceptedRef,
    appViewRef,
    applyThemeVisualState,
    board,
    clearSelection,
    dailyAcceptedPathsRef,
    dailyLaunchDialog,
    dailyLifecycleRef,
    dailyPlayMode,
    dailySessionRef,
    dailySpecialDragRef,
    dailySpecialPlacements,
    dailyStatus,
    dailySubmitRef,
    dailyTictocPlayedRef,
    dailyWordSlots,
    emitSocketAck,
    ensureAuthenticated,
    fetchDailyBoard,
    fetchDailyStatus,
    fetchThemeProfileRef,
    inputLockedRef,
    installId,
    isDailyPlayRef,
    isDailySpecialMode,
    nickname,
    readJsonResponseLoose,
    requestAudioUnlock,
    resetSubmissionQueue,
    setAppView,
    setDailyActiveSlot,
    setDailyBoard,
    setDailyInvalidSlot,
    setDailyLaunchDialog,
    setDailyPlayMode,
    setDailyResult,
    setDailySection,
    setDailySpecialDrag,
    setDailySpecialPlacements,
    setDailyStartError,
    setDailyStatus,
    setDailySubmitError,
    setDailyWordSlots,
    setDuelStatus,
    setInputLocked,
    setPhase,
    setRoundId,
    setServerEndsAt,
    setServerRoundDurationMs,
    setServerStatus,
    showToast,
    specialScoreConfig,
    startGameFromServerRef,
    themeAppliedSafe,
    gameplaySessionFeature,
  ], 5);

  function requestVocabCount() {
    const emitRequest = (resolve) => {
      socket.emit("getVocabCount", { installId }, (res) => {
        const count = Number.isFinite(res?.count) ? res.count : null;
        const weeklyCount = Number.isFinite(res?.weeklyCount) ? res.weeklyCount : null;
        if (Number.isFinite(count)) {
          setVocabCount(count);
          setVocabUpdatedAt(Date.now());
        }
        if (Number.isFinite(weeklyCount)) {
          setVocabWeeklyCount(weeklyCount);
          setVocabWeeklyUpdatedAt(Date.now());
        }
        setVocabLoading(false);
        resolve({ count, weeklyCount });
      });
    };

    setVocabLoading(true);
    if (!socket.connected) {
      return new Promise((resolve) => {
        const onConnect = () => {
          cleanup();
          emitRequest(resolve);
        };
        const onError = () => {
          cleanup();
          setVocabLoading(false);
          resolve(null);
        };
        const cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("connect_error", onError);
        };
        socket.once("connect", onConnect);
        socket.once("connect_error", onError);
        void connectSocketWithAuth();
      });
    }

    return new Promise((resolve) => {
      emitRequest(resolve);
    });
  }

  function fetchVocabStats() {
    if (!installId) return;
    const now = Date.now();
    if (now - lastVocabFetchAtRef.current < 2000) return;
    lastVocabFetchAtRef.current = now;
    void requestVocabCount();
  }

  function requestTrophyStatus() {
    const emitRequest = (resolve) => {
      socket.emit("getTrophyStatus", { installId }, (res) => {
        const status = res?.status || null;
        if (status && typeof status === "object") {
          setTrophyStatus(status);
          if (Array.isArray(status.history)) {
            setTrophyHistory(status.history.slice(0, 10));
          }
        }
        setTrophyLoading(false);
        resolve(status);
      });
    };

    setTrophyLoading(true);
    if (!socket.connected) {
      return new Promise((resolve) => {
        const onConnect = () => {
          cleanup();
          emitRequest(resolve);
        };
        const onError = () => {
          cleanup();
          setTrophyLoading(false);
          resolve(null);
        };
        const cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("connect_error", onError);
        };
        socket.once("connect", onConnect);
        socket.once("connect_error", onError);
        void connectSocketWithAuth();
      });
    }

    return new Promise((resolve) => {
      emitRequest(resolve);
    });
  }

  function openWeeklyStatsOverlay() {
    setWeeklyActiveIndex(0);
    setIsWeeklyOpen(true);
    setAppView("stats");
    setStatsTab("weekly");
    fetchWeeklyStats(true);
    void requestVocabCount();
    void requestTrophyStatus();
    fetchDuelStatus();
  }

  function openDuelPage() {
    setIsWeeklyOpen(false);
    setAppView("duel");
    fetchDuelStatus();
  }

  function closeWeeklyStatsOverlay() {
    setIsWeeklyOpen(false);
    setAppView(isLoggedIn ? "live" : "home");
  }

  useEffect(() => {
    if (phase !== "results") return;
    const playersCount = Array.isArray(players) ? players.length : 0;
    const desiredTopN = Math.min(200, Math.max(50, playersCount));
    const currentTopN = Number.isFinite(weeklyStats?.topN) ? weeklyStats.topN : 0;
    if (!weeklyStats || currentTopN < desiredTopN) {
      fetchWeeklyStats(true, desiredTopN);
      return;
    }
    fetchWeeklyStats();
  }, [phase, players.length, weeklyStats?.topN, !!weeklyStats]);

  function buildPlayersSnapshot(list) {
    const safe = Array.isArray(list) ? list : [];
    const seen = new Set();
    const snapshot = [];
    safe.forEach((entry, idx) => {
      const nick = entry?.nick ? String(entry.nick) : "";
      if (!nick || seen.has(nick)) return;
      seen.add(nick);
      const liveAwards = gobbleAwardsForLive?.get?.(nick) || null;
      const gobbleAwardCount =
        (liveAwards?.bestWord ? 1 : 0) + (liveAwards?.longestWord ? 1 : 0);
      const userId = normalizeUserIdForProfile(entry?.userId);
      const installId = entry?.installId != null ? String(entry.installId) : "";
      const playerKey = entry?.playerKey
        ? String(entry.playerKey)
        : userId
        ? `install:${userId}`
        : "";
      snapshot.push({
        nick,
        userId,
        installId,
        playerKey,
        team: entry?.team || null,
        isBot: !!entry?.isBot,
        inTraining: !!entry?.inTraining,
        trainingMode: entry?.trainingMode || null,
        isDailyChampion: !!entry?.isDailyChampion,
        weeklyVocabPodiumRank: Number(entry?.weeklyVocabPodiumRank) || 0,
        isWeeklyVocabChampion: !!entry?.isWeeklyVocabChampion,
        rank: Number.isFinite(entry?.rank) ? entry.rank : idx + 1,
        score: typeof entry?.score === "number" ? entry.score : null,
        gobbleAwardCount,
      });
    });
    snapshot.sort((a, b) => {
      const ra = Number.isFinite(a.rank) ? a.rank : Infinity;
      const rb = Number.isFinite(b.rank) ? b.rank : Infinity;
      return ra - rb;
    });
    return snapshot;
  }

  function openPlayersOverlaySnapshot(list) {
    setPlayersOverlaySnapshot(buildPlayersSnapshot(list));
    setPlayersOverlayMode("snapshot");
    setIsPlayersOverlayOpen(true);
  }

  function fetchLobbyPlayers() {
    const lobbyRoomId = roomId || getDefaultRoomId();
    setLobbyPlayersLoading(true);
    fetch(`/api/players?roomId=${encodeURIComponent(lobbyRoomId)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.players) ? data.players : [];
        setLobbyPlayersList(list);
        setLobbyRoomStatus(data?.status && typeof data.status === "object" ? data.status : null);
        if (!isLoggedInRef.current && data?.status?.tournamentLobby) {
          setTournamentLobby(data.status.tournamentLobby);
        }
        if (!isLoggedInRef.current) {
          const nextNicks = new Set(
            list
              .map((entry) => (entry?.nick ? String(entry.nick).trim() : ""))
              .filter((nick) => nick && !isSystemAuthor(nick))
          );
          lobbyPresenceRef.current = nextNicks;
        }
      })
      .catch(() => {
        setLobbyPlayersList([]);
        setLobbyRoomStatus(null);
      })
      .finally(() => {
        setLobbyPlayersLoading(false);
      });
  }

  function openPlayersOverlayAlpha() {
    setPlayersOverlaySnapshot([]);
    setPlayersOverlayMode("alpha");
    setIsPlayersOverlayOpen(true);
    if (!isLoggedIn) {
      fetchLobbyPlayers();
    }
  }

  function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }

  function closePlayersOverlay() {
    setIsPlayersOverlayOpen(false);
  }

  function shiftWeeklyBoard(delta) {
    const total = WEEKLY_BOARDS.length;
    if (!Number.isInteger(delta) || total <= 1) return;
    setWeeklyActiveIndex((prev) => {
      const next = (prev + delta + total) % total;
      weeklySwipeTrack.settle(next);
      return next;
    });
    playSwipeSound();
  }

  function goToWeeklyBoard(nextIndex) {
    const total = WEEKLY_BOARDS.length;
    if (!Number.isFinite(nextIndex) || total <= 1) return;
    const current = clampValue(weeklyActiveIndex, 0, total - 1);
    const next = clampValue(nextIndex, 0, total - 1);
    if (next === current) return;
    weeklySwipeTrack.settle(next);
    setWeeklyActiveIndex(next);
    playSwipeSound();
  }

  function shouldIgnoreSwipeClick(ref, delayMs = 450) {
    const last = ref?.current || 0;
    return Date.now() - last < delayMs;
  }

  function isKeyboardEditableTarget(target) {
    if (typeof HTMLElement === "undefined") return false;
    const targetElement = target instanceof HTMLElement ? target : null;
    if (!targetElement) return false;
    const tag = targetElement.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      targetElement.isContentEditable ||
      !!targetElement.closest?.("[contenteditable='true']")
    );
  }

  function isStatsScrollTouchTarget(target) {
    if (typeof Element === "undefined") return false;
    const touchEl = target instanceof Element ? target : null;
    const scrollEl = touchEl?.closest?.('[data-stats-scroll="true"]');
    if (!scrollEl) return false;
    return scrollEl.scrollHeight > scrollEl.clientHeight + 1;
  }

  function isStatsProfileTouchTarget(target) {
    if (typeof Element === "undefined") return false;
    const touchEl = target instanceof Element ? target : null;
    return !!touchEl?.closest?.('[data-stats-profile-button="true"]');
  }

  function resolveStatsGestureAxis(touchRef, deltaX, deltaY) {
    const currentAxis = touchRef?.current?.gestureAxis || "none";
    if (currentAxis === "horizontal" || currentAxis === "vertical") {
      return currentAxis;
    }
    const fromScrollable = !!touchRef?.current?.fromScrollable;
    const fromProfileButton = !!touchRef?.current?.fromProfileButton;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const deadZone = fromProfileButton ? 5 : fromScrollable ? 9 : 7;
    if (absX < deadZone && absY < deadZone) return "pending";
    if (!fromScrollable) {
      touchRef.current.gestureAxis = "horizontal";
      return "horizontal";
    }
    const horizontalStrong = fromProfileButton
      ? absX >= 7 && absX >= absY * 0.7
      : absX >= 12 && absX >= absY * 0.85;
    const verticalStrong = absY >= 12 && absY > absX * 1.2;
    if (horizontalStrong) {
      touchRef.current.gestureAxis = "horizontal";
      return "horizontal";
    }
    if (verticalStrong) {
      touchRef.current.gestureAxis = "vertical";
      return "vertical";
    }
    if (absX > absY) {
      touchRef.current.gestureAxis = "horizontal";
      return "horizontal";
    }
    if (absY > absX) {
      touchRef.current.gestureAxis = "vertical";
      return "vertical";
    }
    return "pending";
  }

  function getSeasonPages() {
    return ["vocab_rank", "vocab_personal"];
  }

  function shiftSeasonPage(delta) {
    const pages = getSeasonPages();
    const total = pages.length;
    if (!Number.isInteger(delta) || total <= 1) return;
    setSeasonActiveIndex((prev) => {
      const next = (prev + delta + total) % total;
      seasonSwipeTrack.settle(next);
      return next;
    });
    playSwipeSound();
  }

  function goToSeasonPage(nextIndex) {
    const pages = getSeasonPages();
    const total = pages.length;
    if (total <= 1) return;
    const next = clampValue(nextIndex, 0, total - 1);
    seasonSwipeTrack.settle(next);
    setSeasonActiveIndex(next);
  }

  function triggerWeeklyArrowHint({ blink = false, showForMs = 1600 } = {}) {
    if (weeklyArrowTimerRef.current) {
      clearTimeout(weeklyArrowTimerRef.current);
      weeklyArrowTimerRef.current = null;
    }
    if (weeklyArrowBlinkTimerRef.current) {
      clearTimeout(weeklyArrowBlinkTimerRef.current);
      weeklyArrowBlinkTimerRef.current = null;
    }
    if (weeklyArrowBumpTimerRef.current) {
      clearTimeout(weeklyArrowBumpTimerRef.current);
      weeklyArrowBumpTimerRef.current = null;
    }
    if (isMobileLayout) {
      setWeeklyArrowVisible(true);
    }
    setWeeklyArrowBump(false);
    setTimeout(() => setWeeklyArrowBump(true), 20);
    weeklyArrowBumpTimerRef.current = setTimeout(() => {
      setWeeklyArrowBump(false);
    }, 520);
    if (blink) {
      setWeeklyArrowBlink(true);
      weeklyArrowBlinkTimerRef.current = setTimeout(() => {
        setWeeklyArrowBlink(false);
      }, 1800);
    }
    if (isMobileLayout) {
      weeklyArrowTimerRef.current = setTimeout(() => {
        setWeeklyArrowVisible(false);
        setWeeklyArrowBlink(false);
        setWeeklyArrowBump(false);
      }, showForMs);
    }
  }

  function applyWeeklyDragOffset(nextOffset) {
    const value = Number.isFinite(nextOffset) ? nextOffset : 0;
    weeklySwipeTrack.move(value, weeklyActiveIndex);
  }

  function resetWeeklyDragOffset() {
    weeklySwipeTrack.settle(weeklyActiveIndex);
  }

  function handleWeeklyTouchStart(e) {
    if (statsTab !== "weekly") return;
    weeklyTouchRef.current.fromScrollable = isStatsScrollTouchTarget(e?.target);
    weeklyTouchRef.current.fromProfileButton = isStatsProfileTouchTarget(e?.target);
    weeklyTouchRef.current.gestureAxis = "none";
    weeklyTouchRef.current.dragging = false;
    const touch = e?.touches?.[0];
    const x = touch?.clientX ?? null;
    const y = touch?.clientY ?? null;
    weeklyTouchRef.current.startX = x;
    weeklyTouchRef.current.startY = y;
    weeklySlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    triggerWeeklyArrowHint();
    weeklySwipeTrack.begin(weeklyActiveIndex);
  }

  function handleWeeklyTouchMove(e) {
    if (statsTab !== "weekly") return;
    const startX = weeklyTouchRef.current.startX;
    const startY = weeklyTouchRef.current.startY;
    if (startX == null || startY == null) return;
    const touch = e?.touches?.[0];
    const currentX = touch?.clientX ?? null;
    const currentY = touch?.clientY ?? null;
    if (currentX == null || currentY == null) return;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const axis = resolveStatsGestureAxis(weeklyTouchRef, deltaX, deltaY);
    if (axis === "vertical") {
      weeklyTouchRef.current.dragging = false;
      resetWeeklyDragOffset();
      return;
    }
    if (axis !== "horizontal") return;
    if (!weeklyTouchRef.current.dragging) {
      if (Math.abs(deltaX) < 6) return;
      weeklyTouchRef.current.dragging = true;
      triggerWeeklyArrowHint();
    }
    if (e?.cancelable) e.preventDefault();
    const width = weeklySlideWidthRef.current || window.innerWidth || 1;
    const clamped = clampValue(deltaX, -width * 0.35, width * 0.35);
    applyWeeklyDragOffset(clamped);
  }

  function handleWeeklyTouchEnd(e) {
    if (statsTab !== "weekly") return;
    const axis = weeklyTouchRef.current.gestureAxis;
    const fromProfileButton = !!weeklyTouchRef.current.fromProfileButton;
    weeklyTouchRef.current.gestureAxis = "none";
    weeklyTouchRef.current.fromScrollable = false;
    weeklyTouchRef.current.fromProfileButton = false;
    const startX = weeklyTouchRef.current.startX;
    const startY = weeklyTouchRef.current.startY;
    weeklyTouchRef.current.startX = null;
    weeklyTouchRef.current.startY = null;
    const width = weeklySlideWidthRef.current || window.innerWidth || 1;
    const touch = e?.changedTouches?.[0];
    weeklyTouchRef.current.dragging = false;
    if (axis === "vertical") {
      resetWeeklyDragOffset();
      return;
    }
    if (startX == null || startY == null || !touch) {
      resetWeeklyDragOffset();
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (fromProfileButton && Math.hypot(deltaX, deltaY) >= 8) {
      weeklySwipeBlockRef.current = Date.now();
    }
    const threshold = fromProfileButton
      ? Math.max(32, width * 0.07)
      : Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.1);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      weeklySwipeBlockRef.current = Date.now();
      shiftWeeklyBoard(deltaX < 0 ? 1 : -1);
      return;
    }
    resetWeeklyDragOffset();
  }

  function handleSeasonTouchStart(e) {
    if (statsTab !== "season") return;
    seasonTouchRef.current.fromScrollable = isStatsScrollTouchTarget(e?.target);
    seasonTouchRef.current.fromProfileButton = isStatsProfileTouchTarget(e?.target);
    seasonTouchRef.current.gestureAxis = "none";
    seasonTouchRef.current.dragging = false;
    const touch = e?.touches?.[0];
    const x = touch?.clientX ?? null;
    const y = touch?.clientY ?? null;
    seasonTouchRef.current.startX = x;
    seasonTouchRef.current.startY = y;
    seasonSlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    seasonSwipeTrack.begin(seasonActiveIndex);
  }

  function handleSeasonTouchMove(e) {
    if (statsTab !== "season") return;
    const startX = seasonTouchRef.current.startX;
    const startY = seasonTouchRef.current.startY;
    if (startX == null || startY == null) return;
    const touch = e?.touches?.[0];
    const currentX = touch?.clientX ?? null;
    const currentY = touch?.clientY ?? null;
    if (currentX == null || currentY == null) return;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const axis = resolveStatsGestureAxis(seasonTouchRef, deltaX, deltaY);
    if (axis === "vertical") {
      seasonTouchRef.current.dragging = false;
      seasonSwipeTrack.settle(seasonActiveIndex);
      return;
    }
    if (axis !== "horizontal") return;
    if (!seasonTouchRef.current.dragging) {
      if (Math.abs(deltaX) < 6) return;
      seasonTouchRef.current.dragging = true;
    }
    if (e?.cancelable) e.preventDefault();
    const width = seasonSlideWidthRef.current || window.innerWidth || 1;
    const clamped = clampValue(deltaX, -width * 0.35, width * 0.35);
    seasonSwipeTrack.move(clamped, seasonActiveIndex);
  }

  function handleSeasonTouchEnd(e) {
    if (statsTab !== "season") return;
    const axis = seasonTouchRef.current.gestureAxis;
    const fromProfileButton = !!seasonTouchRef.current.fromProfileButton;
    seasonTouchRef.current.gestureAxis = "none";
    seasonTouchRef.current.fromScrollable = false;
    seasonTouchRef.current.fromProfileButton = false;
    const startX = seasonTouchRef.current.startX;
    const startY = seasonTouchRef.current.startY;
    seasonTouchRef.current.startX = null;
    seasonTouchRef.current.startY = null;
    const width = seasonSlideWidthRef.current || window.innerWidth || 1;
    const touch = e?.changedTouches?.[0];
    seasonTouchRef.current.dragging = false;
    if (axis === "vertical") {
      seasonSwipeTrack.settle(seasonActiveIndex);
      return;
    }
    if (startX == null || startY == null || !touch) {
      seasonSwipeTrack.settle(seasonActiveIndex);
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (fromProfileButton && Math.hypot(deltaX, deltaY) >= 8) {
      seasonSwipeBlockRef.current = Date.now();
    }
    const threshold = fromProfileButton
      ? Math.max(32, width * 0.07)
      : Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.1);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      seasonSwipeBlockRef.current = Date.now();
      shiftSeasonPage(deltaX < 0 ? 1 : -1);
      return;
    }
    seasonSwipeTrack.settle(seasonActiveIndex);
  }

  function handleStatsTouchStart(e) {
    if (statsTab === "weekly") return handleWeeklyTouchStart(e);
    if (statsTab === "season") return handleSeasonTouchStart(e);
  }

  function handleStatsTouchMove(e) {
    if (statsTab === "weekly") return handleWeeklyTouchMove(e);
    if (statsTab === "season") return handleSeasonTouchMove(e);
  }

  function handleStatsTouchEnd(e) {
    if (statsTab === "weekly") return handleWeeklyTouchEnd(e);
    if (statsTab === "season") return handleSeasonTouchEnd(e);
  }

  function applyResumeSnapshot(snapshot, hydrationMeta = {}) {
    if (!snapshot || typeof snapshot !== "object") return;
    if (standaloneTrainingSessionRef.current) return;
    if (snapshot.roomId) {
      setCurrentRoomId(snapshot.roomId);
      setRoomId(snapshot.roomId);
    }
    const phase = snapshot.phase || "lobby";
    const currentRound = snapshot.currentRound || null;
    const breakState = snapshot.breakState || null;
    const lastRound = snapshot.lastRoundResults || null;
    const playerState = snapshot.player || null;
    const entryKind = String(hydrationMeta?.entryKind || "resume");
    const recoverPendingSubmissions = entryKind !== "join";
    if (!recoverPendingSubmissions) {
      pendingSubmissionRecoveryRef.current = null;
      submissionStatusRef.current.clear();
      resetSubmissionQueue();
    }
    setTournamentLobby(snapshot.tournamentLobby || null);
    const currentPendingSnapshot = recoverPendingSubmissions
      ? capturePendingSubmissions(submissionStatusRef.current, roundIdRef.current)
      : { entries: [], roundId: null };
    const pendingSnapshot =
      recoverPendingSubmissions && currentPendingSnapshot.entries.length > 0
        ? currentPendingSnapshot
        : recoverPendingSubmissions
        ? pendingSubmissionRecoveryRef.current
        : null;

    if (phase === "preparing") {
      phaseRef.current = "lobby";
      setPhase("lobby");
      setServerStatus("waiting");
      setNextStartAt(null);
      setBreakKind(null);
      setFinalResults([]);
      setProvisionalRanking([]);
      if (snapshot.roundPreparing) {
        roundHandlersRef.current.onRoundPreparing?.(snapshot.roundPreparing);
      } else {
        setRoundPreparing({
          roomId: snapshot.roomId || null,
          roundNumber: null,
          special: null,
          message: "La prochaine grille est en cours de préparation.",
          startedAt: snapshot.capturedAt || Date.now(),
        });
      }
      pendingSubmissionRecoveryRef.current = null;
      resetSubmissionQueue();
      return;
    }

    if (phase === "playing" && currentRound?.grid && Array.isArray(currentRound.grid)) {
      roundHandlersRef.current.onRoundStarted?.(currentRound);
      if (playerState?.capabilities && typeof playerState.capabilities === "object") {
        const canTraceGrid =
          playerState.capabilities.canSubmit === true ||
          playerState.capabilities.canSyncSpecial3Words === true ||
          playerState.capabilities.canPropose === true;
        inputLockedRef.current = !canTraceGrid;
        setInputLocked(!canTraceGrid);
      }
      if (snapshot.specialHint && typeof snapshot.specialHint === "object") {
        const hintKind = snapshot.specialHint.kind || null;
        const allowCells = hintKind === "target_long" || hintKind === "target_score";
        setSpecialHint({
          kind: hintKind,
          pattern: snapshot.specialHint.pattern || "",
          length:
            typeof snapshot.specialHint.length === "number"
              ? snapshot.specialHint.length
              : currentRound.targetLength || null,
          cells:
            allowCells && Array.isArray(snapshot.specialHint.revealCells)
              ? snapshot.specialHint.revealCells.filter((index) => Number.isInteger(index))
              : [],
          wordIndices:
            allowCells && Array.isArray(snapshot.specialHint.revealWordIndices)
              ? snapshot.specialHint.revealWordIndices.filter(
                  (index) => Number.isInteger(index) && index >= 0
                )
              : [],
        });
      }
      if (playerState?.targetFound) {
        setFoundTargetThisRound(true);
        setFoundTargetWord(String(playerState.targetWord || ""));
      }
      if (playerState?.ocid && typeof playerState.ocid === "object") {
        const proposal = String(playerState.ocid.proposal || "");
        const proposalPath = Array.isArray(playerState.ocid.proposalPath)
          ? playerState.ocid.proposalPath
          : [];
        setOcidProposal(proposal);
        setOcidProposalPath(proposalPath);
        setOcidProposalSubmitted(proposal);
        setOcidSelectedOptionId(String(playerState.ocid.selectedOptionId || ""));
        ocidLatestProposalRef.current = {
          roundId: currentRound.roundId || null,
          word: proposal,
          path: proposalPath,
        };
      }
      if (currentRound?.special?.type === DAILY_SPECIAL_MODE || playerState?.special3Words) {
        setDailySpecialPlacements(
          playerState?.special3Words?.specialPlacements &&
            typeof playerState.special3Words.specialPlacements === "object"
            ? playerState.special3Words.specialPlacements
            : createDailySpecialPlacements()
        );
        setDailyWordSlots(
          Array.isArray(playerState?.special3Words?.wordSlots)
            ? playerState.special3Words.wordSlots.map((slot, idx) => ({
                id: Number.isFinite(slot?.id) ? slot.id : idx,
                word: String(slot?.word || "").trim(),
                display: String(slot?.display || slot?.word || "").trim(),
                path: Array.isArray(slot?.path) ? slot.path : [],
              }))
            : createDailyWordSlots()
        );
      }
      if (Array.isArray(snapshot.ranking)) {
        setProvisionalRanking(snapshot.ranking);
      }
      const serverWords = Array.isArray(playerState?.words)
        ? Array.from(new Set(playerState.words.map((w) => normalizeWord(w)).filter(Boolean)))
        : [];
      const pendingRecovery = reconcilePendingSubmissions({
        serverWords,
        pendingSnapshot,
        activeRoundId: currentRound.roundId,
      });
      const words = pendingRecovery.acceptedWords;
      setAccepted(words);
      const scores = new Map();
      const scoreConfig =
        currentRound.special?.type === "bonus_letter" && currentRound.special?.bonusLetter
          ? {
              bonusLetter: currentRound.special.bonusLetter,
              bonusLetterScore: currentRound.special.bonusLetterScore ?? 20,
              disableBonuses: true,
            }
          : currentRound.special?.type === MASSIVE_BOGGLE_TYPE
          ? {
              classicBoggleScoring: true,
              minWordLength: currentRound.special.minWordLength || 3,
              disableBonuses: true,
            }
          : null;
      dailyAcceptedPathsRef.current = new Map();
      if (currentRound.grid && words.length) {
        words.forEach((word) => {
          const path = findBestPathForWord(currentRound.grid, word, scoreConfig);
          if (path) {
            scores.set(word, computeScore(word, path, currentRound.grid, scoreConfig));
            dailyAcceptedPathsRef.current.set(word, {
              word,
              path: Array.isArray(path) ? [...path] : [],
            });
          }
        });
      } else {
        dailyAcceptedPathsRef.current = new Map();
      }
      for (const entry of pendingRecovery.pendingEntries) {
        const word = entry.word;
        const meta = entry.meta || {};
        if (Number.isFinite(meta.optimisticPts)) {
          scores.set(word, Number(meta.optimisticPts));
        }
        if (Array.isArray(meta.path) && meta.path.length > 0) {
          dailyAcceptedPathsRef.current.set(word, {
            word,
            path: [...meta.path],
          });
        }
      }
      syncAcceptedRuntimeCaches(words, { scoreMap: scores });
      setScore((Number(playerState?.score) || 0) + pendingRecovery.optimisticScore);
      restorePendingSubmissionEntries(
        pendingRecovery.pendingEntries,
        currentRound.roundId
      );
      pendingSubmissionRecoveryRef.current = null;
      return;
    }

    if (phase === "lobby") {
      setPhase("lobby");
      setServerStatus("waiting");
      setNextStartAt(null);
      intermissionFeature.stop();
      setBreakKind(null);
      setFinalResults([]);
      setProvisionalRanking([]);
      setRoundPreparing(null);
      setUpcomingSpecial(null);
      pendingSubmissionRecoveryRef.current = null;
      resetSubmissionQueue();
      return;
    }

    if (phase === "results" && lastRound?.payload) {
      // Reprise en cours de phase results: ne pas rejouer l'overlay vocab depuis zero.
      skipVocabOverlayOnceRef.current = true;
      processRoundEndedRef.current?.(lastRound.payload);
      if (lastRound.round?.grid && Array.isArray(lastRound.round.grid)) {
        setBoard(lastRound.round.grid);
        setGridSize(lastRound.round.gridSize || getGridSizeForRoom(snapshot.roomId));
        setSpecialRound(
          lastRound.round.special && lastRound.round.special.isSpecial ? lastRound.round.special : null
        );
        if (lastRound.round.gridQuality) {
          const stats = {
            words: lastRound.round.gridQuality.words ?? null,
            totalPts:
              lastRound.round.gridQuality.possibleScore ??
              lastRound.round.gridQuality.totalPts ??
              lastRound.round.gridQuality.maxPts ??
              null,
            maxPts: lastRound.round.gridQuality.maxPts ?? null,
            maxLen: lastRound.round.gridQuality.maxLen ?? null,
            longWords: lastRound.round.gridQuality.longWords ?? null,
            fakeTwinWords: lastRound.round.gridQuality.fakeTwinWords ?? null,
          };
          setRoundStats(stats);
          bestGridMaxRef.current = stats?.maxPts ?? 0;
          bestGridMaxLenRef.current = stats?.maxLen ?? 0;
        }
      }
      if (breakState) {
        roundHandlersRef.current.onBreakStarted?.(breakState);
      }
      const words = Array.isArray(playerState?.words)
        ? Array.from(new Set(playerState.words.map((w) => normalizeWord(w)).filter(Boolean)))
        : [];
      setAccepted(words);
      if (lastRound.round?.grid && Array.isArray(lastRound.round.grid) && words.length) {
        const scoreConfig =
          lastRound.round.special?.type === "bonus_letter" && lastRound.round.special?.bonusLetter
            ? {
                bonusLetter: lastRound.round.special.bonusLetter,
                bonusLetterScore: lastRound.round.special.bonusLetterScore ?? 20,
                disableBonuses: true,
              }
            : lastRound.round.special?.type === MASSIVE_BOGGLE_TYPE
            ? {
                classicBoggleScoring: true,
                minWordLength: lastRound.round.special.minWordLength || 3,
                disableBonuses: true,
              }
            : null;
        const scores = new Map();
        dailyAcceptedPathsRef.current = new Map();
        words.forEach((word) => {
          const path = findBestPathForWord(lastRound.round.grid, word, scoreConfig);
          if (path) {
            scores.set(word, computeScore(word, path, lastRound.round.grid, scoreConfig));
            dailyAcceptedPathsRef.current.set(word, {
              word,
              path: Array.isArray(path) ? [...path] : [],
            });
          }
        });
        syncAcceptedRuntimeCaches(words, { scoreMap: scores });
      } else {
        syncAcceptedRuntimeCaches(words);
      }
      setScore(Number(playerState?.score) || 0);
      submissionStatusRef.current.clear();
      resetSubmissionQueue();
      pendingSubmissionRecoveryRef.current = null;
      return;
    }

    if (breakState) {
      roundHandlersRef.current.onBreakStarted?.(breakState);
    }
    pendingSubmissionRecoveryRef.current = null;
    resetSubmissionQueue();
  }

  function hydrateLiveSnapshot(snapshot, entryKind = "resume") {
    if (snapshot?.roomId) {
      currentRoomIdRef.current = snapshot.roomId;
    }
    return liveRoundFeature.hydrateSnapshot(snapshot, { entryKind });
  }

  function syncLiveStateFromServer(reason = "foreground") {
    if (
      !isAccountAuthenticatedRef.current ||
      !socket.connected ||
      !isLoggedInRef.current ||
      appViewRef.current !== "live" ||
      standaloneTrainingSessionRef.current
    ) {
      return Promise.resolve(false);
    }
    if (liveStateSyncInFlightRef.current) {
      return liveStateSyncInFlightRef.current;
    }
    const session = sessionRef.current || loadSessionFromStorage();
    const nick = String(nicknameRef.current || session?.nick || "").trim();
    const roomToUse =
      currentRoomIdRef.current || session?.roomId || roomIdRef.current;
    const install = installIdRef.current || session?.installId;
    if (!nick || !roomToUse || !install) {
      return Promise.reject(new Error("missing_live_session"));
    }

    let requestPromise = null;
    requestPromise = emitSocketAck(
      "session:resume",
      { roomId: roomToUse, installId: install, nick, takeover: false },
      { timeoutMs: 5000 }
    ).then((res) => {
      if (!res?.available || res?.attached === false || !res?.snapshot) {
        throw new Error(res?.error || "live_state_unavailable");
      }
      if (res?.playtimeLimit) applyPlaytimeLimitStatus(res.playtimeLimit);
      setResumeSnapshot(null);
      const hydrated = hydrateLiveSnapshot(res.snapshot, res.entryKind || "resume");
      liveSessionReadyRef.current = hydrated;
      if (!hydrated) throw new Error("live_snapshot_rejected");
      setConnectionError("");
      watchdogFailureCountRef.current = 0;
      scheduleBatchFlush({ immediate: true });
      console.debug(`[foreground] live state synchronized (${reason})`);
      return true;
    }).finally(() => {
      if (liveStateSyncInFlightRef.current === requestPromise) {
        liveStateSyncInFlightRef.current = null;
      }
    });
    liveStateSyncInFlightRef.current = requestPromise;
    return requestPromise;
  }

  function requestSessionResumeSnapshot(reason = "probe") {
    if (!isAccountAuthenticated) return;
    if (!hasSavedSession()) return;
    const session = sessionRef.current;
    const nick = session?.nick?.trim();
    const roomToUse = session?.roomId || roomId;
    const install = session?.installId || installId;
    if (!nick || !roomToUse || !install) return;
    const now = Date.now();
    if (resumeProbeRef.current.inFlight && now - resumeProbeRef.current.lastAt < 2500) return;
    resumeProbeRef.current.inFlight = true;
    resumeProbeRef.current.lastAt = now;
    setResumePending(true);

    const finish = () => {
      resumeProbeRef.current.inFlight = false;
      setResumePending(false);
    };
    const doProbe = () => {
      socket.emit(
        "session:resume",
        { roomId: roomToUse, installId: install, nick, takeover: false },
        (res) => {
          finish();
          const activeSession = sessionRef.current;
          const sameSession =
            activeSession &&
            String(activeSession.nick || "").trim() === nick &&
            activeSession.roomId === roomToUse &&
            activeSession.installId === install;
          if (!sameSession || isLoggedInRef.current) {
            setResumeSnapshot(null);
            return;
          }
          if (res?.error === "auth_required") {
            clearSavedSession();
            setResumeSnapshot(null);
            return;
          }
          if (res?.error === "moderation_banned") {
            clearSavedSession();
            setResumeSnapshot(null);
            setConnectionError(res?.message || "Accès live temporairement suspendu.");
            return;
          }
          if (res?.error === "playtime_limit_exhausted") {
            if (res?.playtimeLimit) applyPlaytimeLimitStatus(res.playtimeLimit);
            clearSavedSession();
            setResumeSnapshot(null);
            setCanResumeSession(false);
            setConnectionError(
              res?.message || "Ton temps de jeu live est écoulé pour aujourd'hui."
            );
            return;
          }
          if (res?.ok && res?.available && res?.snapshot) {
            setResumeSnapshot(res.snapshot);
            setCanResumeSession(true);
          } else {
            setResumeSnapshot(null);
          }
        }
      );
    };

    if (socket.connected) {
      doProbe();
      return;
    }
    const onError = () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      finish();
    };
    const onConnect = () => {
      socket.off("connect_error", onError);
      doProbe();
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
    void connectSocketWithAuth();
  }

  useEffect(() => {
    requestSessionResumeSnapshotRef.current = requestSessionResumeSnapshot;
  });

  function resumeLoginFromSession(reason = "resume") {
    if (!isAccountAuthenticated) return;
    if (!hasSavedSession()) return;
    const session = sessionRef.current;
    const nick = session?.nick?.trim();
    const roomToUse = session?.roomId || roomId;
    const install = session?.installId || installId;
    if (!nick || !roomToUse || !install) return;
    const force = reason === "resume_button";
    const now = Date.now();
    if (resumeLockRef.current) {
      const elapsed = now - (resumeLockAtRef.current || 0);
      if (!force && elapsed < 6000) return;
      resumeLockRef.current = false;
      resumeLockAtRef.current = 0;
    }
    resumeLockRef.current = true;
    resumeLockAtRef.current = now;
    liveSessionReadyRef.current = false;
    setLoginError("");
    setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
    setIsConnecting(true);

    let settled = false;
    const cleanup = () => {
      socket.off("connect", doResume);
      socket.off("connect_error", onResumeError);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      resumeLockRef.current = false;
      resumeLockAtRef.current = 0;
      cleanup();
      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = null;
      }
    };
    const onResumeError = () => {
      setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
      setIsConnecting(false);
      finish();
    };
    let resumeTimeout = setTimeout(() => {
      setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
      setIsConnecting(false);
      finish();
    }, 8000);

    const rejoinCurrentRoom = () => {
      socket.emit("login", { nick, roomId: roomToUse, installId: install }, (loginRes) => {
        if (!loginRes?.ok) {
          setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
          setIsConnecting(false);
          liveSessionReadyRef.current = false;
          return;
        }
        const joinedRoom = loginRes?.roomId || roomToUse;
        persistSession({ nick, roomId: joinedRoom, installId: install });
        lastLoginPayloadRef.current = { nick, roomId: joinedRoom };
        setCurrentRoomId(joinedRoom);
        setRoomId(joinedRoom);
        appViewRef.current = "live";
        setAppView("live");
        isLoggedInRef.current = true;
        setIsLoggedIn(true);
        setIsConnecting(false);
        setLoginError("");
        setConnectionError("");
        if (loginRes?.playtimeLimit) applyPlaytimeLimitStatus(loginRes.playtimeLimit);
        setResumeSnapshot(null);
        const hydrated = hydrateLiveSnapshot(
          loginRes?.snapshot,
          loginRes?.entryKind || "resume"
        );
        liveSessionReadyRef.current = hydrated;
        if (!hydrated) {
          setConnectionError("État de partie indisponible, reconnexion en cours.");
          return;
        }
        scheduleBatchFlush({ immediate: true });
        void requestTrophyStatus();
      });
    };

    const doResume = () => {
      socket.emit(
        "session:resume",
        { roomId: roomToUse, installId: install, nick, takeover: true },
        (res) => {
          finish();
          const activeSession = sessionRef.current;
          const sameSession =
            activeSession &&
            String(activeSession.nick || "").trim() === nick &&
            activeSession.roomId === roomToUse &&
            activeSession.installId === install;
          if (!sameSession) {
            return;
          }
          if (res?.error === "auth_required") {
            clearSavedSession();
            setConnectionError("Session live invalide. Recharge la page.");
            setIsConnecting(false);
            isLoggedInRef.current = false;
            setIsLoggedIn(false);
            return;
          }
          if (res?.error === "moderation_banned") {
            clearSavedSession();
            setConnectionError(res?.message || "Accès live temporairement suspendu.");
            setIsConnecting(false);
            isLoggedInRef.current = false;
            setIsLoggedIn(false);
            return;
          }
          if (res?.error === "playtime_limit_exhausted") {
            if (res?.playtimeLimit) applyPlaytimeLimitStatus(res.playtimeLimit);
            clearSavedSession();
            const message =
              res?.message || "Ton temps de jeu live est écoulé pour aujourd'hui.";
            setConnectionError(message);
            setLoginError(message);
            setIsConnecting(false);
            isLoggedInRef.current = false;
            setIsLoggedIn(false);
            showGlobalRedAnnouncement(
              {
                title: "Contrôle de temps pour joueurs compulsifs",
                body: message,
              },
              6500
            );
            return;
          }
          if (res?.ok && !res?.available) {
            setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
            rejoinCurrentRoom();
            return;
          }
          if (!res?.ok || !res?.snapshot) {
            clearSavedSession();
            setConnectionError("Session expiree");
            setIsConnecting(false);
            isLoggedInRef.current = false;
            setIsLoggedIn(false);
            return;
          }
          persistSession({ nick, roomId: roomToUse, installId: install });
          lastLoginPayloadRef.current = { nick, roomId: roomToUse };
          clearMobileChatReactionToasts();
          appViewRef.current = "live";
          setAppView("live");
          isLoggedInRef.current = true;
          setIsLoggedIn(true);
          setIsConnecting(false);
          setLoginError("");
          setConnectionError("");
          if (res?.playtimeLimit) applyPlaytimeLimitStatus(res.playtimeLimit);
          setResumeSnapshot(null);
          const hydrated = hydrateLiveSnapshot(res.snapshot, res.entryKind || "resume");
          liveSessionReadyRef.current = hydrated;
          if (!hydrated) {
            setConnectionError("État de partie indisponible, reconnexion en cours.");
            return;
          }
          scheduleBatchFlush({ immediate: true });
          void requestTrophyStatus();
        }
      );
    };

    if (socket.connected) {
      doResume();
    } else {
      socket.once("connect", doResume);
      socket.once("connect_error", onResumeError);
      void connectSocketWithAuth();
    }
  }

  useEffect(() => {
    resumeLoginFromSessionRef.current = resumeLoginFromSession;
  });

  useEffect(() => {
    const previousView = previousAppViewRef.current;
    previousAppViewRef.current = appView;
    if (appView !== "live" || previousView === "live") return;
    if (phaseLoopTestEnabledRef.current) return;
    if (!isAccountAuthenticated || !hasSavedSession()) return;
    if (
      liveSessionReadyRef.current &&
      gameplaySessionFeature.store.getState().origin === "live"
    ) {
      return;
    }

    appViewRef.current = "live";
    clearSelection();
    resetSubmissionQueue();
    setInputLocked(true);
    inputLockedRef.current = true;
    setRoundId(null);
    setServerEndsAt(null);
    setServerRoundDurationMs(null);
    setServerStatus("waiting");
    setPhase("lobby");
    setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
    if (isLoggedInRef.current && socket.connected) {
      syncLiveStateFromServer("navigation_to_live").catch(() => {
        resumeLoginFromSessionRef.current?.("navigation_to_live_reconnect");
      });
      return;
    }
    resumeLoginFromSessionRef.current?.("navigation_to_live");
  }, [appView, clearSelection, gameplaySessionFeature, isAccountAuthenticated, socket]);

  function setResultsRankingModeWithPulse(nextMode) {
    if (resultsRankingMode === nextMode) return;
    triggerResultsReorder();
    setResultsRankingMode(nextMode);
  }

  function runHealthCheck(reason = "watchdog") {
    if (!socket.connected) return;
    pingServer(reason)
      .then(() => {
        watchdogFailureCountRef.current = 0;
        console.debug(`[watchdog] pong (${reason})`);
      })
      .catch(() => {
        const failures = (watchdogFailureCountRef.current || 0) + 1;
        watchdogFailureCountRef.current = failures;
        if (failures < WATCHDOG_SOFT_FAILURES_BEFORE_RECONNECT) {
          console.warn(`[watchdog] soft failure (${reason}) #${failures}`);
          return;
        }
        watchdogFailureCountRef.current = 0;
        console.warn(`[watchdog] reconnect (${reason})`);
        intentionalDisconnectRef.current = true;
        socket.disconnect();
        const currentView = appViewRef.current;
        const isCurrentDailyView =
          currentView === "daily" ||
          currentView === "daily_play" ||
          currentView === "daily_results";
        if (isLoggedInRef.current && !isCurrentDailyView) {
          resumeLoginFromSessionRef.current?.("watchdog");
        } else {
          requestSessionResumeSnapshotRef.current?.("watchdog");
        }
      });
  }

  runHealthCheckRef.current = runHealthCheck;

  useEffect(() => {
    const stored = sessionPersistenceFeature.hydrateStoredSession();
    if (stored?.nick && stored?.roomId) {
      if (!nickname) {
        setNickname(stored.nick);
      }
      setCanResumeSession(true);
    }
  }, [isAccountAuthenticated, nickname, sessionPersistenceFeature, setCanResumeSession, setNickname]);

  useEffect(() => {
    if (!isAccountAuthenticated) return;
    if (isDailyView) return;
    if (isLoggedInRef.current || resumeLockRef.current || isConnecting) return;
    const stored = sessionRef.current || loadSessionFromStorage();
    const nick = String(stored?.nick || "").trim();
    const roomToUse = String(stored?.roomId || "").trim();
    const install = String(stored?.installId || "").trim();
    if (!nick || !roomToUse || !install) return;
    const attemptKey = `${authenticatedUserId || "anon"}|${nick}|${roomToUse}|${install}`;
    if (!sessionPersistenceFeature.claimBootResumeAttempt(attemptKey)) return;
    if (!isLiveSessionFreshForBoot(stored)) {
      sessionPersistenceFeature.setAutoResumeEnabled(false);
      return;
    }
    setTimeout(() => {
      resumeLoginFromSessionRef.current?.("boot");
    }, 0);
  }, [authenticatedUserId, isAccountAuthenticated, isConnecting, isDailyView]);

  useEffect(() => {
    return () => {
    };
  }, [isAccountAuthenticated, isDailyView]);

  useEffect(() => {
    return refreshFeature.schedule("weekly-connect", {
      connection: socket,
      run: () => {
        if (phaseRef.current !== "playing") fetchWeeklyStats(true);
      },
    });
  }, []);

  useEffect(() => {
    return refreshFeature.schedule("broadcast-notice", {
      enabled: phase !== "playing",
      intervalMs: 45000,
      run: fetchBroadcastNotice,
    });
  }, [phase]);

  useEffect(() => {
    if (!popupAudienceKey) {
      setPopupDistinctVisitDays(0);
      return;
    }
    const recordVisit = () => {
      const visit = recordDistinctVisitDay(
        popupAudienceKey,
        typeof localStorage !== "undefined" ? localStorage : null
      );
      setPopupDistinctVisitDays(visit.count);
    };
    recordVisit();
    socket.on("connect", recordVisit);
    const unsubscribeViewport = layoutFeature.subscribeViewport(recordVisit, [
      VIEWPORT_EVENTS.PAGE_SHOW,
    ]);
    return () => {
      socket.off("connect", recordVisit);
      unsubscribeViewport();
    };
  }, [layoutFeature, popupAudienceKey]);

  useEffect(() => {
    return refreshFeature.schedule("duel-status", {
      connection: socket,
      enabled: isAccountAuthenticated && phase !== "playing",
      intervalMs: 30000,
      run: fetchDuelStatus,
    });
  }, [installId, isAccountAuthenticated, phase]);

  useEffect(() => {
    if (!isAccountAuthenticated) return;
    if (!accountSeenReady) return;
    const isLobbyView =
      phase === "lobby" &&
      appView !== "daily" &&
      appView !== "daily_play" &&
      appView !== "daily_results" &&
      appView !== "stats" &&
      appView !== "duel" &&
      appView !== "vault";
    if (!isLobbyView) return;
    if (shouldShowTutorial || isNewPlayerPopupQuiet) return;
    if (
      !isAudienceEligibleForPatchNotes({
        accountCreatedAt: authState.user?.createdAt,
        isAuthenticated: isAccountAuthenticated,
        isLegacyConverted: !!authState.user?.isLegacyConverted,
        releaseTimestamp: PATCH_NOTES_RELEASE_TS,
      })
    ) {
      return;
    }
    const accountMarker = buildPatchNotesSeenMarker(PATCH_NOTES_VERSION);
    if (accountSeenMarkers.has(accountMarker)) return;
    patchNotesOpeningRef.current = true;
    setIsPatchNotesOpen(true);
    markAccountSeen(accountMarker);
  }, [
    accountSeenMarkers,
    accountSeenReady,
    authState.user?.createdAt,
    authState.user?.isLegacyConverted,
    isAccountAuthenticated,
    isNewPlayerPopupQuiet,
    markAccountSeen,
    shouldShowTutorial,
    phase,
    appView,
  ]);

  useEffect(() => {
    const isLobbyView =
      phase === "lobby" &&
      appView !== "daily" &&
      appView !== "daily_play" &&
      appView !== "daily_results" &&
      appView !== "stats" &&
      appView !== "duel" &&
      appView !== "vault";
    if (!isLobbyView || !bootReady || bootOverlayVisible) return;
    if (!isAccountAuthenticated || !accountSeenReady) return;
    if (popupDistinctVisitDays < FACEBOOK_INVITE_MIN_DISTINCT_VISIT_DAYS) return;
    if (
      shouldShowTutorial ||
      isNewPlayerPopupQuiet ||
      isPatchNotesOpen ||
      patchNotesOpeningRef.current ||
      isFacebookInviteOpen ||
      duelPopupState?.mode ||
      isSettingsOpen ||
      isAboutOpen ||
      isSupportOpen
    ) {
      return;
    }
    const accountMarker = buildFacebookInviteSeenMarker(FACEBOOK_INVITE_VERSION);
    if (facebookInviteAttemptedAudienceRef.current === accountMarker) return;
    if (accountSeenMarkers.has(accountMarker)) return;
    facebookInviteAttemptedAudienceRef.current = accountMarker;
    markAccountSeen(accountMarker);
    setIsFacebookInviteOpen(true);
  }, [
    accountSeenMarkers,
    accountSeenReady,
    appView,
    bootOverlayVisible,
    bootReady,
    duelPopupState?.mode,
    isAccountAuthenticated,
    isAboutOpen,
    isFacebookInviteOpen,
    isNewPlayerPopupQuiet,
    isPatchNotesOpen,
    isSettingsOpen,
    isSupportOpen,
    phase,
    popupDistinctVisitDays,
    markAccountSeen,
    shouldShowTutorial,
  ]);

  useEffect(() => {
    if (!installId) return;
    const isLobbyView =
      phase === "lobby" &&
      appView !== "daily" &&
      appView !== "daily_play" &&
      appView !== "daily_results" &&
      appView !== "stats" &&
      appView !== "duel" &&
      appView !== "vault";
    if (!isLobbyView) return;
    fetchDuelStatus();
  }, [installId, phase, appView, isAccountAuthenticated]);

  useEffect(() => {
    const dateId = duelStatus?.objectives?.dateId || duelStatus?.dateId || "";
    if (!dateId) {
      setDuelConsumedValidatedByView({
        popup: { dateId: "", keys: [] },
        page: { dateId: "", keys: [] },
      });
      return;
    }
    const saved =
      installId ? readDuelObjectiveAnimationsState(installId, dateId) : null;
    setDuelObjectivesPopupDismissedDateId((prev) => (prev && prev !== dateId ? "" : prev));
    setDuelConsumedValidatedByView(
      saved || {
        popup: { dateId, keys: [] },
        page: { dateId, keys: [] },
      }
    );
  }, [duelStatus?.objectives?.dateId, duelStatus?.dateId, installId]);

  useEffect(() => {
    const dateId = duelStatus?.objectives?.dateId || duelStatus?.dateId || "";
    if (!installId || !dateId) return;
    writeDuelObjectiveAnimationsState(installId, dateId, duelConsumedValidatedByView);
  }, [installId, duelStatus?.objectives?.dateId, duelStatus?.dateId, duelConsumedValidatedByView]);

  useEffect(() => {
    if (!isAccountAuthenticated || !accountSeenReady) return;
    if (!duelStatus?.weekId || !duelStatus?.team) return;
    const isLobbyView =
      phase === "lobby" &&
      appView !== "daily" &&
      appView !== "daily_play" &&
      appView !== "daily_results" &&
      appView !== "stats" &&
      appView !== "duel" &&
      appView !== "vault";
    if (!isLobbyView) return;
    if (shouldShowTutorial || isNewPlayerPopupQuiet) return;
    if (isFacebookInviteOpen) return;
    if (duelPopupState?.mode) return;
    const weekMarker = buildDuelWeekSeenMarker(duelStatus.weekId);
    const tutorialVersion = duelStatus?.tutorialVersion || "duel-v1";
    const tutorialMarker = buildDuelTutorialSeenMarker(tutorialVersion);
    if (
      accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.legacyBaseline) &&
      !accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.legacyDuelWeekConsumed)
    ) {
      markAccountSeen([
        weekMarker,
        ACCOUNT_SEEN_MARKERS.legacyDuelWeekConsumed,
      ]);
      return;
    }
    if (!accountSeenMarkers.has(weekMarker)) {
      setDuelPopupState({
        mode: "team",
        step: 0,
        team: duelStatus.team,
        weekId: duelStatus.weekId,
      });
      return;
    }
    if (!accountSeenMarkers.has(tutorialMarker)) {
      setDuelPopupState({
        mode: "tutorial",
        step: 0,
        team: duelStatus.team,
        weekId: duelStatus.weekId,
      });
      return;
    }
    if (canShowDuelObjectivesPopup()) {
      setDuelPopupState({
        mode: "objectives",
        step: 0,
        team: duelStatus.team,
        weekId: duelStatus.weekId,
      });
    }
  }, [
    accountSeenMarkers,
    accountSeenReady,
    duelStatus?.weekId,
    duelStatus?.team,
    duelStatus?.tutorialVersion,
    duelStatus?.objectives?.dateId,
    duelStatus?.objectives?.objectives,
    duelObjectivesPopupDismissedDateId,
    phase,
    appView,
    isFacebookInviteOpen,
    isAccountAuthenticated,
    isNewPlayerPopupQuiet,
    markAccountSeen,
    shouldShowTutorial,
    duelPopupState?.mode,
  ]);

  useEffect(() => {
    const isLobbyView =
      phase === "lobby" &&
      appView !== "daily" &&
      appView !== "daily_play" &&
      appView !== "daily_results" &&
      appView !== "stats" &&
      appView !== "duel" &&
      appView !== "vault";
    if (isLobbyView) return;
    if (duelPopupState?.mode) {
      setDuelPopupState({ mode: null, step: 0, team: null, weekId: null });
    }
  }, [phase, appView, duelPopupState?.mode]);

  useEffect(() => {
    if (duelPopupState?.mode !== "objectives") return;
    if (duelObjectivesAreCompleted()) {
      setDuelPopupState({ mode: null, step: 0, team: null, weekId: null });
    }
  }, [duelPopupState?.mode, duelStatus?.objectives?.objectives]);

  useEffect(() => {
    const isHomeLobby = !isLoggedIn && phase === "lobby" && appView === "home";
    if (!isHomeLobby) return;
    if (!isAccountAuthenticated) return;
    if (!accountSeenReady) return;
    if (!wordVault.loaded || wordVault.loading || wordVault.error) return;
    if (!Array.isArray(wordVault.words) || wordVault.words.length === 0) return;
    if (vaultWordOfDayPopup.open) return;
    if (
      shouldShowTutorial ||
      isNewPlayerPopupQuiet ||
      isPatchNotesOpen ||
      patchNotesOpeningRef.current ||
      isFacebookInviteOpen ||
      duelPopupState?.mode ||
      definitionModal.open ||
      isAccountMenuOpen ||
      isSettingsOpen ||
      isAboutOpen ||
      isSupportOpen ||
      isHomeChatOpen ||
      isPlayersOverlayOpen ||
      broadcastNotice.loading ||
      !bootReady ||
      bootOverlayVisible
    ) {
      return;
    }

    const broadcastKey = getBroadcastMessageKey(broadcastNotice?.message);
    if (broadcastKey) {
      const broadcastMarker = buildBroadcastSeenMarker(broadcastKey);
      if (!accountSeenMarkers.has(broadcastMarker)) return;
    }

    const dateId = getParisDateIdClient();
    const accountMarker = buildVaultWordOfDaySeenMarker(dateId);
    if (accountSeenMarkers.has(accountMarker)) return;
    if (vaultWordOfDayAttemptedRef.current.has(accountMarker)) return;
    vaultWordOfDayAttemptedRef.current.add(accountMarker);

    const requestId = ++vaultWordOfDayRequestIdRef.current;
    let cancelled = false;
    (async () => {
      const candidates = pickVaultWordOfDayCandidates(wordVault.words);
      for (const candidate of candidates) {
        if (cancelled || requestId !== vaultWordOfDayRequestIdRef.current) return;
        const result = await fetchDefinitionSummaryForWordOfDay(candidate.word).catch(() => null);
        if (!result?.definition) continue;
        if (cancelled || requestId !== vaultWordOfDayRequestIdRef.current) return;
        setVaultWordOfDayPopup({
          open: true,
          dateId,
          word: result.word || candidate.word,
          displayWord: result.displayWord || candidate.word,
          definition: result.definition,
          source: result.source || "",
          url: result.url || "",
        });
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accountSeenMarkers,
    accountSeenReady,
    appView,
    bootOverlayVisible,
    bootReady,
    broadcastNotice.loading,
    broadcastNotice?.message,
    definitionModal.open,
    duelPopupState?.mode,
    isAboutOpen,
    isAccountAuthenticated,
    isAccountMenuOpen,
    isHomeChatOpen,
    isFacebookInviteOpen,
    isLoggedIn,
    isNewPlayerPopupQuiet,
    isPatchNotesOpen,
    isPlayersOverlayOpen,
    isSettingsOpen,
    isSupportOpen,
    phase,
    shouldShowTutorial,
    vaultWordOfDayPopup.open,
    wordVault.error,
    wordVault.loaded,
    wordVault.loading,
    wordVault.words,
  ]);

  useEffect(() => {
    weeklyStatsSnapshotRef.current = weeklyStats;
    if (tournamentBaselineRef.current.id && !tournamentBaselineRef.current.weeklyStats) {
      tournamentBaselineRef.current.weeklyStats = weeklyStats;
    }
  }, [weeklyStats]);

  useEffect(() => {
    if (isDailyView) return;
    if (!installId) return;
    fetchVocabStats();
  }, [installId, isDailyView]);

  useEffect(() => {
    if (appView !== "daily") return;
    setDailyHistoryIndex(0);
    setDailyRankingView("today");
    if (dailyHistoryScrollRef.current) {
      dailyHistoryScrollRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [
    appView,
    Array.isArray(dailyHistory?.days) ? dailyHistory.days.length : 0,
    Array.isArray(dailyHistory?.crownTotals) ? dailyHistory.crownTotals.length : 0,
  ]);

  useEffect(() => {
    const shouldOpenStats = appView === "stats";
    if (shouldOpenStats === isWeeklyOpen) return;
    setIsWeeklyOpen(shouldOpenStats);
  }, [appView, isWeeklyOpen]);

  useEffect(() => {
    const onConnect = () => {
      if (isDailyView) return;
      if (!installId) return;
      fetchVocabStats();
    };
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
  }, [installId, isDailyView]);

  useEffect(() => {
    const onRoomsStats = (payload) => {
      setRoomsStats(Array.isArray(payload) ? payload : []);
    };
    socket.on("roomsStats", onRoomsStats);
    return () => socket.off("roomsStats", onRoomsStats);
  }, []);

  useEffect(() => {
    return refreshFeature.schedule("lobby-players", {
      connection: socket,
      enabled: !isLoggedIn,
      intervalMs: appView === "home" ? 6000 : 0,
      run: fetchLobbyPlayers,
    });
  }, [appView, isLoggedIn, roomId]);

  useEffect(() => {
    if (isLoggedIn) {
      lobbyPresenceRef.current = new Set();
      setHomeChatUnreadCount(0);
      setHomeChatBotUnreadCount(0);
      if (isHomeChatOpen) setIsHomeChatOpen(false);
      lobbyChatSubscriptionRef.current = {
        roomId: null,
        subscribed: false,
        inFlight: false,
        connectPending: false,
      };
    }
  }, [isLoggedIn, isHomeChatOpen]);

  useEffect(() => {
    if (isLoggedIn) return;
    if (appView !== "home") return;
    if (!isAccountAuthenticated) return;
    fetchDailyStatus();
  }, [isLoggedIn, appView, isAccountAuthenticated, installId]);

  useEffect(() => {
    const isHomeLobbyView = !isLoggedIn && appView === "home";
    if (!isHomeLobbyView && isHomeChatOpen) {
      setIsHomeChatOpen(false);
    }
  }, [isLoggedIn, appView, isHomeChatOpen]);

  useEffect(() => {
    if (isLoggedIn) return;
    if (!isHomeChatOpen && !isChatOpenMobile) return;
    subscribeLobbyChat({ force: true });
  }, [isLoggedIn, isHomeChatOpen, isChatOpenMobile, roomId]);

  useEffect(() => {
    if (!isWeeklyOpen || statsTab !== "weekly") {
      if (weeklyArrowTimerRef.current) {
        clearTimeout(weeklyArrowTimerRef.current);
        weeklyArrowTimerRef.current = null;
      }
      if (weeklyArrowBlinkTimerRef.current) {
        clearTimeout(weeklyArrowBlinkTimerRef.current);
        weeklyArrowBlinkTimerRef.current = null;
      }
      if (weeklyArrowBumpTimerRef.current) {
        clearTimeout(weeklyArrowBumpTimerRef.current);
        weeklyArrowBumpTimerRef.current = null;
      }
      setWeeklyArrowVisible(false);
      setWeeklyArrowBlink(false);
      setWeeklyArrowBump(false);
      return;
    }
    const firstOpen = !weeklyArrowSeenRef.current;
    if (firstOpen) {
      weeklyArrowSeenRef.current = true;
    }
    triggerWeeklyArrowHint({ blink: firstOpen, showForMs: firstOpen ? 2600 : 1600 });
  }, [isWeeklyOpen, statsTab]);

  useEffect(() => {
    if (!isWeeklyOpen) return;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isKeyboardEditableTarget(e.target)) return;
      if (
        authModalMode ||
        definitionModal.open ||
        isChatRulesOpen ||
        isSettingsOpen ||
        roundPlayerModal.open ||
        userMenu.open
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeWeeklyStatsOverlay();
        return;
      }
      if (isMobileLayout) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (statsTab === "season") shiftSeasonPage(-1);
        else shiftWeeklyBoard(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (statsTab === "season") shiftSeasonPage(1);
        else shiftWeeklyBoard(1);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        if (statsTab === "season") goToSeasonPage(0);
        else goToWeeklyBoard(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        if (statsTab === "season") goToSeasonPage(getSeasonPages().length - 1);
        else goToWeeklyBoard(WEEKLY_BOARDS.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    authModalMode,
    definitionModal.open,
    isChatRulesOpen,
    isMobileLayout,
    isSettingsOpen,
    isWeeklyOpen,
    roundPlayerModal.open,
    statsTab,
    userMenu.open,
    weeklyActiveIndex,
  ]);

  useEffect(() => {
    if (!isWeeklyOpen) return;
    if (statsTab === "season") {
      void requestTrophyStatus();
      const currentTopN = Number.isFinite(weeklyStats?.topN) ? weeklyStats.topN : 0;
      if (currentTopN < STATS_SEASON_TARGET_LIMIT) {
        fetchWeeklyStats(true, STATS_SEASON_TARGET_LIMIT);
      }
    }
  }, [isWeeklyOpen, statsTab, weeklyStats?.topN]);

  useEffect(() => {
    if (statsTab !== "season") return;
    seasonSwipeTrack.settle(0);
    setSeasonActiveIndex(0);
    seasonTouchRef.current.startX = null;
    seasonTouchRef.current.startY = null;
    seasonTouchRef.current.fromScrollable = false;
    seasonTouchRef.current.fromProfileButton = false;
    seasonTouchRef.current.gestureAxis = "none";
    seasonTouchRef.current.dragging = false;
  }, [statsTab]);

  useEffect(() => {
    return () => {
      const inFlight = weeklyFetchStateRef.current;
      if (inFlight?.controller) {
        try {
          inFlight.controller.abort();
        } catch (_) {}
      }
      weeklyFetchStateRef.current = {
        controller: null,
        topN: null,
        startedAt: 0,
      };
    };
  }, []);

  useEffect(() => {
    if (!isPlayersOverlayOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        closePlayersOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPlayersOverlayOpen]);

  useEffect(() => {
    resultsFeature.configureTiming({
      breakKind,
      fadeDurationMs: MOBILE_ROUND_INTRO_RESULTS_FADE_MS,
      isMobileLayout,
      nextStartAt,
      nowServerMs: getNowServerMs,
      phase,
      preparationGraceMs: ROUND_PREPARATION_FALLBACK_GRACE_MS,
    });
  }, [breakKind, isMobileLayout, nextStartAt, phase, resultsFeature, roundId]);

  function handleForeground(reason = "foreground") {
    const now = Date.now();
    if (now - foregroundAttemptRef.current < 800) return;
    foregroundAttemptRef.current = now;
    if (!isAccountAuthenticatedRef.current) {
      lastBackgroundTimeRef.current = 0;
      return;
    }
    if (!hasSavedSession() && !isLoggedInRef.current) {
      lastBackgroundTimeRef.current = 0;
      return;
    }
    const currentView = appViewRef.current;
    const isCurrentDailyView =
      currentView === "daily" ||
      currentView === "daily_play" ||
      currentView === "daily_results";
    const canAutoResume =
      isLoggedInRef.current &&
      !isCurrentDailyView &&
      !standaloneTrainingSessionRef.current;
    const shouldRestoreSession =
      canAutoResume ||
      (!!hasSavedSession() && currentView === "live");
    const synchronizeOrRecoverLive = (syncReason) => {
      if (!canAutoResume || !socket.connected) {
        runHealthCheck(syncReason);
        return;
      }
      syncLiveStateFromServer(syncReason).catch((error) => {
        console.warn(`[foreground] live state sync failed (${syncReason})`, error);
        intentionalDisconnectRef.current = true;
        socket.disconnect();
        resumeLoginFromSessionRef.current?.(`${syncReason}_reconnect`);
      });
    };
    const lastBackgroundTime = lastBackgroundTimeRef.current;
    const timeSinceBackground =
      lastBackgroundTime > 0 ? Date.now() - lastBackgroundTime : 0;
    const shouldForceReconnect = timeSinceBackground > 5000;
    if (shouldForceReconnect) {
      lastBackgroundTimeRef.current = 0;
      if (!socket.connected) {
        if (shouldRestoreSession) {
          attemptSilentReconnect(`${reason}_post_bg`);
        } else {
          void connectSocketWithAuth();
        }
        return;
      }
      synchronizeOrRecoverLive(`${reason}_post_bg`);
      return;
    }
    if (lastBackgroundTime) {
      lastBackgroundTimeRef.current = 0;
    }
    if (!socket.connected) {
      if (shouldRestoreSession) {
        attemptSilentReconnect(reason);
      } else {
        void connectSocketWithAuth();
      }
      return;
    }
    synchronizeOrRecoverLive(reason);
  }

  handleForegroundRef.current = handleForeground;

  function handleManualRefresh() {
    if (manualRefreshTimerRef.current) {
      clearTimeout(manualRefreshTimerRef.current);
      manualRefreshTimerRef.current = null;
    }
    try {
      intentionalDisconnectRef.current = true;
      socket.disconnect();
    } catch (_) {}
    manualRefreshTimerRef.current = setTimeout(() => {
      manualRefreshTimerRef.current = null;
      void connectSocketWithAuth();
    }, 300);
  }

  useEffect(() => {
    connectionFeature.configure({
      connection: socket,
      onForeground: (reason) => handleForegroundRef.current?.(reason),
      onHealthCheck: (reason) => runHealthCheckRef.current?.(reason),
      standaloneTrainingActive: !!standaloneTrainingSession,
      subscribePageShow: (listener) =>
        layoutFeature.subscribeViewport(listener, [VIEWPORT_EVENTS.PAGE_SHOW]),
    });
  }, [connectionFeature, layoutFeature, standaloneTrainingSession]);


  function handleLogin(e) {
    if (e) e.preventDefault();
    if (loginInFlightRef.current || isConnecting) return;
    if (!ensureAuthenticated({ source: "live" })) {
      return;
    }
    const nick = nickname.trim();
    if (!nick) {
      setLoginError("Choisis un pseudo");
      return;
    }
    if (nick.length > 25) {
      setLoginError("25 caracteres max");
      return;
    }

    loginInFlightRef.current = true;
    liveSessionReadyRef.current = false;
    setIsConnecting(true);
    setLoginError("");
    setConnectionError("");
    lastLoginPayloadRef.current = { nick, roomId };
    connectionFeature.cancelDisconnectGrace();
    reconnectAttemptRef.current = false;

    const attemptLogin = () => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (loginTimeout) clearTimeout(loginTimeout);
      };
      const loginTimeout = setTimeout(() => {
        finish();
        loginInFlightRef.current = false;
        setLoginError("Connexion timeout");
        setIsConnecting(false);
      }, 6000);
      socket.emit("login", { nick, roomId, installId }, (res) => {
        finish();
        loginInFlightRef.current = false;
        if (!res?.ok) {
          if (res?.error === "pseudo_taken") {
            setLoginError("Pseudo deja utilise");
          } else if (res?.error === "nick_too_long") {
            setLoginError("25 caracteres max");
          } else if (res?.error === "auth_required") {
            setLoginError("Connecte-toi à ton compte.");
            if (socket.connected) {
              socket.disconnect();
            }
            openAuthDialog(AUTH_MODAL_MODES.LOGIN);
          } else if (res?.error === "moderation_banned") {
            clearSavedSession();
            setLoginError(res?.message || "Accès live temporairement suspendu.");
            setConnectionError(res?.message || "Accès live temporairement suspendu.");
          } else if (res?.error === "playtime_limit_exhausted") {
            if (res?.playtimeLimit) applyPlaytimeLimitStatus(res.playtimeLimit);
            clearSavedSession();
            const message =
              res?.message || "Ton temps de jeu live est écoulé pour aujourd'hui.";
            setLoginError(message);
            setConnectionError(message);
            showGlobalRedAnnouncement(
              {
                title: "Contrôle de temps pour joueurs compulsifs",
                body: message,
              },
              6500
            );
          } else if (res?.error === "invalid_room") {
            setLoginError("Salle indisponible");
          } else if (res?.error === "invalid_install_id") {
            setLoginError("Identifiant appareil invalide");
          } else {
            setLoginError("Connexion refusee");
          }
          setIsConnecting(false);
          return;
        }

        const joinedRoom = res?.roomId || roomId;
        if (res?.playtimeLimit) applyPlaytimeLimitStatus(res.playtimeLimit);
        lastLoginPayloadRef.current = { nick, roomId: joinedRoom };
        persistSession({ nick, roomId: joinedRoom, installId });
        sessionPersistenceFeature.setAutoResumeEnabled(true);
        setCurrentRoomId(joinedRoom);
        setRoomId(joinedRoom);
        const nextSize = getGridSizeForRoom(joinedRoom);
        setGridSize(nextSize);
        setBoard(Array(nextSize * nextSize).fill({ letter: "?", bonus: null }));
        setResumeSnapshot(null);
        clearMobileChatReactionToasts();
        appViewRef.current = "live";
        setAppView("live");
        isLoggedInRef.current = true;
        setIsLoggedIn(true);
        setIsConnecting(false);
        setServerStatus("waiting");
        setScore(0);
        void requestTrophyStatus();
        const hydrated = phaseLoopTestEnabledRef.current
          ? true
          : hydrateLiveSnapshot(res?.snapshot, res?.entryKind || "join");
        liveSessionReadyRef.current = hydrated;
        if (!hydrated) {
          setConnectionError("État de partie indisponible, reconnexion en cours.");
          attemptSilentReconnectRef.current?.("login_snapshot_missing");
        }
        try {
          localStorage.setItem("boggle_nick", nick);
        } catch (_) {}
      });
    };

    const onConnectError = () => {
      loginInFlightRef.current = false;
      setLoginError("Impossible de joindre le serveur");
      setIsConnecting(false);
      socket.off("connect", attemptLogin);
    };

    socket.once("connect_error", onConnectError);

    if (socket.connected) {
      syncServerTime(attemptLogin);
    } else {
      connectSocketWithAuth().then((connected) => {
        if (!connected) {
          onConnectError();
          return;
        }
        socket.off("connect_error", onConnectError);
        syncServerTime(attemptLogin);
      });
    }
  }

  function openTutorial({ pendingLogin = false } = {}) {
    setTutorialPendingLogin(pendingLogin);
    setIsTutorialOpen(true);
  }

  function completeTutorial() {
    setIsTutorialOpen(false);
    setTutorialPendingLogin(false);
    markAccountSeen(ACCOUNT_SEEN_MARKERS.mainTutorial);
    if (tutorialPendingLogin) {
      handleLogin();
    }
  }

  function openTutorialFromHome() {
    openTutorial({ pendingLogin: false });
  }

  function handleLoginOrResume(e) {
    if (e) e.preventDefault();
    requestAudioUnlock(e);
    if (isAccountAuthenticated && !accountSeenReady) {
      showToast("Synchronisation du compte en cours…", 1800);
      return;
    }
    if (!isTutorialOpen && shouldShowTutorial) {
      openTutorial({ pendingLogin: true });
      return;
    }
    handleLogin();
  }

  function handleResumeFromPrompt(e) {
    requestAudioUnlock(e);
    if (!hasSavedSession()) {
      setResumeSnapshot(null);
      setResumePending(false);
      return;
    }
    resumeLoginFromSession("resume_button");
  }

  function dismissResumePrompt() {
    setResumeSnapshot(null);
  }

  function openHomeAccount() {
    if (isAccountAuthenticated || isAuthStatusPending || isAuthServerUnavailable) {
      setIsAccountMenuOpen(true);
      return;
    }
    const nextMode =
      authState.status === "legacy_profile_found"
        ? AUTH_MODAL_MODES.CLAIM_LEGACY
        : authState.status === "login_required"
        ? AUTH_MODAL_MODES.LOGIN
        : AUTH_MODAL_MODES.REGISTER;
    openAuthDialog(nextMode);
  }

  function startGameFromServer(
    serverGrid,
    newRoundId,
    durationMs,
    endsAt,
    sourceRoomId = null,
    incomingGridSize = null,
    specialInfo = null,
    gridQuality = null,
    nextSpecial = null,
    incomingTargetHintScheduleMs = [],
    roundLifecycle = null
  ) {
    invalidateGameplaySession();
    const serverSolutions = hydrateServerSolutionsPayload(roundLifecycle?.solutions, {
      disableRareBonus: !isRareBonusEnabledForSpecial(specialInfo),
    });
    const incomingCultureThemeChallenge = setCultureThemeChallengeRuntime(
      roundLifecycle?.cultureThemeChallenge || null
    );
    markSolutionMapWithCultureTheme(serverSolutions.solved, incomingCultureThemeChallenge);
    serverSolutions.all = markEntriesWithCultureTheme(
      serverSolutions.all,
      incomingCultureThemeChallenge
    );
    const derivedSize =
      incomingGridSize ||
      Math.max(1, Math.round(Math.sqrt((serverGrid || []).length || gridSize * gridSize)));
    commitTraceSelection([], []);
    setAnalysis(null);
    setHighlightPlayers([]);
    setScoreFlights([]);
    clearToasts();
    solutionsRef.current = new Map();
    serverAllWordsRef.current = [];
    serverSolutionsReadyRef.current = false;
    bestGridMaxRef.current = 0;
    bestGridMaxLenRef.current = 0;
    serverSolutionsReadyRef.current = serverSolutions.ready;
    clearAcceptedRuntimeCaches();
    resetSubmissionQueue();
    progressFeature.reset();
    feedFeature.reset();
    rosterFeature.setProvisionalRanking([]);
    if (serverSolutions.ready) {
      solutionsRef.current = serverSolutions.solved;
      serverAllWordsRef.current = serverSolutions.all;
    }
    if (specialInfo?.type !== "target_long" && specialInfo?.type !== "target_score") {
      setSpecialHint(null);
    }
    setSpecialSolvedOverlay(null);
    setFoundTargetThisRound(false);
    setFoundTargetWord("");
    setTargetHintScheduleMs(
      Array.isArray(incomingTargetHintScheduleMs)
        ? incomingTargetHintScheduleMs.filter((value) => Number.isFinite(value) && value >= 0)
        : []
    );
    if (false && specialInfo?.isSpecial) {
      setAnnouncements((prev) => [
        {
          id: Date.now() + Math.random(),
          ts: Date.now(),
          type: "special_start",
          text:
            specialInfo.type === "speed"
              ? `MANCHE SPéCIALE : ${specialInfo.label} - tous les mots valent ${specialInfo.fixedWordScore} pts`
              : `MANCHE SPéCIALE : ${specialInfo.label} - gros potentiel de points et de mots longs`,
        },
        ...prev,
      ]);
    }
    const solutionMaxPts = serverSolutions.ready && serverSolutions.all.length
      ? Math.max(...serverSolutions.all.map((entry) => Number(entry?.pts) || 0))
      : null;
    const solutionMaxLen = serverSolutions.ready && serverSolutions.all.length
      ? Math.max(...serverSolutions.all.map((entry) => normalizeWord(entry?.word).length || 0))
      : null;
    const stats =
      gridQuality && typeof gridQuality === "object"
        ? {
            words: gridQuality.words ?? null,
            totalPts: gridQuality.possibleScore ?? gridQuality.totalPts ?? gridQuality.maxPts ?? null,
            maxPts:
              Number.isFinite(solutionMaxPts) && solutionMaxPts > 0
                ? solutionMaxPts
                : gridQuality.maxPts ?? null,
            maxLen:
              Number.isFinite(solutionMaxLen) && solutionMaxLen > 0
                ? solutionMaxLen
                : gridQuality.maxLen ?? null,
            longWords: gridQuality.longWords ?? null,
            fakeTwinWords: gridQuality.fakeTwinWords ?? null,
          }
        : null;
    bestGridMaxRef.current = stats?.maxPts ?? 0;
    bestGridMaxLenRef.current = stats?.maxLen ?? 0;
    clearStatusMessage({ force: true });
    bestWordAnnounceRef.current = -1;
    clearQueuedRankingUpdate();
    const normalizedDurationMs = Number.isFinite(durationMs)
      ? Math.max(1, Math.round(durationMs))
      : null;
    const maxDuration =
      Number.isFinite(normalizedDurationMs)
        ? Math.max(1, Math.round(normalizedDurationMs / 1000))
        : ROOM_OPTIONS[sourceRoomId || currentRoomId || roomId]?.duration ??
          DEFAULT_DURATION;
    const effectiveEndsAt = Number.isFinite(endsAt)
      ? Number(endsAt)
      : Number.isFinite(normalizedDurationMs)
      ? getNowServerMs() + normalizedDurationMs
      : null;
    const initialTick = Number.isFinite(effectiveEndsAt)
      ? Math.max(0, Math.ceil((effectiveEndsAt - getNowServerMs()) / 1000))
      : maxDuration;
    const roundKey = newRoundId || null;
    const startsAtMs = Number.isFinite(roundLifecycle?.startsAt)
      ? Math.max(0, Number(roundLifecycle.startsAt))
      : Number.isFinite(effectiveEndsAt) && Number.isFinite(normalizedDurationMs)
      ? Math.max(0, effectiveEndsAt - normalizedDurationMs)
      : null;
    const introMs = Number.isFinite(roundLifecycle?.introMs)
      ? Math.max(0, Math.round(Number(roundLifecycle.introMs)))
      : 0;
    const roundStatus =
      typeof roundLifecycle?.status === "string" ? roundLifecycle.status : "running";
    roundIntroServerWindowRef.current = {
      roundId: roundKey,
      startsAt: startsAtMs,
      introMs,
      status: roundStatus,
    };
    const nowServerMs = getNowServerMs();
    const hasPendingIntro =
      roundStatus === "intro" &&
      Number.isFinite(startsAtMs) &&
      startsAtMs > nowServerMs + 80;
    mobileRoundIntroSuppressRoundStartRef.current = hasPendingIntro;
    inputLockedRef.current = hasPendingIntro;
    setMobileRoundIntroHideTiles(hasPendingIntro);
    if (!hasPendingIntro) {
      roundIntroStartedForRoundRef.current = roundKey;
    } else if (roundIntroStartedForRoundRef.current !== roundKey) {
      roundIntroStartedForRoundRef.current = null;
    }
    const roundEndAt = Number.isFinite(effectiveEndsAt) ? effectiveEndsAt : null;
    const roundStartAt =
      Number.isFinite(effectiveEndsAt) && Number.isFinite(normalizedDurationMs)
        ? effectiveEndsAt - normalizedDurationMs
        : null;
    lastRoundWindowRef.current = { startAt: roundStartAt, endAt: roundEndAt };
    clockFeature.setCountdown(Math.min(maxDuration, initialTick));
    applicationKernel.commands.transition.apply({
      game: {
        allWords: [],
        board: serverGrid,
        ...(sourceRoomId
          ? { currentRoomId: sourceRoomId, roomId: sourceRoomId }
          : {}),
        gridSize: derivedSize,
        inputLocked: hasPendingIntro,
        phase: "playing",
        showAllWords: false,
      },
      realtime: {
        finalResults: [],
        roundId: newRoundId || null,
        roundStats: stats,
        serverEndsAt: Number.isFinite(effectiveEndsAt) ? effectiveEndsAt : null,
        serverRoundDurationMs: normalizedDurationMs,
        specialRound: specialInfo && specialInfo.isSpecial ? specialInfo : null,
      },
      session: {
        connectionError: "",
        serverStatus: "running",
      },
    });
    if (!isMobileLayoutRef.current) {
      const chatEl = chatInputRef.current;
      const chatHasFocus =
        chatEl &&
        typeof document !== "undefined" &&
        document.activeElement === chatEl;
      if (!chatHasFocus) {
        setActiveArea("game");
      }
    }
  }

  useEffect(() => {
    startGameFromServerRef.current = startGameFromServer;
  });

  useEffect(() => {
    const shouldRunLoop =
      phaseLoopTestEnabled && isLoggedIn && !isDailyView && appView === "live";
    if (!shouldRunLoop) {
      clearPhaseLoopTimer();
      return;
    }

    let cancelled = false;
    phaseLoopRoundCounterRef.current = 0;
    stopImplodePhase();

    const schedule = (fn, delayMs) => {
      clearPhaseLoopTimer();
      phaseLoopTimerRef.current = setTimeout(() => {
        phaseLoopTimerRef.current = null;
        if (cancelled) return;
        if (applicationKernel.getState().navigation.view !== "live") return;
        fn();
      }, Math.max(0, Math.round(delayMs)));
    };

    const enterResultsPhase = () => {
      if (cancelled) return;
      gameplaySessionFeature.transitionPhase("results", {
        roomId: currentRoomIdRef.current || roomId,
      });
      inputLockedRef.current = false;
      applicationKernel.commands.transition.apply({
        game: { inputLocked: false, phase: "results" },
        realtime: {
          breakKind: "phase_loop",
          nextStartAt: Date.now() + DEV_PHASE_LOOP_RESULTS_MS,
          roundId: null,
          serverEndsAt: null,
          serverRoundDurationMs: null,
        },
        session: { serverStatus: "break" },
      });
      schedule(startIntroAndPlayingPhase, DEV_PHASE_LOOP_RESULTS_MS);
    };

    const startIntroAndPlayingPhase = () => {
      if (cancelled) return;
      const sourceRoomId = currentRoomIdRef.current || roomId;
      const loopGridSize = getGridSizeForRoom(sourceRoomId) || gridSize || 4;
      const loopGrid = generateGrid(loopGridSize);
      const nowServerMs = getNowServerMs();
      const startsAt = nowServerMs + DEV_PHASE_LOOP_INTRO_MS;
      const endsAt = startsAt + DEV_PHASE_LOOP_PLAYING_MS + DEV_PHASE_LOOP_PLAYING_GUARD_MS;
      phaseLoopRoundCounterRef.current += 1;
      const devRoundId = `phase-loop-${phaseLoopRoundCounterRef.current}-${Date.now()}`;
      applicationKernel.commands.realtime.patch({ breakKind: null, nextStartAt: null });
      gameplaySessionFeature.startRound(
        {
          roomId: sourceRoomId,
          roundId: devRoundId,
          startsAt,
          endsAt,
          status: "intro",
        },
        { origin: "dev", entryKind: "dev" }
      );
      startGameFromServerRef.current?.(
        loopGrid,
        devRoundId,
        endsAt - startsAt,
        endsAt,
        sourceRoomId,
        loopGridSize,
        null,
        null,
        null,
        [],
        {
          startsAt,
          introMs: DEV_PHASE_LOOP_INTRO_MS,
          status: "intro",
        }
      );
      schedule(enterResultsPhase, DEV_PHASE_LOOP_INTRO_MS + DEV_PHASE_LOOP_PLAYING_MS);
    };

    enterResultsPhase();

    return () => {
      cancelled = true;
      clearPhaseLoopTimer();
    };
  }, [
    phaseLoopTestEnabled,
    isLoggedIn,
    isDailyView,
    appView,
    roomId,
    gridSize,
    clearPhaseLoopTimer,
    stopImplodePhase,
  ]);

  function cancelAllWordsCompute() {
    const job = allWordsComputeRef.current;
    if (job.kickoff) {
      clearTimeout(job.kickoff);
      job.kickoff = null;
    }
    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }
    if (job.idle && typeof window !== "undefined" && window.cancelIdleCallback) {
      try {
        window.cancelIdleCallback(job.idle);
      } catch (_) {}
      job.idle = null;
    }
    job.key = null;
  }

  useEffect(
    () => () => {
      cancelAllWordsCompute();
      disposeClientSolverWorker("application_disposed");
    },
    []
  );

  function finalizeAllWords(rawSolutions, sourceBoard = board, opts = {}) {
    const updateBestRefs = opts.updateBestRefs !== false;
    if (!sourceBoard || sourceBoard.length === 0) return [];
    const entries = Array.isArray(rawSolutions) ? rawSolutions : [];
    const solved = new Map(entries.map((entry) => [entry.word, entry]));
    solutionsRef.current = solved;

    const all = entries.map((entry) => ({
      ...entry,
      pts:
        Number.isFinite(entry?.pts)
          ? entry.pts
          : computeScore(entry.word, entry?.path || [], sourceBoard, specialScoreConfig),
      path: Array.isArray(entry?.path) ? entry.path : [],
      usedFakeTwins: !!entry?.usedFakeTwins,
      fakeTwinsCompletionWord: !!entry?.usedFakeTwins,
      fakeTwinsBonusOnly: !!entry?.fakeTwinsBonusOnly,
      cultureThemeWord: isCurrentCultureThemeWord(entry.word),
    }));

    all.sort((a, b) => b.pts - a.pts);
    const maxPts = all.length ? all[0].pts : 0;
    const maxLen = all.length
      ? Math.max(...all.map(({ word }) => normalizeWord(word).length))
      : 0;
    if (updateBestRefs) {
      bestGridMaxRef.current = maxPts;
      bestGridMaxLenRef.current = maxLen;
    }
    return all;
  }

  function buildAllWordsLocal(sourceBoard = board, opts = {}) {
    const updateBestRefs = opts.updateBestRefs !== false;
    if (!dictionary) return [];
    if (!sourceBoard || sourceBoard.length === 0) return [];
    const filtered = filterDictionary(dictionary, sourceBoard, specialScoreConfig);
    const solved = solveAll(sourceBoard, filtered, specialScoreConfig);
    const serialized = Array.from(solved.entries()).map(([word, meta]) => ({
      word,
      pts: Number.isFinite(meta?.pts) ? meta.pts : 0,
      path: Array.isArray(meta?.path) ? meta.path : [],
      usedFakeTwins: !!meta?.usedFakeTwins,
      fakeTwinsCompletionWord: !!meta?.usedFakeTwins,
      fakeTwinsBonusOnly: false,
    }));
    return finalizeAllWords(serialized, sourceBoard, { updateBestRefs });
  }

  function scheduleAllWordsCompute(
    sourceBoard,
    { updateBestRefs = true, jobKey, delayMs } = {}
  ) {
    // Guard: never compute solveAll during playing.
    if (phaseRef.current === "playing" && !LIVE_SOLVER_DURING_PLAY) return;
    cancelAllWordsCompute();
    if (!dictionary || dictionary.size === 0) return;
    if (!sourceBoard || sourceBoard.length === 0) return;

    const key = jobKey || `solve-${Date.now()}-${Math.random()}`;
    allWordsComputeRef.current.key = key;

    const run = async () => {
      if (allWordsComputeRef.current.key !== key) return;
      let all = [];
      try {
        if (DEV_MODE) {
          console.info("[solver-worker] solveAll start", {
            phase: phaseRef.current,
            size: sourceBoard.length,
          });
        }
        const rawSolutions = await solveGridInWorker(sourceBoard, specialScoreConfig);
        if (allWordsComputeRef.current.key !== key) return;
        all = finalizeAllWords(rawSolutions, sourceBoard, { updateBestRefs });
      } catch (error) {
        if (DEV_MODE) {
          console.warn("[solver-worker] fallback main thread", error);
        }
        all = buildAllWordsLocal(sourceBoard, { updateBestRefs });
      }
      if (allWordsComputeRef.current.key !== key) return;
      setAllWords(all);
    };

    const kickoff = () => {
      if (typeof window !== "undefined" && window.requestIdleCallback) {
        allWordsComputeRef.current.idle = window.requestIdleCallback(run, {
          timeout: 15000,
        });
      } else {
        allWordsComputeRef.current.timer = setTimeout(run, 600);
      }
    };

    const kickoffDelay =
      typeof delayMs === "number" && Number.isFinite(delayMs)
        ? Math.max(0, Math.round(delayMs))
        : 4500;
    allWordsComputeRef.current.kickoff = setTimeout(kickoff, kickoffDelay);
  }

  function attemptSilentReconnect(reason = "reconnect") {
    if (reconnectAttemptRef.current) return;
    reconnectAttemptRef.current = true;
    setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
    const finishAttempt = () => {
      setTimeout(() => {
        reconnectAttemptRef.current = false;
      }, 3000);
    };
    const restoreSession = (connected) => {
      if (!connected) {
        setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
        return;
      }
      const shouldRestoreLive =
        appViewRef.current === "live" &&
        (isLoggedInRef.current || autoResumeEnabledRef.current || hasSavedSession());
      if (shouldRestoreLive) {
        resumeLoginFromSession(reason);
        return;
      }
      if (hasSavedSession() || autoResumeEnabledRef.current) {
        requestSessionResumeSnapshot(reason);
      }
    };
    if (socket.connected) {
      restoreSession(true);
      finishAttempt();
      return;
    }
    void connectSocketWithAuth()
      .then((connected) => {
        restoreSession(connected);
      })
      .catch(() => {
        setConnectionError(LIVE_CONNECTION_INTERRUPTED_MESSAGE);
      })
      .finally(() => {
        finishAttempt();
      });
  }

  useEffect(() => {
    attemptSilentReconnectRef.current = attemptSilentReconnect;
  });

  function startGame() {
    invalidateGameplaySession();
    setInputLocked(false);
    inputLockedRef.current = false;
    const base = generateGrid(gridSize);

    setBoard(base);
    commitTraceSelection([], []);
    setAnalysis(null);
    setHighlightPlayers([]);
    setScoreFlights([]);
    clearToasts();
    solutionsRef.current = new Map();
    serverAllWordsRef.current = [];
    serverSolutionsReadyRef.current = false;
    bestGridMaxRef.current = 0;
    bestGridMaxLenRef.current = 0;
    setAccepted([]);
    clearAcceptedRuntimeCaches();
    resetSubmissionQueue();
    setAllWords([]);
    setShowAllWords(false);
    setSpecialRound(null);
    setSpecialHint(null);
    setSpecialSolvedOverlay(null);
    setFoundTargetThisRound(false);
    setFoundTargetWord("");
    setTargetHintScheduleMs([]);
    setUpcomingSpecial(null);
    setRoundStats(null);
    setTargetSummary(null);
    setScore(0);
    setLastWords([]);
    clearStatusMessage({ force: true });
    bestWordAnnounceRef.current = -1;
    setFinalResults([]);
    clearQueuedRankingUpdate();
    setProvisionalRanking([]);
    const localDurationSec = ROOM_OPTIONS[currentRoomId || roomId]?.duration ?? DEFAULT_DURATION;
    const localDurationMs = Math.max(1, localDurationSec * 1000);
    setRoundId(null);
    setServerEndsAt(getNowServerMs() + localDurationMs);
    setServerRoundDurationMs(localDurationMs);
    setServerStatus("running");
    setNextStartAt(null);
    intermissionFeature.stop();
    setTick(localDurationSec);
    setPhase("playing");
  }

  function clearWordListFlipArtifacts() {
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      wordListFlipRafIdsRef.current.forEach((id) => window.cancelAnimationFrame(id));
    }
    wordListFlipRafIdsRef.current = [];
    wordListFlipTimersRef.current.forEach((id) => clearTimeout(id));
    wordListFlipTimersRef.current.clear();
  }

  function isFoundLikeEntry(entry) {
    if (!entry) return false;
    return entry.isFound || entry.status === "pending" || entry.status === "rejected";
  }

  function prepareWordListFlip(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((entry) => {
      if (!isFoundLikeEntry(entry)) return;
      const el = listItemRefs.current.get(entry.word);
      if (!el) return;
      map.set(entry.word, el.getBoundingClientRect());
    });
    wordListFlipPrevRectsRef.current = map;
    wordListFlipPendingRef.current = map.size > 0;
  }

  function rotateGridClockwise() {
    if (isGridRotating) return;
    if (draggingRef.current) {
      draggingRef.current = false;
      clearSelection();
    }
    clearGridHitboxCache();
    const prevRects = new Map();
    for (let i = 0; i < board.length; i++) {
      const el = tileRefs.current[i];
      if (!el) continue;
      prevRects.set(i, el.getBoundingClientRect());
    }
    gridRotateAnimRef.current = { prevRects, spin: 90 };
    setIsGridRotating(true);
    if (gridRotateTimerRef.current) clearTimeout(gridRotateTimerRef.current);
    gridRotateTimerRef.current = setTimeout(() => {
      setIsGridRotating(false);
      gridRotateTimerRef.current = null;
    }, GRID_ROTATE_ANIM_MS);
    setGridRotationTurns((prev) => normalizeRotationTurns(prev + 1));
  }

  function pushWordHistory(wordNorm) {
    if (!wordNorm) return;
    const hist = wordHistoryRef.current;
    if (hist[0] !== wordNorm) {
      wordHistoryRef.current = [wordNorm, ...hist].slice(0, 30);
    }
    wordHistoryIndexRef.current = -1;
  }

  function loadWordFromHistory(wordNorm) {
    if (!wordNorm || phase !== "playing") return;
    const path = findBestPathForWord(board, wordNorm, specialScoreConfig);
    const hasPath = Array.isArray(path) && path.length > 0;
    const letters = hasPath
      ? path.map((idx) => board[idx].letter)
      : String(wordNorm || "")
          .toUpperCase()
          .split("");
    activeTraceStartedAtRef.current = getNowServerMs();
    commitTraceSelection(letters, hasPath ? path : []);
    clearStatusMessage();
    setActiveArea("game");
  }

  function cycleWordHistory(direction) {
    const hist = wordHistoryRef.current;
    if (!hist.length || phase !== "playing") return;
    let idx = wordHistoryIndexRef.current;
    if (direction < 0) {
      idx = idx === -1 ? 0 : Math.min(hist.length - 1, idx + 1);
    } else if (direction > 0) {
      idx = idx === -1 ? -1 : idx - 1;
    }
    if (idx < 0) {
      wordHistoryIndexRef.current = -1;
      clearSelection();
      return;
    }
    wordHistoryIndexRef.current = idx;
    loadWordFromHistory(hist[idx]);
  }

  function pushChatHistory(text) {
    if (!text) return;
    const hist = chatHistoryRef.current;
    if (hist[0] !== text) {
      chatHistoryRef.current = [text, ...hist].slice(0, 50);
    }
    chatHistoryIndexRef.current = -1;
  }

  function cycleChatHistory(direction) {
    const hist = chatHistoryRef.current;
    if (!hist.length) return;
    let idx = chatHistoryIndexRef.current;
    if (direction < 0) {
      idx = idx === -1 ? 0 : Math.min(hist.length - 1, idx + 1);
    } else if (direction > 0) {
      idx = idx === -1 ? -1 : idx - 1;
    }
    chatHistoryIndexRef.current = idx;
    const nextValue = idx === -1 ? "" : hist[idx] || "";
    setChatInput(nextValue);
    focusChatInput();
  }

  function normalizeUserIdForProfile(raw) {
    const safeUserId = Number(raw);
    return Number.isInteger(safeUserId) && safeUserId > 0 ? safeUserId : null;
  }

  function getUserIdFromPlayerProfileTarget(target = {}) {
    const direct = normalizeUserIdForProfile(target?.userId);
    if (direct) return direct;
    const numericProfileKey = normalizeUserIdForProfile(target?.installId);
    if (numericProfileKey) return numericProfileKey;
    const playerKey = String(target?.playerKey || "").trim();
    if (playerKey.startsWith("install:")) {
      return normalizeUserIdForProfile(playerKey.slice("install:".length));
    }
    return null;
  }

  function canOpenPlayerProfile(target = {}) {
    return !!getUserIdFromPlayerProfileTarget(target);
  }

  function closePlayerProfileModal() {
    if (playerProfileFetchRef.current.controller) {
      try {
        playerProfileFetchRef.current.controller.abort();
      } catch (_) {}
      playerProfileFetchRef.current.controller = null;
    }
    setPlayerProfileModal((prev) => ({
      ...prev,
      open: false,
      loading: false,
      error: "",
    }));
  }

  async function openPlayerProfile(target = {}) {
    const targetUserId = getUserIdFromPlayerProfileTarget(target);
    const targetNick = String(target?.nick || "").trim();
    if (!targetUserId) {
      showToast("Profil indisponible");
      return;
    }
    const requestId = (playerProfileFetchRef.current.requestId || 0) + 1;
    if (playerProfileFetchRef.current.controller) {
      try {
        playerProfileFetchRef.current.controller.abort();
      } catch (_) {}
    }
    const controller = new AbortController();
    playerProfileFetchRef.current = { requestId, controller };
    setPlayerProfileModal({
      open: true,
      userId: targetUserId,
      nick: targetNick,
      loading: true,
      error: "",
      profile: null,
    });
    try {
      const query = targetNick ? `?nick=${encodeURIComponent(targetNick)}` : "";
      const res = await fetch(
        `/api/player-profile/user/${encodeURIComponent(targetUserId)}${query}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }
      );
      const data = await res.json().catch(() => null);
      if (playerProfileFetchRef.current.requestId !== requestId) return;
      if (!res.ok || !data?.ok || !data?.profile) {
        throw new Error(data?.error || `http_${res.status || "error"}`);
      }
      setPlayerProfileModal({
        open: true,
        userId: targetUserId,
        nick: targetNick,
        loading: false,
        error: "",
        profile: data.profile,
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (playerProfileFetchRef.current.requestId !== requestId) return;
      setPlayerProfileModal((prev) => ({
        ...prev,
        open: true,
        loading: false,
        error: "Profil indisponible",
      }));
    } finally {
      if (playerProfileFetchRef.current.requestId === requestId) {
        playerProfileFetchRef.current.controller = null;
      }
    }
  }

  const stableOpenPlayerProfile = useStableEvent(openPlayerProfile);
  const stableCanOpenPlayerProfile = useStableEvent(canOpenPlayerProfile);

  function updateBlockedInstallIds(updater) {
    setBlockedInstallIds((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const sanitized = Array.isArray(next)
        ? Array.from(
            new Set(
              next
                .map(normalizeInstallId)
                .filter(
                  (entry) =>
                    entry &&
                    !entry.startsWith("dev-bot:")
                )
            )
          )
        : [];
      try {
        localStorage.setItem(
          BLOCKED_INSTALL_IDS_STORAGE_KEY,
          JSON.stringify(sanitized)
        );
      } catch (_) {}
      return sanitized;
    });
  }

  function blockInstallId(targetInstallId, nick = "") {
    const key = normalizeInstallId(targetInstallId);
    if (!key || key === installId) return;
    if (key.startsWith("dev-bot:")) return;
    updateBlockedInstallIds((prev) =>
      prev.includes(key) ? prev : [...prev, key]
    );
    showToast(nick ? `${nick} bloqué` : "Joueur bloqué");
  }

  function unblockInstallId(targetInstallId) {
    const key = normalizeInstallId(targetInstallId);
    if (!key) return;
    updateBlockedInstallIds((prev) => prev.filter((entry) => entry !== key));
  }

  const [
    captureChatViewportBaseline,
    resetMobileChatPanelImmediately,
    openChatPanel,
    closeChatPanel,
    subscribeLobbyChat,
    requestOpenChat,
    clearMobileChatReactionToasts,
    enqueueMobileChatReactionToast,
    openHomeChat,
    closeHomeChat,
    confirmChatRules,
    cancelChatRules,
    closeUserMenu,
    closeDesktopChatReactionPicker,
    clearDesktopReactionDetailsCloseTimer,
    closeDesktopChatReactionDetails,
    scheduleCloseDesktopChatReactionDetails,
    openDesktopChatReactionDetails,
    openDesktopChatReactionPicker,
    openUserMenu,
    openReportDialog,
    closeReportDialog,
    submitReport,
  ] = useLazyArrayController(createChatInteractionController, [
    chatBaselineHeightRef,
    chatBodyLockHeightRef,
    setChatViewportHeight,
    chatCloseTimerRef,
    chatInputRef,
    isChatOpenMobileRef,
    isChatClosingRef,
    suppressChatResizeRef,
    lastKeyboardInsetRef,
    chatDrawerSessionCalibrationRef,
    chatDrawerCalibrationRef,
    gameViewportFreezeHeightRef,
    setChatOpenedAtMs,
    setIsChatClosing,
    setIsChatOpenMobile,
    setActiveArea,
    setChatTab,
    setMobileChatUnreadCount,
    setMobileChatBotUnreadCount,
    isChatOpenMobile,
    isLoggedInRef,
    roomIdRef,
    socket,
    setConnectionError,
    connectSocketWithAuth,
    isAccountAuthenticated,
    accountSeenReady,
    showToast,
    chatRulesAccepted,
    setIsChatRulesOpen,
    chatFeature,
    isMobileLayoutRef,
    setHomeChatUnreadCount,
    setHomeChatBotUnreadCount,
    isMobileLayout,
    setIsHomeChatOpen,
    markAccountSeen,
    setUserMenu,
    setDesktopChatReactionPicker,
    desktopReactionDetailsCloseTimerRef,
    setDesktopChatReactionDetails,
    normalizeUserIdForProfile,
    installId,
    setReportDialog,
    reportDialog,
  ], 23);

  function closePatchNotes() {
    patchNotesOpeningRef.current = false;
    setIsPatchNotesOpen(false);
  }

  async function fetchDefinitionSummaryForWordOfDay(term) {
    const clean = String(term || "").trim();
    if (!clean) return null;
    const tried = new Set();
    const baseKey = normalizeWord(clean);
    if (baseKey) tried.add(baseKey);

    async function fetchDefinition(word) {
      const params = new URLSearchParams();
      params.set("word", word);
      const res = await fetch(`/api/define?${params.toString()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (!data) return null;
      const definitionText = pickDefinitionText(data);
      if (definitionText) {
        return {
          word: clean,
          displayWord: data.displayWord || data.word || data.title || clean,
          definition: definitionText,
          source: data.source || "",
          url: data.url || "",
        };
      }
      const fallbacks = buildDefinitionFallbacks(clean, data, tried);
      for (const fallback of fallbacks) {
        const next = await fetchDefinition(fallback);
        if (next?.definition) return next;
      }
      return null;
    }

    return fetchDefinition(clean);
  }

  function openDefinition(
    term,
    { fromWordInfo = false, preferLongDefinition = true, fromVault = false } = {}
  ) {
    const clean = String(term || "").trim();
    if (!clean) return;
    const originFromWordInfo = !!fromWordInfo;
    const useLongDefinition = !!preferLongDefinition;
    if (guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_DEFINITION) {
      completeGuidedResultsTutorial();
    }
    const requestId = ++definitionRequestIdRef.current;
    if (definitionBlinkTimerRef.current) {
      clearTimeout(definitionBlinkTimerRef.current);
      definitionBlinkTimerRef.current = null;
    }
    setDefinitionBlink(true);
    definitionBlinkTimerRef.current = setTimeout(() => {
      setDefinitionBlink(false);
      definitionBlinkTimerRef.current = null;
    }, 550);
    setDefinitionModal({
      open: true,
      loading: true,
      word: clean,
      lemma: "",
      lemmaLabel: "",
      lemmaGuess: false,
      participleBase: "",
      participleLabel: "",
      participleGuess: false,
      inflectionBase: "",
      inflectionLabel: "",
      inflectionGuess: false,
      matchedTitle: "",
      phraseGuess: false,
      title: "",
      definition: "",
      definitions: [],
      etymology: "",
      source: "",
      url: "",
      ok: false,
      fromWordInfo: originFromWordInfo,
      fromVault: !!fromVault,
      preferLongDefinition: useLongDefinition,
    });

    const tried = new Set();
    const baseKey = normalizeWord(clean);
    if (baseKey) tried.add(baseKey);

    const fetchDefinition = (word) => {
      const params = new URLSearchParams();
      params.set("word", word);
      if (useLongDefinition) {
        params.set("full", "1");
        params.set("nocache", "1");
      }
      fetch(`/api/define?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (requestId !== definitionRequestIdRef.current) return;
          if (!data) {
            setDefinitionModal((prev) => ({ ...prev, loading: false, ok: false }));
            return;
          }
          const definitionText = pickDefinitionText(data);
          const ok = !!definitionText || !!data.ok;
          if (!definitionText) {
            const fallbacks = buildDefinitionFallbacks(clean, data, tried);
            if (fallbacks.length) {
              fetchDefinition(fallbacks[0]);
              return;
            }
          }
          const definitionList = pickDefinitionList(data);
          setDefinitionModal({
            open: true,
            loading: false,
            word: data.displayWord || data.word || clean,
            lemma: data.lemma || "",
            lemmaLabel: data.lemmaLabel || "",
            lemmaGuess: !!data.lemmaGuess,
            participleBase: data.participleBase || "",
            participleLabel: data.participleLabel || "",
            participleGuess: !!data.participleGuess,
            inflectionBase: data.inflectionBase || "",
            inflectionLabel: data.inflectionLabel || "",
            inflectionGuess: !!data.inflectionGuess,
            matchedTitle: data.matchedTitle || "",
            phraseGuess: !!data.phraseGuess,
            title: data.title || "",
            definition: definitionText,
            definitions: definitionList,
            etymology: sanitizeDefinitionText(data.etymology),
            source: data.source || "",
            url: data.url || "",
            ok,
            fromWordInfo: originFromWordInfo,
            fromVault: !!fromVault,
            preferLongDefinition: useLongDefinition,
          });
        })
        .catch(() => {
          if (requestId !== definitionRequestIdRef.current) return;
          setDefinitionModal((prev) => ({ ...prev, loading: false, ok: false }));
        });
    };

    fetchDefinition(clean);
  }

  function closeDefinition() {
    setDefinitionModal((prev) => ({ ...prev, open: false }));
  }

  async function handleDefinitionVaultAction() {
    const word = typeof definitionModal?.word === "string" ? definitionModal.word.trim() : "";
    if (!word || wordVaultActionPending) return;
    if (definitionModal?.fromVault) {
      const removed = await removeWordFromVault(word);
      if (removed) {
        setDefinitionModal((prev) => ({
          ...prev,
          fromVault: false,
        }));
      }
      return;
    }
    await addWordToVault(word);
  }

  function openRecordModal(record) {
    const recordList = Array.isArray(record) ? record : record ? [record] : [];
    if (!recordList.length) return;
    const primary = recordList[0] || {};
    setRecordModal({
      open: true,
      categoryKey: primary.categoryKey || "",
      categoryLabel: primary.categoryLabel || "",
      nick: primary.nick || "",
      rank: primary.rank ?? null,
      rankTotal: primary.rankTotal ?? null,
      word: primary.word || "",
      pts: Number.isFinite(primary.pts) ? primary.pts : null,
      timeMs: Number.isFinite(primary.timeMs) ? primary.timeMs : null,
      wordsCount: Number.isFinite(primary.wordsCount) ? primary.wordsCount : null,
      records: recordList,
    });
  }

  function closeRecordModal() {
    setRecordModal((prev) => ({ ...prev, open: false }));
  }

  /**
   * Ajout de lettres via le clavier, avec pathfinder optimisé.
   */
  function addLetterFromKeyboard(label) {
    clearStatusMessage();
    const previous = currentTilesRef.current;
    if (!previous.length) {
      activeTraceStartedAtRef.current = getNowServerMs();
    }
    const next = [...previous, label];
    const step = Math.max(0, next.length - 1);
    tileStepRef.current = step;
    playTileStepSound(step);

    const raw = normalizeWord(next.join(""));
    if (!raw) return;
    const path = findBestPathForPreview(board, raw, getPathPreviewScoreConfig());
    commitTraceSelection(next, path || []);
  }

  function removeLastLetterFromKeyboard() {
    clearStatusMessage();
    const previous = currentTilesRef.current;
    if (!previous.length) return;
    const next = previous.slice(0, -1);
    if (next.length > 0) {
      const step = Math.max(0, next.length - 1);
      tileStepRef.current = step;
      playTileStepSound(step);
    } else {
      activeTraceStartedAtRef.current = null;
    }
    const raw = normalizeWord(next.join(""));
    const path = raw
      ? findBestPathForPreview(board, raw, getPathPreviewScoreConfig())
      : null;
    commitTraceSelection(next, path || []);
  }

  /**
   * Gestion clavier globale : Tab pour switch game/chat,
   * lettres pour le jeu uniquement quand activeArea === "game".
   */
  useEffect(() => {
    function onKey(e) {
      const target = e.target;
      const targetElement = target instanceof HTMLElement ? target : null;
      const authDialogOpen = !!authModalMode;
      const authDialogFocused =
        !!targetElement?.closest?.("[data-auth-dialog='true']") ||
        !!(
          document.activeElement instanceof HTMLElement &&
          document.activeElement.closest?.("[data-auth-dialog='true']")
        );

      // Tab : bascule jeu <-> chat
      if (e.key === "Tab") {
        if (authDialogOpen || authDialogFocused) {
          return;
        }
        e.preventDefault();

        setActiveArea((prev) => {
          const next = prev === "game" ? "chat" : "game";

          if (next === "chat") {
            setTimeout(() => {
              focusChatInput();
            }, 0);
          } else {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }

          return next;
        });

        return;
      }

      if (
        targetElement &&
        targetElement.closest?.(
          "input, textarea, select, [contenteditable='true'], [data-chat-panel='true']"
        )
      ) {
        return;
      }

      // On ne gère le reste que si le jeu est la zone active
      if (activeArea !== "game") return;
      if (phase !== "playing") return;
      if (inputLockedRef.current) return;

      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      const k = e.key.toLowerCase();

      if (/^[a-z]$/.test(k)) {
        e.preventDefault();
        lastInputModeRef.current = "keyboard";
        addLetterFromKeyboard(k.toUpperCase());
      }
      if (k === "arrowup") {
        e.preventDefault();
        lastInputModeRef.current = "keyboard";
        cycleWordHistory(-1);
      }
      if (k === "arrowdown") {
        e.preventDefault();
        lastInputModeRef.current = "keyboard";
        cycleWordHistory(1);
      }
      if (k === "enter") {
        e.preventDefault();
        lastInputModeRef.current = "keyboard";
        submit();
      }
      if (k === "backspace") {
        e.preventDefault();
        lastInputModeRef.current = "keyboard";
        removeLastLetterFromKeyboard();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeArea, authModalMode, phase, board, dictionary, submit]);

    // =============== VIBRATIONS (optionnelles, mobile) ===============
  function vibrateLight() {
    if (!canVibrateRef.current || !isVibrationEnabledRef.current) return;
    try {
      navigator.vibrate(15);
    } catch (_) {}
  }

  function vibrateSuccess(wordLength) {
    // Haptique supprimé sur validation : on réserve la vibration aux erreurs.
    return;
  }


  function vibrateErrorPattern() {
    if (!canVibrateRef.current || !isVibrationEnabledRef.current) return;
    try {
      navigator.vibrate([40, 60, 40]);
    } catch (_) {}
  }

  function setStatusMessageWithHold(msg, holdMs = 1000) {
    progressFeature.showStatus(msg, holdMs);
  }

  function clearStatusMessage({ force = false } = {}) {
    progressFeature.clearStatus({ force });
  }

  function error(msg) {
    setStatusMessageWithHold(msg);
    progressFeature.triggerInputShake({
      enabled: visualScreenShakeEnabledRef.current,
      durationMs: 300,
    });
    const lower = (msg || "").toLowerCase();
    const isDuplicate = lower.includes("déjà") || lower.includes("deja");
    const isInvalidDico =
      lower.includes("dico") ||
      lower.includes("dictionnaire") ||
      lower.includes("absent") ||
      lower.includes("invalide") ||
      lower.includes("invalid");
    const isTooShort = lower.includes("trop court");
    const invalidFlashLabel = isTooShort
      ? "TROP COURT"
      : lower.includes("déjà envoyé") || lower.includes("deja envoye")
      ? "DEJA ENVOYE"
      : lower.includes("déjà tenté") || lower.includes("deja tente")
      ? "DEJA TENTE"
      : isDuplicate
      ? "DEJA JOUE"
      : isInvalidDico
      ? "INVALIDE"
      : null;
    if (invalidFlashLabel) {
      triggerInvalidFlash(invalidFlashLabel);
    }
    if (isInvalidDico) {
      playInvalidWordSound();
    } else if (isTooShort) {
      // Pas de son pour un mot de moins de 2 lettres.
    } else if (isDuplicate) {
      playAlreadyPlayedSound();
    } else {
      playErrorSound();
    }
    vibrateErrorPattern();
    clearSelection();
  }


  /**
   * Drag souris : démarrage
   */
  function handleMouseDown(index, mode = "mouse") {
    if (phase !== "playing" || inputLocked) return;
    resetDragMovePipeline();
    dragGridMetricsRef.current = gridHitboxRef.current || buildGridHitboxMetrics();
    setActiveArea("game");
    draggingRef.current = true;
    activeTraceStartedAtRef.current = getNowServerMs();
    recordPerfEvent("trace-start", { index, mode });
    pushSamsungDiagEvent("drag-start", { mode, index });
    lastInputModeRef.current = mode;
    clearStatusMessage();

    const letter = board[index].letter;
    tileStepRef.current = 0;
    playTileStepSound(tileStepRef.current);

    commitTraceSelection([letter], [index]);
  }

  /**
   * Drag souris : survol d'une case, avec rognage des coins orthogonaux.
   */
  function handleMouseEnter(index, e) {
    if (!draggingRef.current) return;
    const prevPath = highlightPathRef.current;
    const prevLetters = currentTilesRef.current;
    if (prevPath.length === 0) {
      commitTraceSelection([board[index].letter], [index]);
      return;
    }

    const lastIndex = prevPath[prevPath.length - 1];
    const prevIndex = prevPath[prevPath.length - 2];

    if (prevPath.length >= 2 && index === prevIndex) {
      // Safe zone: only allow backtrack when pointer is close to the previous tile center.
      if (lastInputModeRef.current === "touch" || lastInputModeRef.current === "mouse") {
        const geom = getTileGeometryByBoardIndex(index);
        if (geom && e) {
          const dx = (e.clientX ?? geom.cx) - geom.cx;
          const dy = (e.clientY ?? geom.cy) - geom.cy;
          const dist = Math.hypot(dx, dy);
          const safeRadius = Math.min(geom.width, geom.height) * 0.38;
          if (dist > safeRadius) return;
        }
      }
      const nextPath = prevPath.slice(0, -1);
      const nextLetters = prevLetters.slice(0, -1);
      const step = Math.max(0, nextLetters.length - 1);
      tileStepRef.current = step;
      if (nextLetters.length > 0) {
        playTileStepSound(step);
      }
      commitTraceSelection(nextLetters, nextPath);
      return;
    }

    const neigh = neighbors(lastIndex, gridSize);
    if (!neigh.includes(index) || prevPath.includes(index)) return;

    {
      const geom = getTileGeometryByBoardIndex(index);
      if (geom && e) {
        const dx = (e.clientX ?? geom.cx) - geom.cx;
        const dy = (e.clientY ?? geom.cy) - geom.cy;
        const dist = Math.hypot(dx, dy);
        const safeRadius = Math.min(geom.width, geom.height) * 0.5;
        if (dist > safeRadius) return;
      }
    }

    const lastRow = Math.floor(lastIndex / gridSize);
    const lastCol = lastIndex % gridSize;
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const dr = row - lastRow;
    const dc = col - lastCol;
    const isOrthogonal = Math.abs(dr) + Math.abs(dc) === 1;

    if (isOrthogonal) {
      const geom = getTileGeometryByBoardIndex(index);
      if (geom && e) {
        const dx = e.clientX - geom.cx;
        const dy = e.clientY - geom.cy;
        const halfW = geom.width / 2;
        const halfH = geom.height / 2;

        const nx = dx / halfW;
        const ny = dy / halfH;

        const CORNER_THRESHOLD = 0.5;
        const inRejectedCorner =
          (dc === 1 && nx < -CORNER_THRESHOLD && Math.abs(ny) > CORNER_THRESHOLD) ||
          (dc === -1 && nx > CORNER_THRESHOLD && Math.abs(ny) > CORNER_THRESHOLD) ||
          (dr === 1 && ny < -CORNER_THRESHOLD && Math.abs(nx) > CORNER_THRESHOLD) ||
          (dr === -1 && ny > CORNER_THRESHOLD && Math.abs(nx) > CORNER_THRESHOLD);

        if (inRejectedCorner) return;
      }
    }

    const nextLetters = [...prevLetters, board[index].letter];
    const nextPath = [...prevPath, index];
    const step = nextLetters.length - 1;
    tileStepRef.current = step;
    playTileStepSound(step);
    commitTraceSelection(nextLetters, nextPath);
  }

  function handleMouseUp() {
    if (!draggingRef.current) return;
    const hadPendingDragMove = flushPendingDragMove();
    const tracedTiles = highlightPathRef.current.length;
    draggingRef.current = false;
    dragGridMetricsRef.current = null;
    pushSamsungDiagEvent("drag-stop", { mode: "mouse" });
    recordPerfEvent("trace-end", { mode: "mouse", tiles: tracedTiles });
    resetDragMovePipeline();
    if (hadPendingDragMove && typeof window !== "undefined") {
      window.setTimeout(() => {
        submit();
        flushDeferredLiveUiAfterTrace();
      }, 0);
      return;
    }
    submit();
    flushDeferredLiveUiAfterTrace();
  }

function handleTouchStart(e, index) {
  if (phase !== "playing" || inputLocked) return;
  if (!e.touches || e.touches.length === 0) return;
  if (e?.cancelable) e.preventDefault();

  bumpSamsungDiagCounter("touchStart");
  resetDragMovePipeline();
  dragGridMetricsRef.current = gridHitboxRef.current || buildGridHitboxMetrics();
  setActiveArea("game");
  draggingRef.current = true;
  activeTraceStartedAtRef.current = getNowServerMs();
  recordPerfEvent("trace-start", { index, mode: "touch" });
  pushSamsungDiagEvent("drag-start", { mode: "touch", index });
  lastInputModeRef.current = "touch";
  clearStatusMessage();

  const letter = board[index].letter;
  tileStepRef.current = 0;
  playTileStepSound(0);
  commitTraceSelection([letter], [index]);
  const startTouch = e.touches[0];
  lastTouchMoveSampleRef.current = {
    x: Number.isFinite(startTouch?.clientX) ? startTouch.clientX : null,
    y: Number.isFinite(startTouch?.clientY) ? startTouch.clientY : null,
    at: getSamsungDiagNowMs(),
  };
}

function handleTouchMove(e) {
  if (!draggingRef.current) return;
  if (!e.touches || e.touches.length === 0) return;
  if (e?.cancelable) e.preventDefault();

  bumpSamsungDiagCounter("touchMove");
  noteSamsungTouchMoveRate();
  const touch = e.touches[0];
  const now = getSamsungDiagNowMs();
  const prev = lastTouchMoveSampleRef.current || {};
  const x = Number.isFinite(touch?.clientX) ? touch.clientX : null;
  const y = Number.isFinite(touch?.clientY) ? touch.clientY : null;
  if (x == null || y == null) return;
  if (isSamsungBrowserRef.current && Number.isFinite(prev.at) && prev.at > 0) {
    const dt = now - prev.at;
    const dx = x - (Number.isFinite(prev.x) ? prev.x : x);
    const dy = y - (Number.isFinite(prev.y) ? prev.y : y);
    const dist = Math.hypot(dx, dy);
    if (
      dt < SAMSUNG_TOUCH_MOVE_MIN_INTERVAL_MS &&
      dist < SAMSUNG_TOUCH_MOVE_MIN_DISTANCE_PX
    ) {
      return;
    }
  }
  lastTouchMoveSampleRef.current = { x, y, at: now };
  queueDragMove(x, y, true);
}

function handleMouseMove(e) {
  if (!draggingRef.current) return;
  if (!e || typeof e.clientX !== "number" || typeof e.clientY !== "number") return;
  queueDragMove(e.clientX, e.clientY, false);
}

function handleTouchEnd(e) {
  if (!draggingRef.current) return;
  if (e?.cancelable) e.preventDefault();
  bumpSamsungDiagCounter("touchEnd");
  const hadPendingDragMove = flushPendingDragMove();
  const tracedTiles = highlightPathRef.current.length;
  draggingRef.current = false;
  dragGridMetricsRef.current = null;
  pushSamsungDiagEvent("drag-stop", { mode: "touch" });
  recordPerfEvent("trace-end", { mode: "touch", tiles: tracedTiles });
  flushSamsungDiagSnapshot("touch-end");
  resetDragMovePipeline();
  if (hadPendingDragMove && typeof window !== "undefined") {
    window.setTimeout(() => {
      submit();
      flushDeferredLiveUiAfterTrace();
    }, 0);
    return;
  }
  submit();
  flushDeferredLiveUiAfterTrace();
}

  gridInputControllerRef.current = {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
  };

  useEffect(() => {
    return () => {
      dragGridMetricsRef.current = null;
      flushSamsungDiagSnapshot("drag-cleanup");
      resetDragMovePipeline();
      if (submissionTickRafRef.current != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(submissionTickRafRef.current);
        submissionTickRafRef.current = null;
      }
      submissionTickPendingRef.current = false;
      submissionTickDeferredByTraceRef.current = false;
    };
  }, []);

  function touchSubmissionState({ deferDuringTrace = false } = {}) {
    if (deferDuringTrace && shouldHoldLiveUiDuringTrace()) {
      submissionTickDeferredByTraceRef.current = true;
      recordPerfEvent("submission-status-held");
      return;
    }
    if (submissionTickPendingRef.current) return;
    submissionTickPendingRef.current = true;
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      submissionTickRafRef.current = window.requestAnimationFrame(() => {
        submissionTickRafRef.current = null;
        submissionTickPendingRef.current = false;
        setSubmissionTick((tick) => tick + 1);
      });
      return;
    }
    submissionTickPendingRef.current = false;
    setSubmissionTick((tick) => tick + 1);
  }

  function resetSubmissionQueue() {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    for (const entry of inFlightBatchesRef.current.values()) {
      if (entry?.timeoutId) clearTimeout(entry.timeoutId);
    }
    inFlightBatchesRef.current.clear();
    pendingQueueRef.current = [];
    pendingWordsRef.current.clear();
    submissionStatusRef.current.clear();
    batchUnsupportedRef.current = false;
    touchSubmissionState();
  }

  function getNextLiveFeedTs() {
    const now = Date.now();
    const next = Math.max(now, (Number(liveFeedTsRef.current) || 0) + 1);
    liveFeedTsRef.current = next;
    return next;
  }

  const [clearDailyWordSlot, beginDailySpecialDrag] = useDailySpecialInteraction(
    setDailyWordSlots,
    isLiveSpecial3WordsMode,
    syncLiveSpecial3WordsState,
    dailySpecialPlacements,
    setDailyActiveSlot,
    setDailyInvalidSlot,
    clearSelection,
    tileRefs,
    isSpecial3WordsMode,
    phase,
    requestAudioUnlock,
    dailySpecialDragRef,
    dailySpecialDragGhostRef,
    setDailySpecialDrag,
    dailySpecialDrag,
    board,
    playDailySpecialLockValidationSound,
    setDailySpecialPlacements,
    setDailyLockPulseKey,
    dailyWordSlots
  );

  const [
    analyzeWord,
    clearResultsWordAnalysis,
    openWordInfoModal,
    closeWordInfoModal,
  ] = useLazyArrayController(
    createResultsWordInspectorRuntime,
    [
    solutionsRef,
    board,
    specialScoreConfig,
    setAnalysis,
    setHighlightPath,
    setHighlightPlayers,
    finalResults,
    setWordInfoModal,
    guidedResultsStep,
    setGuidedResultsStep,
    GUIDED_RESULTS_STEPS,
    ],
    4,
  );

  useEffect(() => {
    analyzeWordActionRef.current = analyzeWord;
    clearResultsWordAnalysisRef.current = clearResultsWordAnalysis;
    openDefinitionActionRef.current = openDefinition;
  });

  const handleDesktopWordAnalyze = React.useCallback((word) => {
    analyzeWordActionRef.current?.(word);
  }, []);

  const handleDesktopWordAnalysisClear = React.useCallback(() => {
    clearResultsWordAnalysisRef.current?.();
  }, []);

  const handleDesktopWordDefinitionOpen = React.useCallback((word) => {
    if (!word) return;
    openDefinitionActionRef.current?.(word);
  }, []);

  // Chat
  function appendChatEmoji(emoji) {
    const value = String(emoji || "").trim();
    if (!value || chatInputDisabled) return;
    setChatInput((prev) => {
      const base = String(prev || "");
      if (!base) return value;
      return /\s$/.test(base) ? `${base}${value}` : `${base} ${value}`;
    });
    setActiveArea("chat");
    focusChatInput();
  }

  function focusChatInput(options = {}) {
    const el = chatInputRef.current;
    if (!el) return;
    const preventScroll = options.preventScroll !== false;
    prepareDesktopChatInputFocus();
    const wasAtBottom = chatDesktopFocusWasAtBottomRef.current;
    try {
      if (preventScroll) {
        el.focus({ preventScroll: true });
        restoreDesktopChatAfterInputFocus(wasAtBottom);
        return;
      }
      el.focus();
    } catch (_) {
      try {
        el.focus();
      } catch (_) {}
    }
    restoreDesktopChatAfterInputFocus(wasAtBottom);
  }

  function setChatReplyTargetFromMessage(message) {
    if (!message || typeof message !== "object") return;
    if (isSystemChatMessage(message)) return;
    const replyTo = normalizeChatReplyPreview({
      id: message.id,
      nick: message.nick || message.author || "Anonyme",
      installId: message.installId || null,
      text: message.text || "",
      t: message.t ?? message.ts ?? message.timestamp ?? message.createdAt,
    });
    if (!replyTo) return;
    if (safeChatTab !== "messages") {
      setChatTab("messages");
    }
    setChatEditTarget(null);
    setChatReplyTarget(replyTo);
    setActiveArea("chat");
    focusChatInput();
  }

  function clearChatReplyTarget() {
    setChatReplyTarget(null);
  }

  function beginChatEditFromMessage(message) {
    if (!message || typeof message !== "object") return;
    if (isSystemChatMessage(message)) return;
    const messageId = typeof message.id === "string" ? message.id.trim() : "";
    const authorInstallId =
      typeof message.installId === "string" ? message.installId.trim() : "";
    if (!messageId || !authorInstallId || authorInstallId !== installId) return;
    const text = String(message.text || "");
    setChatReplyTarget(null);
    setChatEditTarget({ id: messageId, text });
    setChatInput(text);
    setActiveArea("chat");
    focusChatInput();
  }

  function clearChatEditTarget() {
    setChatEditTarget(null);
  }

  function deleteOwnChatMessage(message) {
    if (!message || typeof message !== "object") return;
    if (!ensureAuthenticated({ source: "chat" })) return;
    const messageId = typeof message.id === "string" ? message.id.trim() : "";
    const authorInstallId =
      typeof message.installId === "string" ? message.installId.trim() : "";
    if (!messageId || !authorInstallId || authorInstallId !== installId) return;
    if (!socket.connected) {
      setConnectionError("Connecte-toi au serveur pour supprimer un message.");
      return;
    }
    const payload = {
      messageId,
      roomId: roomIdRef.current || getDefaultRoomId(),
    };
    if (!isLoggedInRef.current) {
      const nickForLobby = (nicknameRef.current || nickname || "").trim();
      if (!nickForLobby) {
        setConnectionError("Choisis un pseudo pour discuter.");
        return;
      }
      payload.nick = nickForLobby;
      payload.installId = installId;
      payload.lobby = true;
    }
    socket.emit("chat:delete", payload, (res) => {
      if (res?.ok) return;
      if (res?.error === "forbidden") {
        showToast("Suppression refusée");
      } else {
        showToast("Suppression impossible");
      }
    });
  }

  function sendChatReaction(messageId, emoji) {
    const safeMessageId = typeof messageId === "string" ? messageId.trim() : "";
    const safeEmoji = typeof emoji === "string" ? emoji.trim() : "";
    if (!safeMessageId || !safeEmoji) return;
    if (!ensureAuthenticated({ source: "chat" })) return;
    if (!chatRulesAccepted) {
      setIsChatRulesOpen(true);
      return;
    }
    if (!socket.connected) {
      if (!isLoggedInRef.current) {
        subscribeLobbyChat();
        setConnectionError("Connexion au serveur...");
      } else {
        setConnectionError("Connecte-toi au serveur pour réagir.");
      }
      return;
    }

    const payload = {
      messageId: safeMessageId,
      emoji: safeEmoji,
      roomId: roomIdRef.current || getDefaultRoomId(),
    };
    if (!isLoggedInRef.current) {
      const nickForLobby = (nicknameRef.current || nickname || "").trim();
      if (!nickForLobby) {
        setConnectionError("Choisis un pseudo pour discuter.");
        return;
      }
      payload.nick = nickForLobby;
      payload.installId = installId;
      payload.lobby = true;
    }

    socket.emit("chat:react", payload, (res) => {
      if (res?.ok) return;
      if (res?.error === "muted") {
        showToast("Chat temporairement bloqué");
      } else if (res?.error === "empty_nick") {
        setConnectionError("Choisis un pseudo pour discuter.");
      } else if (res?.error === "invalid_emoji") {
        showToast("Réaction indisponible");
      } else if (res?.error === "message_not_found") {
        showToast("Message introuvable");
      }
    });
  }

  function autoResizeDesktopChatInput(el = chatInputRef.current) {
    const node = el;
    if (!node || node.tagName !== "TEXTAREA") return;
    node.style.height = "auto";
    const nextHeight = Math.min(node.scrollHeight, 140);
    node.style.height = `${Math.max(40, nextHeight)}px`;
    node.style.overflowY = node.scrollHeight > 140 ? "auto" : "hidden";
  }

  function submitChat(e, forcedText = null) {
    if (e) e.preventDefault();
    const text = normalizeLegacyChatEmoticons(
      forcedText ?? chatInputValueRef.current
    ).trim();
    if (!text) return false;
    if (!ensureAuthenticated({ source: "chat" })) return false;
    if (!chatRulesAccepted) {
      setIsChatRulesOpen(true);
      return false;
    }

    if (!socket.connected) {
      if (!isLoggedInRef.current) {
        subscribeLobbyChat();
        setConnectionError("Connexion au serveur...");
      } else {
        setConnectionError("Connecte-toi au serveur pour envoyer un message.");
      }
      return false;
    }

    const now = Date.now();
    if (now - chatLastSentRef.current < CHAT_MIN_DELAY) return false;
    chatLastSentRef.current = now;

    const activeEdit = chatEditTargetRef.current;
    const editMessageId = typeof activeEdit?.id === "string" ? activeEdit.id.trim() : "";
    const replyToPayload = editMessageId
      ? null
      : normalizeChatReplyPreview(chatReplyTargetRef.current);
    let payload = text;
    if (editMessageId) {
      payload = {
        messageId: editMessageId,
        text,
        roomId: roomIdRef.current || getDefaultRoomId(),
      };
      if (!isLoggedInRef.current) {
        const nickForLobby = (nicknameRef.current || nickname || "").trim();
        if (!nickForLobby) {
          setConnectionError("Choisis un pseudo pour discuter.");
          return false;
        }
        payload.nick = nickForLobby;
        payload.installId = installId;
        payload.lobby = true;
      }
    } else if (!isLoggedInRef.current) {
      const nickForLobby = (nicknameRef.current || nickname || "").trim();
      if (!nickForLobby) {
        setConnectionError("Choisis un pseudo pour discuter.");
        return false;
      }
      payload = {
        text,
        roomId: roomIdRef.current || getDefaultRoomId(),
        nick: nickForLobby,
        installId,
        lobby: true,
      };
      if (replyToPayload) {
        payload.replyTo = replyToPayload;
      }
    } else if (replyToPayload) {
      payload = {
        text,
        replyTo: replyToPayload,
      };
    }

    const replyTargetIdAtSend = replyToPayload?.id || "";
    const eventName = editMessageId ? "chat:edit" : "chat:send";
    socket.emit(eventName, payload, (res) => {
      if (!res?.ok) {
        if (res?.error === "muted") {
          showToast("Chat temporairement bloqué");
        } else if (res?.error === "rate_limited") {
          const retrySec = Math.max(1, Math.ceil((Number(res.retryMs) || 0) / 1000));
          showToast(`Trop de messages. Réessaie dans ${retrySec} s.`);
        } else if (res?.error === "empty_nick") {
          setConnectionError("Choisis un pseudo pour discuter.");
        } else {
          setConnectionError("Message non envoyé");
        }
      } else {
        setConnectionError("");
        if (editMessageId && chatEditTargetRef.current?.id === editMessageId) {
          setChatEditTarget(null);
        }
        if (replyTargetIdAtSend && chatReplyTargetRef.current?.id === replyTargetIdAtSend) {
          setChatReplyTarget(null);
        }
      }
    });

    if (!editMessageId) {
      pushChatHistory(text);
    }
    if (!forcedText) setChatInput("");
    return true;
  }

  function setTournamentReady(nextReady) {
    if (!socket.connected || !isLoggedInRef.current) {
      setConnectionError("Connecte-toi au live pour te signaler pret.");
      return;
    }
    socket.emit(
      "tournament:ready",
      { roomId: currentRoomIdRef.current || roomIdRef.current, ready: !!nextReady },
      (res) => {
        if (!res?.ok) {
          const message =
            res?.error === "maintenance_mode"
              ? "Maintenance en cours."
              : res?.error === "room_busy"
              ? "Une manche est deja en cours."
              : "Impossible de changer le statut pret.";
          showToast(message, 2600);
          if (res?.lobby) setTournamentLobby(res.lobby);
          return;
        }
        if (res?.lobby) setTournamentLobby(res.lobby);
      }
    );
  }

  function startTrainingRound(type, label = "") {
    if (!socket.connected || !isLoggedInRef.current) {
      setConnectionError("Connecte-toi au live pour lancer un entrainement.");
      return;
    }
    const cleanLabel = String(label || type || "cette manche").trim();
    setTrainingConfirm({ type, label: cleanLabel });
  }

  function confirmTrainingRound() {
    const pending = trainingConfirm;
    if (!pending?.type) return;
    setTrainingConfirm(null);
    setTrainingBusy(true);
    socket.emit(
      "training:start",
      { roomId: currentRoomIdRef.current || roomIdRef.current, type: pending.type },
      (res) => {
        setTrainingBusy(false);
        if (res?.ok) return;
        const message =
          res?.error === "maintenance_mode"
            ? "Maintenance en cours."
            : res?.error === "training_unavailable"
            ? "L'entrainement est disponible seulement quand tu es seul dans le salon."
            : res?.error === "room_busy"
            ? "Une manche est deja en cours."
            : "Impossible de lancer l'entrainement.";
        showToast(message, 3200);
      }
    );
  }

  function startStandaloneTrainingFromHome(type, label, durationMs) {
    if (!ensureAuthenticated({ source: "training" })) return;
    standaloneTrainingController.start(type, label, durationMs);
  }

  function launchStandaloneTraining(training, liveStatus = null) {
    if (!training?.grid || !Array.isArray(training.grid)) return;
    const trainingRoomId = liveStatus?.roomId || roomIdRef.current || roomId;
    if (trainingRoomId) {
      setCurrentRoomId(trainingRoomId);
      setRoomId(trainingRoomId);
    }
    appViewRef.current = "training";
    setAppView("training");
    isLoggedInRef.current = true;
    setIsLoggedIn(true);
    liveSessionReadyRef.current = false;
    sessionPersistenceFeature.setAutoResumeEnabled(false);
    clearSavedSession();
    setResumeSnapshot(null);
    setCanResumeSession(false);
    manualDisconnectRef.current = false;
    setConnectionError("");
    setLoginError("");
    currentRoundTrainingRef.current = true;
    setTournament(null);
    setTournamentTotals({});
    setTournamentRanking([]);
    setTournamentRoundPoints({});
    setTournamentSummary(null);
    setTournamentLobby(null);
    setBreakKind(null);
    setNextStartAt(null);
    setRoundPreparing(null);
    setUpcomingSpecial(null);
    setFinalResults([]);
    setProvisionalRanking([]);
    setTargetSummary(null);
    setAnnouncements([]);
    vocabBaselineRoundRef.current = null;
    vocabBaselineRef.current = null;
    vocabWeeklyBaselineRoundRef.current = null;
    vocabWeeklyBaselineRef.current = null;
    vocabWeeklyRankBaselineRef.current = null;
    const plan = training.plan?.isSpecial ? training.plan : null;
    if (training.mode === "self_specials_3_words") {
      setDailySpecialPlacements(createDailySpecialPlacements());
      setDailyWordSlots(createDailyWordSlots());
      setDailyActiveSlot(0);
      setDailyInvalidSlot(null);
      setDailySpecialDrag(null);
      dailySpecialDragRef.current = null;
    }
    const targetSchedule =
      training.mode === "target_long" || training.mode === "target_score"
        ? buildTrainingTargetHintSchedule(training.durationMs, training.targetLength)
        : [];
    if (targetSchedule.length) {
      setSpecialHint({
        kind: training.mode,
        pattern: "",
        length: training.targetLength || String(training.targetWord || "").length,
        cells: [],
        wordIndices: [],
      });
    }
    const endsAt = getNowServerMs() + training.durationMs;
    roundStartAtRef.current = getNowServerMs();
    gameplaySessionFeature.startRound(
      {
        roomId: currentRoomIdRef.current || roomIdRef.current,
        roundId: training.sessionId || training.gridId || `training:${Date.now()}`,
        startsAt: endsAt - training.durationMs,
        endsAt,
        status: "running",
      },
      { origin: "training", entryKind: "training" }
    );
    startGameFromServerRef.current?.(
      training.grid,
      null,
      training.durationMs,
      endsAt,
      currentRoomIdRef.current || roomIdRef.current,
      4,
      plan,
      training.quality || null,
      null,
      targetSchedule,
      {
        startsAt: endsAt - training.durationMs,
        introMs: 0,
        status: "running",
        solutions: training.solutions,
      }
    );
  }

  function joinStandaloneTrainingLive(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    clockFeature.stop({ preserveRemaining: true });
    resetSubmissionQueue();
    clearSelection();
    currentRoundTrainingRef.current = false;
    const joinedRoom = snapshot.roomId || roomIdRef.current || roomId;
    const joinedNick = String(snapshot?.player?.nick || nicknameRef.current || "").trim();
    if (joinedRoom) {
      setCurrentRoomId(joinedRoom);
      setRoomId(joinedRoom);
    }
    if (joinedNick && joinedRoom) {
      persistSession({ nick: joinedNick, roomId: joinedRoom, installId });
      lastLoginPayloadRef.current = { nick: joinedNick, roomId: joinedRoom };
    }
    sessionPersistenceFeature.setAutoResumeEnabled(true);
    manualDisconnectRef.current = false;
    appViewRef.current = "live";
    setAppView("live");
    isLoggedInRef.current = true;
    setIsLoggedIn(true);
    liveSessionReadyRef.current = false;
    setConnectionError("");
    setLoginError("");
    setServerEndsAt(null);
    setServerRoundDurationMs(null);
    setRoundId(null);
    setSpecialHint(null);
    setTargetHintScheduleMs([]);
    setSpecialSolvedOverlay(null);
    setFoundTargetThisRound(false);
    setFoundTargetWord("");
    const hydrated = hydrateLiveSnapshot(snapshot, "join");
    liveSessionReadyRef.current = hydrated;
    if (!hydrated) {
      setConnectionError("Impossible de restaurer l’état du live.");
      return;
    }
    scheduleBatchFlush({ immediate: true });
  }

  function finishStandaloneTraining(options = {}) {
    const training = standaloneTrainingSessionRef.current;
    if (!training || phaseRef.current !== "playing") return;
    if (!options?.skipAutoSubmit) {
      tryAutoSubmitCurrentWordAtRoundEnd();
    }
    clockFeature.stop({ preserveRemaining: true });
    setTick(0);
    setServerEndsAt(null);
    setServerStatus("break");
    setInputLocked(false);
    inputLockedRef.current = false;
    setAllWords(Array.isArray(serverAllWordsRef.current) ? serverAllWordsRef.current : []);
    setTargetSummary(buildStandaloneTrainingTargetSummary(training));
    setPhase("results");
    gameplaySessionFeature.transitionPhase("results");
  }

  function replayStandaloneTraining() {
    const training = standaloneTrainingSessionRef.current;
    if (!training) return;
    standaloneTrainingController.start(
      training.mode,
      training.label,
      training.durationMs
    );
  }

  function handleChatInputFocus() {
    setActiveArea("chat");
    restoreDesktopChatAfterInputFocus(chatDesktopFocusWasAtBottomRef.current);
    if (!chatRulesAccepted) {
      setIsChatRulesOpen(true);
    }
  }

  function handleChatInputKeyDown(e) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      cycleChatHistory(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cycleChatHistory(1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitChat(null);
    }
  }

  desktopChatHelpersRef.current = {
    formatChatUnreadSuffix,
    formatChatMessageTime,
    isEditedChatMessage,
    isSystemAuthor,
    getChatMessageReplyPreview,
    getChatMessageReactionEntries,
  };

  desktopChatActionsRef.current = {
    appendChatEmoji,
    beginChatEditFromMessage,
    changeChatDesktopFontScale: handleChatDesktopFontScaleChange,
    clearChatEditTarget,
    clearChatReplyTarget,
    deleteOwnChatMessage,
    focusChatInput,
    handleChatInputFocus,
    handleChatInputKeyDown,
    handleDesktopChatScroll,
    openChatRules: () => setIsChatRulesOpen(true),
    openDesktopChatReactionDetails,
    openDesktopChatReactionPicker,
    openUserMenu,
    prepareDesktopChatInputFocus,
    scheduleCloseDesktopChatReactionDetails,
    setActiveArea,
    setChatInputValue: (value, target) => {
      setChatInput(value);
      autoResizeDesktopChatInput(target);
    },
    setChatReplyTargetFromMessage,
    setChatTab,
    submitChat,
    toggleBlockedList: () => setShowBlockedList((prev) => !prev),
    toggleDesktopEmojiPicker: () => setIsDesktopEmojiPickerOpen((prev) => !prev),
    unblockInstallId,
  };

  const showResultsWordPath =
    phase === "results" && !isMobileLayout && analysis?.word && highlightPath.length > 0;
  const usedSet = React.useMemo(
    () => (phase === "playing" ? new Set(highlightPath) : new Set()),
    [highlightPath, phase]
  );
  useEffect(() => {
    resultsFeature.configurePathPreview({
      enabled: showResultsWordPath,
      gridElement: gridRef.current,
      path: highlightPath,
      subscribeViewport: (listener) =>
        layoutFeature.subscribeViewport(listener, [VIEWPORT_EVENTS.WINDOW_RESIZE]),
      tileElements: tileRefs.current,
    });
  }, [highlightPath, layoutFeature, resultsFeature, showResultsWordPath]);
  useEffect(() => {
    layoutFeature.configureForegroundGridGuard({
      enabled: !isMobileLayout && phase === "playing",
      gridElement: gridRef.current,
    });
  }, [isMobileLayout, layoutFeature, phase]);
  const hintCellSet = React.useMemo(() => {
    if (
      specialRound?.type !== "target_long" ||
      specialHint?.kind !== "target_long" ||
      !specialHint?.cells?.length
    ) {
      return new Set();
    }
    return new Set(specialHint.cells.filter((idx) => Number.isInteger(idx)));
  }, [specialHint, specialRound?.type]);
  const hintCellStyleMap = React.useMemo(() => {
    if (
      specialRound?.type !== "target_long" ||
      specialHint?.kind !== "target_long" ||
      !specialHint?.cells?.length
    ) {
      return new Map();
    }
    return buildTargetHintStyleMap(
      specialHint.cells,
      specialHint.wordIndices,
      specialHint.length
    );
  }, [specialHint, specialRound?.type]);
  const hintCellOverlayStyleMap = React.useMemo(() => {
    if (
      specialRound?.type !== "target_long" ||
      specialHint?.kind !== "target_long" ||
      !specialHint?.cells?.length
    ) {
      return new Map();
    }
    return buildTargetHintOverlayStyleMap(
      specialHint.cells,
      specialHint.wordIndices,
      specialHint.length,
      "fill"
    );
  }, [specialHint, specialRound?.type]);
  const hintOutlineCellSet = React.useMemo(() => {
    if (
      specialRound?.type !== "target_score" ||
      specialHint?.kind !== "target_score" ||
      !specialHint?.cells?.length
    ) {
      return new Set();
    }
    return new Set(specialHint.cells.filter((idx) => Number.isInteger(idx)));
  }, [specialHint, specialRound?.type]);
  const hintOutlineStyleMap = React.useMemo(() => {
    if (
      specialRound?.type !== "target_score" ||
      specialHint?.kind !== "target_score" ||
      !specialHint?.cells?.length
    ) {
      return new Map();
    }
    return buildTargetHintStyleMap(
      specialHint.cells,
      specialHint.wordIndices,
      specialHint.length
    );
  }, [specialHint, specialRound?.type]);
  const hintOutlineOverlayStyleMap = React.useMemo(() => {
    if (
      specialRound?.type !== "target_score" ||
      specialHint?.kind !== "target_score" ||
      !specialHint?.cells?.length
    ) {
      return new Map();
    }
    return buildTargetHintOverlayStyleMap(
      specialHint.cells,
      specialHint.wordIndices,
      specialHint.length,
      "outline"
    );
  }, [specialHint, specialRound?.type]);
  const solvedTargetWord =
    foundTargetThisRound && typeof foundTargetWord === "string"
      ? foundTargetWord.trim()
      : "";
  const shouldDefinitionBlink = definitionBlink && phase === "playing";
  const specialHintDisplay = solvedTargetWord
    ? buildCompletedTargetPattern(specialHint?.pattern || "", solvedTargetWord)
    : specialHint?.pattern || buildTargetBlankPattern(specialHint?.length);
  const isTargetHintRound =
    specialRound?.type === "target_long" || specialRound?.type === "target_score";
  const targetScoreMax =
    specialRound?.type === "target_score"
      ? Number.isFinite(roundStats?.maxPts) && roundStats.maxPts > 0
        ? roundStats.maxPts
        : bestGridMaxRef.current || null
      : null;
  const nextHintSeconds =
    isTargetHintRound &&
    phase === "playing" &&
    Number.isFinite(serverEndsAt) &&
    Number.isFinite(serverRoundDurationMs) &&
    specialHint?.length &&
    !solvedTargetWord
      ? (() => {
          const startAt = serverEndsAt - serverRoundDurationMs;
          if (!Number.isFinite(startAt)) return null;
          const now = getNowServerMs();
          const elapsed = Math.max(0, now - startAt);
          const schedule = Array.isArray(targetHintScheduleMs)
            ? targetHintScheduleMs
                .filter((value) => Number.isFinite(value) && value >= 0)
                .sort((a, b) => a - b)
            : [];
          if (!schedule.length) return null;
          const nextOffsetMs = schedule.find((value) => value > elapsed + 10);
          if (!Number.isFinite(nextOffsetMs)) return null;
          const nextAt = startAt + nextOffsetMs;
          const remainingMs = Math.max(0, nextAt - now);
          return Math.max(0, Math.ceil(remainingMs / 1000));
        })()
      : null;
  const nextHintLabel =
    nextHintSeconds !== null
      ? `Nouvel indice dans : ${nextHintSeconds}s.`
      : "Nouvel indice dans : -- s.";
  const showSolvedTargetLoupe = Boolean(solvedTargetWord);
        // Mot en cours d'écriture : on prend l'état, et si jamais
  // il est vide on tombe sur la ref (utile pour certains cas tactile)
  const livePreviewPath =
    Array.isArray(highlightPath) && highlightPath.length > 0
      ? highlightPath
      : Array.isArray(highlightPathRef.current)
      ? highlightPathRef.current
      : [];
  const liveWordTiles =
    livePreviewPath.length > 0
      ? livePreviewPath
          .map((idx) => getLivePreviewLabelForCell(board?.[idx]))
          .filter((chunk) => String(chunk || "").trim())
      : currentTiles.length > 0
      ? currentTiles
      : currentTilesRef.current;
  const liveWord =
    currentTiles.length > 0
      ? currentTiles.join("")
      : currentTilesRef.current.join("");
  const safeDailySlotIndex = clampValue(
    Number.isFinite(dailyActiveSlot) ? dailyActiveSlot : 0,
    0,
    Math.max(0, DAILY_SPECIAL_WORD_TARGET - 1)
  );
  const dailyLiveWordNorm = normalizeWord(liveWord || "");
  const dailyLiveWordBlockedReason = getDailySpecialWordBlockedReason(
    dailyLiveWordNorm,
    highlightPath,
    dailyWordSlots,
    safeDailySlotIndex
  );
  const dailyLiveWordValid =
    isSpecial3WordsMode &&
    phase === "playing" &&
    !!dailyLiveWordNorm &&
    dailyLiveWordNorm.length >= 2 &&
    isKnownSubmissionWord(dailyLiveWordNorm) &&
    !dailyLiveWordBlockedReason &&
    Array.isArray(highlightPath) &&
    highlightPath.length > 0;
  const dailyLiveWordScore = dailyLiveWordValid
    ? computeScore(
        dailyLiveWordNorm,
        highlightPath,
        isSpecial3WordsMode ? dailyBoardForScore : board,
        specialScoreConfig
      )
    : null;
  special3TraceResolverRef.current = (snapshot) => {
    const tracePath = Array.isArray(snapshot?.highlightPath)
      ? snapshot.highlightPath
      : [];
    const traceTiles = Array.isArray(snapshot?.currentTiles)
      ? snapshot.currentTiles
      : [];
    const traceWord = traceTiles.join("");
    const normalizedWord = normalizeWord(traceWord);
    const blockedReason = getDailySpecialWordBlockedReason(
      normalizedWord,
      tracePath,
      dailyWordSlots,
      safeDailySlotIndex
    );
    const valid =
      isSpecial3WordsMode &&
      phase === "playing" &&
      normalizedWord.length >= 2 &&
      isKnownSubmissionWord(normalizedWord) &&
      !blockedReason &&
      tracePath.length > 0;
    return {
      blockedReason,
      highlightPath: tracePath,
      liveWord: traceWord,
      normalizedWord,
      score: valid
        ? computeScore(
            normalizedWord,
            tracePath,
            isSpecial3WordsMode ? dailyBoardForScore : board,
            specialScoreConfig
          )
        : null,
      valid,
    };
  };
  const previewTotals = React.useMemo(() => {
    if (isTargetHintRound) {
      return { totalWords: null, totalScore: null };
    }
    const totalWords = Number.isFinite(roundStats?.words)
      ? roundStats.words
      : allWords.length > 0
      ? allWords.length
      : null;
    let totalScore = null;
    if (Number.isFinite(roundStats?.totalPts)) {
      totalScore = roundStats.totalPts;
    } else if (allWords.length > 0) {
      totalScore = allWords.reduce((sum, entry) => sum + (entry?.pts || 0), 0);
    }
    return { totalWords, totalScore };
  }, [roundStats, allWords, isTargetHintRound]);
  const boardForRender = isSpecial3WordsMode ? dailyBoardForScore : board;
  const special3Slots = isSpecial3WordsMode
    ? dailyWordSlotsScored.length
      ? dailyWordSlotsScored
      : createDailyWordSlots()
    : [];
  const special3ActiveSlotIndex = isSpecial3WordsMode
    ? getDailyActiveSlotIndex(special3Slots, safeDailySlotIndex)
    : 0;
  const foundDotStyle = React.useMemo(
    () => ({
      width: "0.4rem",
      height: "0.4rem",
      borderRadius: "9999px",
      backgroundColor: darkMode ? "#f8fafc" : "#0f172a",
      flexShrink: 0,
    }),
    [darkMode]
  );
  const highlightPlayersSet = React.useMemo(
    () => new Set(Array.isArray(highlightPlayers) ? highlightPlayers : []),
    [highlightPlayers]
  );
  const acceptedWordSet = React.useMemo(() => new Set(accepted), [accepted]);
  const bestPtsByFoundWord = acceptedBestPtsRef.current;

  const pendingWordEntries = React.useMemo(() => {
    const entries = [];
    submissionStatusRef.current.forEach((meta, word) => {
      if (!meta) return;
      entries.push({
        word,
        status: meta.status || "pending",
        userPts: meta.optimisticPts,
        reason: meta.reason || "",
        usedFakeTwins: !!meta.usedFakeTwins,
        fakeTwinsCompletionWord: !!meta.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!meta.fakeTwinsBonusOnly,
        ts: meta.ts || 0,
      });
    });
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return entries;
  }, [submissionTick]);

  const pendingStatusMap = React.useMemo(() => {
    const map = new Map();
    pendingWordEntries.forEach((entry) => {
      map.set(entry.word, entry);
    });
    return map;
  }, [pendingWordEntries]);

  const pendingCount = React.useMemo(
    () => pendingWordEntries.filter((e) => e.status === "pending").length,
    [pendingWordEntries]
  );
  const foundWordsCount = accepted.length + pendingCount;
  React.useEffect(() => {
    progressFeature.configure({
      acceptedWordMetaRef,
      allWords,
      board,
      cultureThemeChallenge,
      dailyDateId: dailyStatus?.dateId || dailyBoard?.dateId || null,
      dailyPlayMode,
      isDailyPlay,
      pendingStatusRef: submissionStatusRef,
      phase,
      roundId,
      roundStats,
      specialRound,
      onAcceptedWordsAvailable: () => {
        if (!LIVE_SOLVER_DURING_PLAY) return;
        if (specialRound?.type === "speed") return;
        if (specialRound?.type === "monstrous") return;
        if (specialRound?.type === "target_long") return;
        if (specialRound?.type === "target_score") return;
        if (specialRound?.type === OCID_TYPE) return;
        if (!dictionary || dictionary.size === 0) return;
        if (!board || board.length === 0) return;
        if (allWords.length) return;
        if (allWordsComputeRef.current.key) return;
        const onlineRound = Boolean(roundId);
        scheduleAllWordsCompute(board, {
          updateBestRefs: !onlineRound,
          jobKey: onlineRound ? `round-${roundId}` : `local-${Date.now()}`,
        });
      },
      onFakeTwinsCompleted: () => {
        playBonusVoice();
        triggerPraiseFlash("BONUS !", {
          kind: "bonus",
          shakeGrid: true,
          force: true,
          durationMs: 5200,
        });
        triggerConfettiBurst("target");
      },
      onCultureThemeCompleted: () => {
        playBonusVoice();
        triggerPraiseFlash("BONUS !", {
          kind: "bonus",
          shakeGrid: true,
          force: true,
          durationMs: 5200,
        });
        triggerConfettiBurst("target");
      },
    });
  }, [
    allWords,
    board,
    cultureThemeChallenge,
    dailyBoard?.dateId,
    dailyPlayMode,
    dailyStatus?.dateId,
    dictionary,
    isDailyPlay,
    phase,
    playBonusVoice,
    progressFeature,
    roundId,
    roundStats,
    specialRound,
    triggerConfettiBurst,
    triggerPraiseFlash,
  ]);
  const totalWordsLabel = Number.isFinite(previewTotals.totalWords)
    ? formatNumber(previewTotals.totalWords)
    : "?";
  const totalScoreLabel = Number.isFinite(previewTotals.totalScore)
    ? formatNumber(previewTotals.totalScore)
    : "?";
  const showPreviewStats =
    !liveWord && !isTargetHintRound && specialRound?.type !== OCID_TYPE;
  const vocabDeltaValue = Number.isFinite(vocabRoundDelta) ? Math.max(0, vocabRoundDelta) : 0;
  const vocabHasDelta = vocabDeltaValue > 0;
  const vocabDeltaLabel = vocabHasDelta ? `+${formatNumber(vocabDeltaValue)}` : "inchangé";
  const vocabTotalLabel = Number.isFinite(vocabCount)
    ? `${formatNumber(vocabCount)} mots uniques`
    : vocabLoading
    ? "Calcul en cours..."
    : "\u2014";
  const vocabWeeklyLabel = Number.isFinite(vocabWeeklyCount)
    ? `${formatNumber(vocabWeeklyCount)} cette semaine`
    : vocabLoading
    ? "Hebdo en cours..."
    : "";
  const vocabTotalValue = Number.isFinite(vocabCount) ? vocabCount : 0;
  const vocabLevel = getVocabLevelMeta(vocabTotalValue);
  const vocabPrevValue = vocabHasDelta
    ? Math.max(0, vocabTotalValue - vocabDeltaValue)
    : vocabTotalValue;
  const vocabPrevLevel = getVocabLevelMeta(vocabPrevValue);
  const vocabLevelUp =
    vocabHasDelta && vocabPrevLevel?.key && vocabLevel?.key && vocabPrevLevel.key !== vocabLevel.key;
  const vocabBaseValue = vocabPrevValue;
  const vocabLevelMin = Number.isFinite(vocabLevel?.min) ? vocabLevel.min : 0;
  const vocabLevelMax = Number.isFinite(vocabLevel?.max) ? vocabLevel.max : vocabTotalValue;
  const vocabLevelRange = Math.max(1, vocabLevelMax - vocabLevelMin);
  const vocabCurrentWithinLevel = clampValue(
    vocabTotalValue - vocabLevelMin,
    0,
    vocabLevelRange
  );
  const vocabBaseWithinLevel = clampValue(
    vocabBaseValue - vocabLevelMin,
    0,
    vocabLevelRange
  );
  const vocabLevelProgressPct = clampValue(
    (vocabCurrentWithinLevel / vocabLevelRange) * 100,
    0,
    100
  );
  const vocabLevelBasePct = clampValue(
    (vocabBaseWithinLevel / vocabLevelRange) * 100,
    0,
    100
  );
  const vocabLevelDeltaPct = Math.max(0, vocabLevelProgressPct - vocabLevelBasePct);
  const vocabCursorStyle = {
    left: `${vocabLevelProgressPct}%`,
    borderTopColor: vocabLevel?.color || (darkMode ? "#f8fafc" : "#0f172a"),
  };
  const vocabImageSrc = vocabLevel?.imageKey ? getImageUrl(vocabLevel.imageKey) : "";
  const renderVocabPanel = ({
    panelClassName = "",
    showDelta = true,
    showHeading = true,
  } = {}) => (
    <div
      className={`flex flex-col items-center ${showDelta ? "gap-3" : "gap-2"} ${panelClassName}`}
    >
      {showHeading ? (
        <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
          Vocabulaire
        </div>
      ) : null}
      {showDelta ? (
        <div className="text-4xl font-black tabular-nums">{vocabDeltaLabel}</div>
      ) : null}
      <div
        className={
          showDelta
            ? "text-xs font-semibold opacity-75 -mt-1"
            : "text-lg font-extrabold tabular-nums"
        }
      >
        {vocabTotalLabel}
      </div>
      {vocabWeeklyLabel ? (
        <div className="text-[11px] font-semibold opacity-65 -mt-1">
          {vocabWeeklyLabel}
        </div>
      ) : null}
      <div className="mt-2 w-full max-w-lg flex flex-col items-center gap-2">
        {vocabImageSrc ? (
          <div className="relative">
            <img
              src={vocabImageSrc}
              alt={vocabLevel?.label || "Niveau vocabulaire"}
              className="h-28 sm:h-32 w-auto select-none"
              draggable={false}
            />
            {vocabLevelUp ? (
              <div className="absolute -top-2 -right-3 rotate-6 rounded-full bg-red-500 text-white text-[9px] font-extrabold px-2 py-0.5 shadow-lg animate-pulse">
                nouveau !!
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm font-extrabold uppercase tracking-widest">
            {vocabLevel?.label || "Niveau"}
          </div>
        )}
        <div className="w-full">
          <div className="relative w-full px-1">
            <div
              className={`h-3 rounded-full overflow-hidden ${
                darkMode ? "bg-slate-800/80" : "bg-slate-200/80"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{
                  width: `${showDelta ? vocabLevelBasePct : vocabLevelProgressPct}%`,
                  background: darkMode
                    ? "rgba(248, 250, 252, 0.85)"
                    : "rgba(15, 23, 42, 0.85)",
                }}
              />
              {showDelta && vocabDeltaValue && vocabDeltaValue > 0 ? (
                <div
                  className="absolute inset-y-0 vocab-delta-fill"
                  style={{
                    left: `${vocabLevelBasePct}%`,
                    width: `${vocabLevelDeltaPct}%`,
                  }}
                />
              ) : null}
            </div>
            <div
              className="absolute -top-3"
              style={{
                ...vocabCursorStyle,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className="w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent border-t-[8px]"
                style={{ borderTopColor: vocabCursorStyle.borderTopColor }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const isSpeedRound = specialRound?.type === "speed";
  const rareBonusEnabledForResults = isRareBonusEnabledForSpecial(specialRound);
  const roundTilePointsVisible = tilePointsVisible && !isSpeedRound;
  const bonusEffectMultiplier =
    specialRound?.type === FINALE_TYPE
      ? Number(specialRound?.tileBonusMultiplier) || FINALE_TILE_BONUS_MULTIPLIER
      : 1;
  const speedWordScore = isSpeedRound
    ? specialRound?.fixedWordScore ?? SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK
    : null;
  const shouldBuildResultsWordData = phase !== "playing";
  const foundList = React.useMemo(() => {
    if (!shouldBuildResultsWordData) return [];
    const list = accepted.map((word) => ({
      word,
      isFound: true,
      status: "accepted",
      userPts: acceptedScoresRef.current.get(word),
      bestPts: allWordsMap.get(word)?.pts ?? bestPtsByFoundWord.get(word),
      usedFakeTwins:
        !!acceptedWordMetaRef.current.get(word)?.usedFakeTwins ||
        !!allWordsMap.get(word)?.usedFakeTwins,
      fakeTwinsCompletionWord:
        !!acceptedWordMetaRef.current.get(word)?.fakeTwinsCompletionWord ||
        !!allWordsMap.get(word)?.fakeTwinsCompletionWord,
      fakeTwinsBonusOnly:
        !!acceptedWordMetaRef.current.get(word)?.fakeTwinsBonusOnly ||
        !!allWordsMap.get(word)?.fakeTwinsBonusOnly,
      rareBonusWord:
        rareBonusEnabledForResults &&
        (!!acceptedWordMetaRef.current.get(word)?.rareBonusWord ||
          !!allWordsMap.get(word)?.rareBonusWord),
      rareBonusPoints:
        rareBonusEnabledForResults
          ? Number(acceptedWordMetaRef.current.get(word)?.rareBonusPoints) ||
            Number(allWordsMap.get(word)?.rareBonusPoints) ||
            0
          : 0,
      rarityBucket:
        rareBonusEnabledForResults
          ? acceptedWordMetaRef.current.get(word)?.rarityBucket ||
            allWordsMap.get(word)?.rarityBucket ||
            ""
          : "",
      cultureThemeWord:
        !!acceptedWordMetaRef.current.get(word)?.cultureThemeWord ||
        !!allWordsMap.get(word)?.cultureThemeWord ||
        isCurrentCultureThemeWord(word),
    }));
    pendingWordEntries.forEach((entry) => {
      if (acceptedWordSet.has(entry.word)) return;
      list.push({
        word: entry.word,
        isFound: entry.status !== "rejected",
        status: entry.status,
        userPts: entry.userPts,
        bestPts: allWordsMap.get(entry.word)?.pts ?? bestPtsByFoundWord.get(entry.word),
        reason: entry.reason,
        usedFakeTwins:
          !!entry?.usedFakeTwins ||
          !!acceptedWordMetaRef.current.get(entry.word)?.usedFakeTwins ||
          !!allWordsMap.get(entry.word)?.usedFakeTwins,
        fakeTwinsCompletionWord:
          !!entry?.fakeTwinsCompletionWord ||
          !!acceptedWordMetaRef.current.get(entry.word)?.fakeTwinsCompletionWord ||
          !!allWordsMap.get(entry.word)?.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly:
          !!entry?.fakeTwinsBonusOnly ||
          !!acceptedWordMetaRef.current.get(entry.word)?.fakeTwinsBonusOnly ||
          !!allWordsMap.get(entry.word)?.fakeTwinsBonusOnly,
        rareBonusWord:
          rareBonusEnabledForResults &&
          (!!entry?.rareBonusWord ||
            !!acceptedWordMetaRef.current.get(entry.word)?.rareBonusWord ||
            !!allWordsMap.get(entry.word)?.rareBonusWord),
        rareBonusPoints:
          rareBonusEnabledForResults
            ? Number(entry?.rareBonusPoints) ||
              Number(acceptedWordMetaRef.current.get(entry.word)?.rareBonusPoints) ||
              Number(allWordsMap.get(entry.word)?.rareBonusPoints) ||
              0
            : 0,
        rarityBucket:
          rareBonusEnabledForResults
            ? entry?.rarityBucket ||
              acceptedWordMetaRef.current.get(entry.word)?.rarityBucket ||
              allWordsMap.get(entry.word)?.rarityBucket ||
              ""
            : "",
        cultureThemeWord:
          !!entry?.cultureThemeWord ||
          !!acceptedWordMetaRef.current.get(entry.word)?.cultureThemeWord ||
          !!allWordsMap.get(entry.word)?.cultureThemeWord ||
          isCurrentCultureThemeWord(entry.word),
      });
    });
    return list;
  }, [
    accepted,
    acceptedWordSet,
    allWordsMap,
    bestPtsByFoundWord,
    pendingWordEntries,
    rareBonusEnabledForResults,
    shouldBuildResultsWordData,
  ]);
  const suppressWordListScores = specialRound?.type === DAILY_SPECIAL_MODE;
  const isMassiveBoggleRoundForResults = specialRound?.type === MASSIVE_BOGGLE_TYPE;
  const sortResultsWordsByLength = suppressWordListScores || isMassiveBoggleRoundForResults;
  const compareWordsByLengthAlpha = (a, b) => {
    const lenDiff =
      normalizeWord(String(b?.word || "")).length - normalizeWord(String(a?.word || "")).length;
    if (lenDiff !== 0) return lenDiff;
    return String(a?.word || "").localeCompare(String(b?.word || ""), "fr", {
      sensitivity: "base",
    });
  };
  const scoreForSort = (entry) =>
    typeof entry.bestPts === "number" ? entry.bestPts : entry.userPts || 0;
  foundList.sort((a, b) =>
    sortResultsWordsByLength
      ? compareWordsByLengthAlpha(a, b)
      : scoreForSort(b) - scoreForSort(a)
  );
  const baseList = shouldBuildResultsWordData
    ? allWords.length > 0
      ? allWords
      : foundList
    : [];
  const displayList = React.useMemo(
    () => {
      if (!shouldBuildResultsWordData) return [];
      return baseList.map((entry) => ({
        word: entry.word,
        isFound: acceptedWordSet.has(entry.word),
        status: pendingStatusMap.get(entry.word)?.status || entry.status || "idle",
        reason: pendingStatusMap.get(entry.word)?.reason || entry.reason || "",
        usedFakeTwins:
          !!pendingStatusMap.get(entry.word)?.usedFakeTwins ||
          !!entry?.usedFakeTwins ||
          !!allWordsMap.get(entry.word)?.usedFakeTwins ||
          !!acceptedWordMetaRef.current.get(entry.word)?.usedFakeTwins,
        fakeTwinsCompletionWord:
          !!pendingStatusMap.get(entry.word)?.fakeTwinsCompletionWord ||
          !!entry?.fakeTwinsCompletionWord ||
          !!allWordsMap.get(entry.word)?.fakeTwinsCompletionWord ||
          !!acceptedWordMetaRef.current.get(entry.word)?.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly:
          !!pendingStatusMap.get(entry.word)?.fakeTwinsBonusOnly ||
          !!entry?.fakeTwinsBonusOnly ||
          !!allWordsMap.get(entry.word)?.fakeTwinsBonusOnly ||
          !!acceptedWordMetaRef.current.get(entry.word)?.fakeTwinsBonusOnly,
        rareBonusWord:
          rareBonusEnabledForResults &&
          (!!pendingStatusMap.get(entry.word)?.rareBonusWord ||
            !!entry?.rareBonusWord ||
            !!allWordsMap.get(entry.word)?.rareBonusWord ||
            !!acceptedWordMetaRef.current.get(entry.word)?.rareBonusWord),
        rareBonusPoints:
          rareBonusEnabledForResults
            ? Number(pendingStatusMap.get(entry.word)?.rareBonusPoints) ||
              Number(entry?.rareBonusPoints) ||
              Number(allWordsMap.get(entry.word)?.rareBonusPoints) ||
              Number(acceptedWordMetaRef.current.get(entry.word)?.rareBonusPoints) ||
              0
            : 0,
        rarityBucket:
          rareBonusEnabledForResults
            ? pendingStatusMap.get(entry.word)?.rarityBucket ||
              entry?.rarityBucket ||
              allWordsMap.get(entry.word)?.rarityBucket ||
              acceptedWordMetaRef.current.get(entry.word)?.rarityBucket ||
              ""
            : "",
        cultureThemeWord:
          !!pendingStatusMap.get(entry.word)?.cultureThemeWord ||
          !!entry?.cultureThemeWord ||
          !!allWordsMap.get(entry.word)?.cultureThemeWord ||
          !!acceptedWordMetaRef.current.get(entry.word)?.cultureThemeWord ||
          isCurrentCultureThemeWord(entry.word),
        userPts: (() => {
          const raw =
            pendingStatusMap.get(entry.word)?.userPts ??
            acceptedScoresRef.current.get(entry.word);
          if (speedWordScore == null) return raw;
          const status = pendingStatusMap.get(entry.word)?.status || entry.status || "idle";
          const isPending = status === "pending";
          const isFound = acceptedWordSet.has(entry.word) || isPending;
          return isFound ? speedWordScore : raw;
        })(),
        bestPts:
          speedWordScore == null
            ? typeof entry.pts === "number"
              ? entry.pts
              : entry.bestPts
            : speedWordScore,
      }));
    },
    [
      acceptedWordSet,
      baseList,
      pendingStatusMap,
      rareBonusEnabledForResults,
      shouldBuildResultsWordData,
      speedWordScore,
    ]
  );
  if (sortResultsWordsByLength) {
    displayList.sort(compareWordsByLengthAlpha);
  }
  const hoveredResultsWordSet = React.useMemo(() => {
    const nickKey = String(hoveredResultsNick || "").trim().toLowerCase();
    if (!nickKey || !Array.isArray(finalResults)) return new Set();
    const row = finalResults.find(
      (entry) => String(entry?.nick || "").trim().toLowerCase() === nickKey
    );
    const words = Array.isArray(row?.words) ? row.words : [];
    const next = new Set();
    words.forEach((rawWord) => {
      const norm = normalizeWord(rawWord);
      if (norm) next.add(norm);
    });
    return next;
  }, [finalResults, hoveredResultsNick]);
  const gobbleBadgeUrl = getImageUrl(IMAGE_KEYS.gobbleBadge);
  const isSpeedRoundForResults = specialRound?.type === "speed";
  const isSpecial3RoundForResults = specialRound?.type === DAILY_SPECIAL_MODE;
  const gobbleMaxPts = isSpeedRoundForResults || isMassiveBoggleRoundForResults
    ? 0
    : displayList.reduce((max, entry) => {
        const pts = entry.bestPts;
        if (!Number.isFinite(pts)) return max;
        return Math.max(max, pts);
      }, 0);
  const gobbleMaxLen = displayList.reduce((max, entry) => {
    const len = normalizeWord(entry.word || "").length;
    return Math.max(max, len);
  }, 0);
  const gobbleCandidates = React.useMemo(() => {
    const map = new Map();
    if (gobbleMaxPts <= 0 && gobbleMaxLen <= 0) return map;
    displayList.forEach((entry) => {
      const len = normalizeWord(entry.word || "").length;
      const isBest =
        !isSpecial3RoundForResults &&
        !isSpeedRoundForResults &&
        !isMassiveBoggleRoundForResults &&
        Number.isFinite(entry.bestPts) &&
        entry.bestPts === gobbleMaxPts;
      const isLong = len > 0 && len === gobbleMaxLen;
      if (!isBest && !isLong) return;
      map.set(entry.word, { best: isBest, long: isLong });
    });
    return map;
  }, [
    displayList,
    gobbleMaxLen,
    gobbleMaxPts,
    isMassiveBoggleRoundForResults,
    isSpecial3RoundForResults,
    isSpeedRoundForResults,
  ]);
  const special3LongestWordLen =
    isSpecial3WordsMode && Number.isFinite(roundStats?.maxLen) ? Number(roundStats.maxLen) : 0;
  const renderSpecial3LengthGobbleBadge = (word) => {
    if (!gobbleBadgeUrl || !special3LongestWordLen || !word) return null;
    const len = normalizeWord(String(word || "")).length;
    if (len <= 0 || len !== special3LongestWordLen) return null;
    return (
      <img
        src={gobbleBadgeUrl}
        alt="G"
        className="block h-3.5 w-auto"
        style={{ imageRendering: "auto" }}
      />
    );
  };
  const renderGobbleCandidate = (word) => {
    const meta = gobbleCandidates.get(word);
    if (!meta) return null;
    const count = (meta.best ? 1 : 0) + (meta.long ? 1 : 0);
    if (!count) return null;
    return (
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: count }).map((_, idx) =>
          gobbleBadgeUrl ? (
            <img
              key={`gobble-candidate-${word}-${idx}`}
              src={gobbleBadgeUrl}
              alt="G"
              className="block h-3 w-auto"
              style={{ imageRendering: "auto" }}
            />
          ) : (
            <span
              key={`gobble-candidate-${word}-${idx}`}
              className={darkMode ? "text-white" : "text-black"}
            >
              G
            </span>
          )
        )}
      </span>
    );
  };
  // messages visibles dans le chat (dynamique), ancrés en bas
  const chatRuntimeSnapshot = chatFeature.store.getState();
  const chatMessagesSnapshot = chatRuntimeSnapshot.messages;
  const homeChatBotUnreadCount = chatRuntimeSnapshot.homeBotUnreadCount;
  const homeChatUnreadCount = chatRuntimeSnapshot.homeUnreadCount;
  const mobileChatBotUnreadCount = chatRuntimeSnapshot.mobileBotUnreadCount;
  const mobileChatUnreadCount = chatRuntimeSnapshot.mobileUnreadCount;
  const blockedInstallIdSet = React.useMemo(
    () => new Set(blockedInstallIds),
    [blockedInstallIds]
  );
  const filteredChatMessages = React.useMemo(() => {
    if (!blockedInstallIdSet.size) return chatMessagesSnapshot;
    return chatMessagesSnapshot.filter((msg) => {
      const authorInstallId = typeof msg.installId === "string" ? msg.installId : "";
      return !authorInstallId || !blockedInstallIdSet.has(authorInstallId);
    });
  }, [chatMessagesSnapshot, blockedInstallIdSet]);
  const chatMessagesOnly = React.useMemo(
    () =>
      filteredChatMessages.filter(
        (msg) =>
          !isSystemChatMessage(msg) &&
          shouldDisplayChatMessageForBotSettings(msg, showBotMessages, chatBotVisibility)
      ),
    [filteredChatMessages, showBotMessages, chatBotVisibility]
  );
  const chatSystemMessages = React.useMemo(
    () => filteredChatMessages.filter((msg) => isSystemChatMessage(msg)),
    [filteredChatMessages]
  );
  const safeChatTab = chatTab === "system" ? "system" : "messages";
  const activeChatMessages =
    safeChatTab === "system" ? chatSystemMessages : chatMessagesOnly;
  const visibleMessages = activeChatMessages;
  const lastMessageId =
    visibleMessages[visibleMessages.length - 1]?.id ?? null;
  const chatSystemCount = chatSystemMessages.length;
  const chatMessagesUnreadCount = isLoggedIn
    ? mobileChatUnreadCount
    : homeChatUnreadCount;
  const mobileChatUnreadIsBotOnly =
    mobileChatUnreadCount > 0 && mobileChatBotUnreadCount >= mobileChatUnreadCount;
  const homeChatUnreadIsBotOnly =
    homeChatUnreadCount > 0 && homeChatBotUnreadCount >= homeChatUnreadCount;

  const selfNick = nickname.trim();
  const blockedCount = blockedInstallIds.length;
  const chatInputDisabled = !chatRulesAccepted;
  const chatInputPlaceholder = chatRulesAccepted
    ? "Écrire un message..."
    : "Accepte les règles pour discuter";
  const blockedEntries = React.useMemo(() => {
    if (!blockedInstallIds.length) return [];
    const labelMap = new Map();
    players.forEach((player) => {
      if (player?.installId && player?.nick) {
        labelMap.set(player.installId, player.nick);
      }
    });
    chatMessagesSnapshot.forEach((msg) => {
      const id = typeof msg.installId === "string" ? msg.installId : "";
      const nick = (msg.nick || msg.author || "").trim();
      if (id && nick) labelMap.set(id, nick);
    });
    return blockedInstallIds.map((id) => ({
      id,
      label: labelMap.get(id) || `Joueur ${id.slice(0, 6)}`,
    }));
  }, [blockedInstallIds, players, chatMessagesSnapshot]);
  const selfReadyForTournament = React.useMemo(() => {
    const cleanSelf = selfNick.trim();
    if (!cleanSelf && !installId) return false;
    return (Array.isArray(players) ? players : []).some((player) => {
      if (!player?.readyForTournament) return false;
      if (installId && String(player?.installId || "") === String(installId)) return true;
      return cleanSelf && String(player?.nick || "").trim() === cleanSelf;
    });
  }, [installId, players, selfNick]);
  const visiblePlayerList = React.useMemo(() => {
    const safe = Array.isArray(players) ? players : [];
    const filtered = !blockedInstallIdSet.size
      ? safe
      : safe.filter((player) => {
          if (!player?.installId) return true;
          return !blockedInstallIdSet.has(player.installId);
        });
    return [...filtered].sort(
      (a, b) => Number(!!a?.inTraining) - Number(!!b?.inTraining)
    );
  }, [players, blockedInstallIdSet]);
  const playersAlphaList = React.useMemo(() => {
    const safe = Array.isArray(visiblePlayerList) ? visiblePlayerList : [];
    const seen = new Set();
    const entries = [];
    safe.forEach((player) => {
      const nick = player?.nick ? String(player.nick).trim() : "";
      if (!nick || seen.has(nick)) return;
      seen.add(nick);
      entries.push({
        nick,
        userId: normalizeUserIdForProfile(player?.userId),
        installId: player?.installId != null ? String(player.installId) : "",
        playerKey: player?.playerKey ? String(player.playerKey) : "",
        team: player?.team || null,
        isBot: !!player?.isBot,
        afk: !!player?.afk,
        readyForTournament: !!player?.readyForTournament,
        inTraining: !!player?.inTraining,
        trainingMode: player?.trainingMode || null,
        weeklyVocabPodiumRank: Number(player?.weeklyVocabPodiumRank) || 0,
        isWeeklyVocabChampion: !!player?.isWeeklyVocabChampion,
        isDailyChampion:
          !!player?.isDailyChampion ||
          (!!duelStatus?.crowned &&
            ((installId && String(player?.installId || "") === String(installId)) ||
              (selfNick && nick === selfNick))),
      });
    });
    entries.sort((a, b) => {
      const trainingDiff = Number(!!a?.inTraining) - Number(!!b?.inTraining);
      return trainingDiff || a.nick.localeCompare(b.nick, "fr", { sensitivity: "base" });
    });
    return entries;
  }, [visiblePlayerList]);
  const playersCountForLobby = React.useMemo(() => {
    const safeRooms = Array.isArray(roomsStats) ? roomsStats : [];
    const lobbyRoomId = roomId || getDefaultRoomId();
    const roomEntry = safeRooms.find((entry) => entry?.roomId === lobbyRoomId);
    if (Number.isFinite(roomEntry?.humanPlayers)) return roomEntry.humanPlayers;
    if (lobbyPlayersList.length) {
      return lobbyPlayersList.filter((player) => !player?.isBot).length;
    }
    const safe = Array.isArray(players) ? players : [];
    const seen = new Set();
    safe.forEach((player) => {
      if (player?.isBot) return;
      const nick = player?.nick ? String(player.nick).trim() : "";
      if (!nick) return;
      seen.add(nick);
    });
    return seen.size;
  }, [roomsStats, roomId, lobbyPlayersList, players]);
  const dailyEntriesRaw = React.useMemo(
    () => (Array.isArray(dailyBoard?.entries) ? dailyBoard.entries : []),
    [dailyBoard?.entries]
  );
  const dailyEntries = React.useMemo(
    () => dailyEntriesRaw.filter((entry) => !entry?.isPalier),
    [dailyEntriesRaw]
  );
  const dailyWidgetEntries = isMobileLayout ? dailyEntriesRaw : dailyEntries;
  const dailyRankingSource = React.useMemo(() => {
    const allEntries = Array.isArray(dailyWidgetEntries) ? dailyWidgetEntries : [];
    const currentDailyMode =
      dailyPlayMode === DAILY_SPECIAL_MODE
        ? DAILY_SPECIAL_MODE
        : dailyPlayMode === DAILY_FAKE_TWINS_MODE
        ? DAILY_FAKE_TWINS_MODE
        : DAILY_MONSTROUS_MODE;
    return isDailyPlay
      ? allEntries.filter((entry) => {
          if (entry?.isPalier) return true;
          const entryMode =
            entry?.mode === DAILY_SPECIAL_MODE
              ? DAILY_SPECIAL_MODE
              : entry?.mode === DAILY_FAKE_TWINS_MODE
              ? DAILY_FAKE_TWINS_MODE
              : DAILY_MONSTROUS_MODE;
          return entryMode === currentDailyMode;
        })
      : allEntries;
  }, [dailyWidgetEntries, isDailyPlay, dailyPlayMode]);
  const liveRosterConfig = {
    authenticatedUserId,
    dailyPlayMode,
    dailyRankingSource,
    duelStatus,
    installId,
    isDailyPlay,
    normalizeUserIdForProfile,
    selfNick,
  };

  useLayoutEffect(() => {
    if (phase !== "results") return;
    if (!wordListFlipPendingRef.current) return;

    const prevRects = wordListFlipPrevRectsRef.current;
    wordListFlipPendingRef.current = false;
    if (!prevRects || prevRects.size === 0) return;

    clearWordListFlipArtifacts();
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      return;
    }

    const startRaf = window.requestAnimationFrame(() => {
      displayList.forEach((entry) => {
        if (!isFoundLikeEntry(entry)) return;
        const el = listItemRefs.current.get(entry.word);
        if (!el) return;
        const prevRect = prevRects.get(entry.word);
        if (!prevRect) return;
        const nextRect = el.getBoundingClientRect();
        const dx = prevRect.left - nextRect.left;
        const dy = prevRect.top - nextRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.willChange = "transform";

        const settleRaf = window.requestAnimationFrame(() => {
          if (!el.isConnected) return;
          el.style.transition = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
          const timeoutId = setTimeout(() => {
            if (!el.isConnected) return;
            el.style.transition = "";
            el.style.transform = "";
            el.style.willChange = "";
          }, 280);
          wordListFlipTimersRef.current.set(entry.word, timeoutId);
        });
        wordListFlipRafIdsRef.current.push(settleRaf);
      });
    });

    wordListFlipRafIdsRef.current.push(startRaf);
  }, [phase, showAllWords, displayList]);

  const triggerResultsReorder = React.useCallback(() => {
    setResultsReorderTick((prev) => prev + 1);
  }, []);

  const {
    clearResultsSlideTimers,
    goToResultsPage,
    handleResultsTouchEnd,
    handleResultsTouchMove,
    handleResultsTouchStart,
    mobileResultsPage,
    resultsDraggingRef,
    resultsPages: mobileResultPages,
    resultsSlidePhase,
    setMobileResultsPage,
    setResultsSlidePhase,
    shiftResultsPage,
  } = useResultsNavigation({
    isOcidResult: specialRound?.type === OCID_TYPE || !!targetSummary?.ocid,
    isStandaloneTraining: !!standaloneTrainingSession,
    isTargetRound:
      specialRound?.type === "target_long" ||
      specialRound?.type === "target_score" ||
      (phase === "results" && !!targetSummary),
    onRankingReorder: triggerResultsReorder,
    onSwipeSound: playSwipeSound,
    slideInMs: RESULTS_SLIDE_IN_MS,
    slideOutMs: RESULTS_SLIDE_OUT_MS,
    swipeThreshold: RESULTS_SWIPE_THRESHOLD,
  });
  useEffect(() => {
    mobileResultsPageRuntimeRef.current = mobileResultsPage;
  }, [mobileResultsPage]);

  const {
    finalePage,
    finalePagesCount,
    goToFinalePage,
    handleFinaleTouchEnd,
    handleFinaleTouchMove,
    handleFinaleTouchStart,
    setFinalePage,
    shiftFinalePage,
  } = useFinaleNavigation({
    onSwipeSound: playSwipeSound,
    pagesCount: 1 + FINALE_WEEKLY_BOARDS.length,
    swipeThreshold: RESULTS_SWIPE_THRESHOLD,
  });

  useEffect(() => {
    if (phase === "results") {
      setMobileResultsPage(0);
    }
  }, [phase]);
  useEffect(() => {
    return () => {
      clearResultsSlideTimers();
      clearWordListFlipArtifacts();
      wordListFlipPrevRectsRef.current = new Map();
      wordListFlipPendingRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (phase === "results") return;
    clearResultsSlideTimers();
    clearWordListFlipArtifacts();
    wordListFlipPrevRectsRef.current = new Map();
    wordListFlipPendingRef.current = false;
    setResultsSlidePhase("idle");
    resultsDraggingRef.current = false;
  }, [phase]);
  useEffect(() => {
    if (phase === "results" && !isMobileLayout) {
      setDesktopResultsSummaryExpanded(true);
    }
  }, [phase, isMobileLayout]);
  const isTargetRound =
    specialRound?.type === "target_long" ||
    specialRound?.type === "target_score" ||
    (phase === "results" && !!targetSummary);
  const isOcidRound = specialRound?.type === OCID_TYPE;
  const ocidDefinitionText = String(
    ocidVote?.definition ||
      specialRound?.ocidDefinition ||
      specialRound?.definition ||
      targetSummary?.ocid?.definition ||
      targetSummary?.definition ||
      ""
  ).trim();
  const openSettingsPanel = React.useCallback(() => {
    setIsSettingsOpen(true);
  }, []);
  React.useEffect(() => {
    ocidFeature.configureRound({
      isOcidRound,
      phase,
      roundId,
      socket,
    });
  }, [isOcidRound, ocidFeature, phase, roundId, socket]);
  const handleOcidProposalChange = React.useCallback(
    (value) => ocidFeature.updateProposal(value),
    [ocidFeature]
  );
  const handleClearOcidProposal = React.useCallback(
    () => ocidFeature.clearProposal(),
    [ocidFeature]
  );
  const submitOcidProposal = React.useCallback(
    () => ocidFeature.submitProposal(),
    [ocidFeature]
  );
  const submitOcidVote = React.useCallback(
    (optionId) => ocidFeature.submitVote(optionId),
    [ocidFeature]
  );
  const selfNickForResults = nicknameRef.current.trim();
  const selfNickKeyForResults = normalizeNickKey(selfNickForResults);
  const ocidSummary = targetSummary?.ocid || null;
  const ocidScoring = ocidSummary?.scoring || {};
  const selfOcidResult =
    ocidSummary && selfNickKeyForResults && Array.isArray(finalResults)
      ? finalResults.find((entry) => normalizeNickKey(entry?.nick) === selfNickKeyForResults) || null
      : null;
  const selfOcidDetail = selfOcidResult?.ocid || null;
  const selfOcidSubmittedWord = String(selfOcidDetail?.proposal || "").trim().toUpperCase();
  const selfOcidVoters = Array.isArray(selfOcidDetail?.votersForProposal)
    ? selfOcidDetail.votersForProposal.map((nick) => String(nick || "").trim()).filter(Boolean)
    : [];
  const selfOcidVoteWord = String(selfOcidDetail?.vote || "").trim();
  const selfOcidVoteOption = Array.isArray(ocidSummary?.options)
    ? ocidSummary.options.find(
        (option) => normalizeWord(option?.display || "") === normalizeWord(selfOcidVoteWord)
      ) || null
    : null;
  const selfOcidVotedAuthors =
    selfOcidVoteOption && !selfOcidVoteOption.isTarget && Array.isArray(selfOcidVoteOption.authors)
      ? selfOcidVoteOption.authors.map((nick) => String(nick || "").trim()).filter(Boolean)
      : [];
  const selfOcidExternalVotedAuthors = selfOcidVotedAuthors.filter(
    (nick) => normalizeNickKey(nick) !== selfNickKeyForResults
  );
  const selfOcidOwnWrongVote =
    !!selfOcidVoteOption &&
    !selfOcidVoteOption.isTarget &&
    selfOcidVotedAuthors.some((nick) => normalizeNickKey(nick) === selfNickKeyForResults);
  const selfOcidOwnWrongVoteMessage = selfOcidOwnWrongVote
    ? formatOcidMessage(
        pickStableOcidMessage(
          selfOcidDetail?.validProposal
            ? OCID_SELF_WRONG_VALID_VOTE_MESSAGES
            : OCID_SELF_WRONG_INVALID_VOTE_MESSAGES,
          `${roundId}|${selfNickForResults}|self-vote|${selfOcidSubmittedWord}`
        ),
        { word: selfOcidSubmittedWord || selfOcidVoteWord || "votre mot" }
      )
    : "";
  const selfOcidBluffVoteValue = Number(ocidScoring?.bluffVote) || 0;
  const selfOcidGiftedTotalPoints = selfOcidExternalVotedAuthors.length * selfOcidBluffVoteValue;
  const selfOcidAudienceLabel =
    selfOcidVoters.length === 1 ? "un joueur" : `${selfOcidVoters.length} joueurs`;
  const selfOcidAudienceCaps =
    selfOcidAudienceLabel.charAt(0).toUpperCase() + selfOcidAudienceLabel.slice(1);
  const selfOcidBluffMessage = selfOcidVoters.length
    ? formatOcidMessage(
        pickStableOcidMessage(
          selfOcidDetail?.validProposal ? OCID_VALID_BLUFF_MESSAGES : OCID_INVALID_BLUFF_MESSAGES,
          `${roundId}|${selfNickForResults}|${selfOcidSubmittedWord}|${selfOcidVoters.join(",")}`
        ),
        {
          word: selfOcidSubmittedWord || "votre mot",
          audience: selfOcidAudienceLabel,
          audienceCaps: selfOcidAudienceCaps,
        }
      )
    : formatOcidMessage(
        pickStableOcidMessage(
          OCID_NO_VOTER_MESSAGES,
          `${roundId}|${selfNickForResults}|${selfOcidSubmittedWord}`
        ),
        { word: selfOcidSubmittedWord || "votre mot" }
      );
  const selfOcidTargetDetail = selfOcidDetail?.exactTarget
    ? `+${Number(selfOcidDetail?.exactTargetPoints) || Number(ocidScoring?.exactTarget) || 0} pts pour l'avoir tracé`
    : selfOcidDetail?.correctVote
    ? `+${Number(selfOcidDetail?.correctVotePoints) || Number(ocidScoring?.correctVote) || 0} pts pour l'avoir retrouvé au vote`
    : "Pas trouvé cette fois.";
  const selfOcidVoteDetail = selfOcidVoteOption?.isTarget
    ? "Vous avez voté pour le vrai mot cible."
    : selfOcidOwnWrongVoteMessage
    ? selfOcidOwnWrongVoteMessage
    : selfOcidExternalVotedAuthors.length
    ? `Vous avez voté pour la proposition de : ${selfOcidExternalVotedAuthors.join(", ")}`
    : "Aucun vote enregistré.";
  const selfOcidGiftDetail =
    selfOcidExternalVotedAuthors.length && selfOcidBluffVoteValue > 0
      ? selfOcidExternalVotedAuthors.length === 1
        ? `Vous avez offert ${formatNumber(selfOcidBluffVoteValue)} pts à ${selfOcidExternalVotedAuthors[0]}.`
        : `Vous avez offert ${formatNumber(selfOcidBluffVoteValue)} pts chacun à ${selfOcidExternalVotedAuthors.join(", ")} (${formatNumber(selfOcidGiftedTotalPoints)} pts au total).`
      : "";
  const selfOcidBluffPanelText = selfOcidDetail?.exactTarget
    ? "Vous n'avez pas bluffé : vous avez trouvé le mot cible dès le traçage."
    : selfOcidBluffMessage;
  const selfOcidBluffPoints =
    Number(selfOcidDetail?.bluffVotePoints) ||
    selfOcidVoters.length * selfOcidBluffVoteValue;
  const ocidMobileResultKey =
    ocidSummary && phase === "results"
      ? `${roundId || ""}|${String(ocidSummary.word || "")}|${selfNickKeyForResults}`
      : "";
  const ocidMobileResultOverlay =
    isMobileLayout &&
    phase === "results" &&
    ocidSummary &&
    ocidMobileResultKey &&
    ocidMobileResultDismissedKey !== ocidMobileResultKey ? (
      <Suspense fallback={null}>
        <OcidResultOverlay
          darkMode={darkMode}
          targetWord={ocidSummary.word || ""}
          targetDetail={selfOcidTargetDetail}
          voteDetail={selfOcidVoteDetail}
          giftDetail={selfOcidGiftDetail}
          bluffDetail={selfOcidBluffPanelText}
          voters={selfOcidVoters}
          bluffPoints={selfOcidBluffPoints}
          gobbleEarned={!!selfOcidDetail?.gobbleEarned}
          onClose={() => setOcidMobileResultDismissedKey(ocidMobileResultKey)}
        />
      </Suspense>
    ) : null;
  useEffect(() => {
    if (phase !== "results" || !ocidSummary || !selfOcidResult || !selfOcidDetail) return;
    const toastKey = [
      roundId,
      selfNickKeyForResults,
      selfOcidResult.score || 0,
      selfOcidSubmittedWord,
      selfOcidVoteWord,
      selfOcidVoters.join("|"),
    ].join("#");
    if (ocidResultToastKeyRef.current === toastKey) return;
    ocidResultToastKeyRef.current = toastKey;
    ocidResultToastDelayTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    ocidResultToastDelayTimersRef.current = [];
    const queue = [];
    const exactPoints =
      Number(selfOcidDetail.exactTargetPoints) ||
      (selfOcidDetail.exactTarget ? Number(ocidScoring?.exactTarget) || 0 : 0);
    const validPoints =
      Number(selfOcidDetail.validProposalPoints) ||
      (selfOcidDetail.validProposal ? Number(ocidScoring?.validProposal) || 0 : 0);
    const votePoints =
      Number(selfOcidDetail.correctVotePoints) ||
      (selfOcidDetail.correctVote ? Number(ocidScoring?.correctVote) || 0 : 0);
    const bluffPointValue = Number(ocidScoring?.bluffVote) || 0;
    if (selfOcidDetail.gobbleEarned) {
      queue.push("GOBBLE ! +1 point au classement du mini-tournoi");
      try {
        playGobbleVoice();
        triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: false });
        triggerConfettiBurst("gobble");
      } catch (_) {}
    }
    if (validPoints > 0) queue.push(`+${validPoints} points pour mot valide`);
    if (exactPoints > 0) queue.push(`+${exactPoints} bravo ! mot cible trouvé`);
    if (votePoints > 0) queue.push(`+${votePoints} points pour ton vote`);
    selfOcidVoters.forEach((nick) => {
      queue.push(`+${bluffPointValue} ${nick} a voté pour ton mot !`);
    });
    queue.forEach((message, idx) => {
      const timerId = setTimeout(() => {
        showToastRef.current?.(message, 2600);
      }, idx * 900);
      ocidResultToastDelayTimersRef.current.push(timerId);
    });
  }, [
    phase,
    ocidSummary,
    selfOcidResult,
    selfOcidDetail,
    roundId,
    selfNickKeyForResults,
    selfOcidSubmittedWord,
    selfOcidVoteWord,
    selfOcidVoters,
    ocidScoring,
  ]);
  const selfHasResultsThisRound =
    phase === "results" && selfNickForResults && Array.isArray(finalResults)
      ? finalResults.some((entry) => normalizeNickKey(entry?.nick) === selfNickKeyForResults)
      : false;
  const showOfflineResultsLabel =
    phase === "results" && !standaloneTrainingSession && !selfHasResultsThisRound;
  const guidedResultsEligible =
    !isDailyView &&
    isMobileLayout &&
    phase === "results" &&
    !isTargetRound &&
    !isOcidRound &&
    !showOfflineResultsLabel;
  const guidedResultsPages = guidedResultsEligible ? mobileResultPages : [];
  const guidedResultsPageKey = guidedResultsPages.length
    ? guidedResultsPages[clampValue(mobileResultsPage, 0, guidedResultsPages.length - 1)]
    : null;
  const guidedWordTarget =
    guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_WORD &&
    guidedResultsPageKey === "all" &&
    displayList.length > 0
      ? displayList[1]?.word || displayList[0]?.word
      : null;
  useEffect(() => {
    if (!isMobileLayout || phase !== "results") return;
    const pages = mobileResultPages;
    setMobileResultsPage((prev) => clampValue(prev, 0, pages.length - 1));
  }, [isMobileLayout, phase, mobileResultPages, setMobileResultsPage]);

  useEffect(() => {
    if (!isMobileLayout || phase !== "results") return;
    const pages = mobileResultPages;
    const pageKey = pages[clampValue(mobileResultsPage, 0, pages.length - 1)];
    if (pageKey === "round") setResultsRankingMode("round");
    if (pageKey === "total") setResultsRankingMode("total");
    if (pageKey === "found" && showAllWords) {
      prepareWordListFlip(displayList);
      setShowAllWords(false);
    }
    if (pageKey === "all" && !showAllWords) {
      prepareWordListFlip(displayList);
      setShowAllWords(true);
    }
  }, [
    isMobileLayout,
    phase,
    mobileResultPages,
    mobileResultsPage,
    showAllWords,
    displayList,
    specialRound,
    targetSummary,
  ]);
  useEffect(() => {
    if (phase !== "playing" || !specialRound?.isSpecial) return;
    if (inputLocked) return;
    if (isMobileLayout && mobileRoundIntroStage !== "idle") return;
    if (!isAccountAuthenticated) return;
    if (!accountSeenReady) return;
    if (accountSeenMarkers.has(buildSpecialTutorialSeenMarker(specialRound.type))) return;
    if (isSpecialTutorialOpen) return;
    setSpecialTutorialPlan(specialRound);
    setSpecialTutorialStepIndex(0);
    setIsSpecialTutorialOpen(true);
  }, [
    phase,
    roundId,
    specialRound,
    isAccountAuthenticated,
    isSpecialTutorialOpen,
    inputLocked,
    isMobileLayout,
    mobileRoundIntroStage,
    accountSeenReady,
    accountSeenMarkers,
  ]);
  useEffect(() => {
    if (phase === "playing" && (specialRound?.isSpecial || (isDailyPlay && dailyPlayMode === DAILY_SPECIAL_MODE))) {
      return;
    }
    if (isSpecialTutorialOpen) {
      setIsSpecialTutorialOpen(false);
    }
    if (specialTutorialPlan) {
      setSpecialTutorialPlan(null);
    }
  }, [phase, specialRound, isSpecialTutorialOpen, specialTutorialPlan, isDailyPlay, dailyPlayMode]);
  useEffect(() => {
    if (!isDailyPlay || dailyPlayMode !== DAILY_SPECIAL_MODE) return;
    if (!isAccountAuthenticated) return;
    if (!accountSeenReady) return;
    if (accountSeenMarkers.has(buildSpecialTutorialSeenMarker(DAILY_SPECIAL_MODE))) return;
    if (isSpecialTutorialOpen) return;
    setSpecialTutorialPlan({
      isSpecial: true,
      type: DAILY_SPECIAL_MODE,
      label: "3 mots",
      tutorialContext: "daily",
    });
    setSpecialTutorialStepIndex(0);
    setIsSpecialTutorialOpen(true);
  }, [
    isDailyPlay,
    dailyPlayMode,
    isAccountAuthenticated,
    isSpecialTutorialOpen,
    accountSeenReady,
    accountSeenMarkers,
  ]);
  useEffect(() => {
    const shouldPause = isDailySpecial3TutorialActive;
    if (shouldPause) {
      if (!Number.isFinite(dailySpecialTutorialPauseStartedAtRef.current)) {
        dailySpecialTutorialPauseStartedAtRef.current = getNowServerMs();
      }
      return;
    }
    const pausedAt = dailySpecialTutorialPauseStartedAtRef.current;
    if (!Number.isFinite(pausedAt)) return;
    dailySpecialTutorialPauseStartedAtRef.current = null;
    const pauseMs = Math.max(0, getNowServerMs() - pausedAt);
    if (pauseMs <= 0) return;
    setServerEndsAt((prev) => (Number.isFinite(prev) ? prev + pauseMs : prev));
    if (Number.isFinite(dailySessionRef.current?.startedAt)) {
      dailySessionRef.current = {
        ...dailySessionRef.current,
        startedAt: dailySessionRef.current.startedAt + pauseMs,
      };
    }
  }, [isDailySpecial3TutorialActive]);
  useEffect(() => {
    if (!isSpecial3TutorialInteractiveActive) return;
    if (specialTutorialStepIndex !== 0) return;
    const hasPlacedBonus = DAILY_SPECIAL_BONUSES.some((bonusKey) =>
      Number.isInteger(dailySpecialPlacements?.[bonusKey])
    );
    if (hasPlacedBonus) {
      setSpecialTutorialStepIndex(1);
    }
  }, [isSpecial3TutorialInteractiveActive, specialTutorialStepIndex, dailySpecialPlacements]);
  useEffect(() => {
    if (!isSpecial3TutorialInteractiveActive) return;
    if (specialTutorialStepIndex !== 1) return;
    const hasValidatedWord = special3Slots.some((slot) => String(slot?.word || "").trim());
    if (hasValidatedWord) {
      setSpecialTutorialStepIndex(2);
    }
  }, [isSpecial3TutorialInteractiveActive, specialTutorialStepIndex, special3Slots]);
  useEffect(() => {
    if (!(isMobileLayout && isSpecial3TutorialInteractiveActive && specialTutorialStepIndex === 1)) {
      setMobileSpecial3Step2OverlayStyle(null);
      return;
    }
    let rafId = null;
    const measure = () => {
      const hostRect = mobileSpecial3TutorialHostRef.current?.getBoundingClientRect?.();
      const secondSlotRect = mobileSpecial3SecondSlotRef.current?.getBoundingClientRect?.();
      const gridRect = mobileSpecial3GridWrapRef.current?.getBoundingClientRect?.();
      if (!hostRect || !secondSlotRect || !gridRect) return;
      const top = Math.max(0, Math.round(secondSlotRect.top - hostRect.top));
      const bottom = Math.max(0, Math.round(hostRect.bottom - gridRect.top + 4));
      if (top >= hostRect.height - bottom) return;
      setMobileSpecial3Step2OverlayStyle((prev) => {
        const next = { top: `${top}px`, bottom: `${bottom}px` };
        return prev?.top === next.top && prev?.bottom === next.bottom ? prev : next;
      });
    };
    const scheduleMeasure = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };
    scheduleMeasure();
    const unsubscribeViewport = layoutFeature.subscribeViewport(scheduleMeasure, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
    ]);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      unsubscribeViewport();
    };
  }, [
    isMobileLayout,
    isSpecial3TutorialInteractiveActive,
    specialTutorialStepIndex,
    liveWord,
    dailyWordSlotsScored,
    layoutFeature,
  ]);
  useEffect(() => {
    if (!(isMobileLayout && isSpecial3TutorialInteractiveActive && specialTutorialStepIndex === 0)) {
      setMobileSpecial3Step1GhostStyle(null);
      return;
    }
    let rafId = null;
    const measure = () => {
      const hostRect = mobileSpecial3TutorialHostRef.current?.getBoundingClientRect?.();
      const gridRect = mobileSpecial3GridWrapRef.current?.getBoundingClientRect?.();
      const bonusRect = mobileSpecial3BonusTrayRef.current?.getBoundingClientRect?.();
      if (!hostRect || !gridRect || !bonusRect) return;
      const startX = bonusRect.left + bonusRect.width * 0.2 - hostRect.left;
      const startY = bonusRect.top + bonusRect.height * 0.5 - hostRect.top;
      const endX = gridRect.left + gridRect.width * 0.52 - hostRect.left;
      const endY = gridRect.top + gridRect.height * 0.46 - hostRect.top;
      setMobileSpecial3Step1GhostStyle((prev) => {
        const next = {
          left: `${Math.round(startX)}px`,
          top: `${Math.round(startY)}px`,
          "--special3-ghost-dx": `${Math.round(endX - startX)}px`,
          "--special3-ghost-dy": `${Math.round(endY - startY)}px`,
        };
        return prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev["--special3-ghost-dx"] === next["--special3-ghost-dx"] &&
          prev["--special3-ghost-dy"] === next["--special3-ghost-dy"]
          ? prev
          : next;
      });
    };
    const scheduleMeasure = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };
    scheduleMeasure();
    const unsubscribeViewport = layoutFeature.subscribeViewport(scheduleMeasure, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
    ]);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      unsubscribeViewport();
    };
  }, [
    isMobileLayout,
    isSpecial3TutorialInteractiveActive,
    specialTutorialStepIndex,
    layoutFeature,
  ]);
  useEffect(() => {
    if (!guidedResultsEligible || !isAccountAuthenticated) return;
    if (!accountSeenReady) return;
    if (accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.guidedResultsTutorial)) return;
    setGuidedResultsStep((prev) => prev || GUIDED_RESULTS_STEPS.TAP_PSEUDO);
  }, [
    guidedResultsEligible,
    isAccountAuthenticated,
    accountSeenReady,
    accountSeenMarkers,
  ]);
  useEffect(() => {
    if (!guidedResultsEligible || !guidedResultsPageKey) return;
    const targetStep = GUIDED_RESULTS_PAGE_TO_STEP[guidedResultsPageKey];
    if (!targetStep) return;
    const targetIndex = GUIDED_RESULTS_STEP_ORDER.indexOf(targetStep);
    const maxAutoIndex = GUIDED_RESULTS_STEP_ORDER.indexOf(GUIDED_RESULTS_STEPS.TAP_WORD);
    if (targetIndex === -1) return;
    setGuidedResultsStep((prev) => {
      if (!prev || prev === GUIDED_RESULTS_STEPS.TAP_PSEUDO) return prev;
      const currentIndex = GUIDED_RESULTS_STEP_ORDER.indexOf(prev);
      if (currentIndex === -1 || currentIndex > maxAutoIndex) return prev;
      if (targetIndex <= currentIndex || prev === targetStep) return prev;
      return targetStep;
    });
  }, [guidedResultsEligible, guidedResultsPageKey]);
  function renderTournamentTotalRightLabel(points, gobbles) {
    const safePoints = Math.max(0, Number(points) || 0);
    const safeGobbles = Math.max(0, Number(gobbles) || 0);
    const gobbleBadge = renderGobbleBadge(safeGobbles);
    return (
      <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
        {gobbleBadge ? (
          <>
            {gobbleBadge}
            <span className="opacity-60">·</span>
          </>
        ) : null}
        <span>{formatNumber(safePoints) ?? 0} pts</span>
      </span>
    );
  }
  const finalRanking = useFinalRanking({
    finalResults,
    isTargetRound,
    specialRound,
    targetSummary,
    tournamentRoundPoints,
  });
  const resultsRankingList =
    resultsRankingMode === "total" ? tournamentRanking || [] : finalRanking;

  const endStats = useEndStats(
    allWords,
    board,
    finalResults,
    roundStats,
    specialRound,
    specialScoreConfig,
  );
  const { renderDesktopResultsDockPanel } = useDesktopResultsPresentation({
    analyzeWord,
    board,
    breakKind,
    clearResultsWordAnalysis,
    darkMode,
    duelBlueScore,
    duelRedScore,
    endStats,
    finalResults,
    gobbleBadgeUrl,
    isMobileLayout,
    isSpecial3RoundForResults,
    isSpeedRound,
    isTargetRound,
    nicknameRef,
    normalizeNickKey,
    openDefinition,
    phase,
    renderSpecial3PreviewTiles,
    resultsTeamDelta,
    serverStatus,
    shouldDefinitionBlink,
    specialRound,
    specialScoreConfig,
    standaloneTrainingSession,
    targetDefinition,
    targetSummary,
    tournament,
    upcomingSpecial,
  });
  const hasDesktopResultsSummary =
    phase === "results" && !isMobileLayout && !!(isTargetRound ? targetSummary : endStats);

  const { startDesktopColumnResize } = useDesktopLayoutController(
    appView,
    connectionError,
    desktopColumnBaseDefs,
    desktopColumnDefaultFractions,
    desktopColumnFractionsRef,
    desktopColumnMinWidthsPx,
    desktopColumnOrderRef,
    desktopColumnResizeRef,
    desktopGridResizeMaxTrackWidthRef,
    desktopViewportResizeTimerRef,
    hasDesktopResultsSummary,
    isLoggedIn,
    isMobileLayout,
    mainGridDesktopRef,
    phase,
    setDesktopColumnFractions,
    setDesktopColumnResizeActiveIndex,
    setDesktopGridMetrics,
    setDesktopMainGridHeight,
    setDesktopResultsDrawerLayout,
    setDesktopViewportResizeInProgress,
    showHelp,
  );

  const {
    gobbleAwardsForLive,
    gobbleWordAwardsByNick,
    weeklyRecordHighlights,
  } = useResultsAwards(
    announcements,
    board,
    endStats,
    finalResults,
    isTargetRound,
    lastRoundWindowRef,
    phase,
    roundStartAtRef,
    serverEndsAt,
    serverRoundDurationMs,
    specialRound,
    specialScoreConfig,
    WEEKLY_RECORD_LABELS,
    weeklyStats,
  );

  const roundRecordBadges = weeklyRecordHighlights.filter(
    (record) => record.section === "round"
  );
  const targetRecordBadges = weeklyRecordHighlights.filter(
    (record) => record.section === "target"
  );
  const buildRecordBadgeMap = (records) => {
    const map = new Map();
    records.forEach((record) => {
      const nick = record?.nick;
      if (!nick) return;
      const list = map.get(nick) || [];
      list.push(record);
      map.set(nick, list);
    });
    return map;
  };
  const roundRecordBadgesByNick = React.useMemo(
    () => buildRecordBadgeMap(roundRecordBadges),
    [roundRecordBadges]
  );
  const targetRecordBadgesByNick = React.useMemo(
    () => buildRecordBadgeMap(targetRecordBadges),
    [targetRecordBadges]
  );
  const recordBadgesByNickForRound =
    isTargetRound ? targetRecordBadgesByNick : roundRecordBadgesByNick;
  const [
    canOpenRoundPlayerDetails,
    closeRoundPlayerModal,
    getRoundRecordsForPlayer,
    navigateRoundPlayerModal,
    openRoundPlayerModal,
  ] = useLazyArrayController(
    createRoundPlayerDetailsRuntime,
    [
      allWords,
      allWordsMap,
      board,
      dedupeWeeklyEntries,
      finalRanking,
      finalResults,
      gobbleCandidates,
      isCurrentCultureThemeWord,
      isTargetRound,
      nicknameRef,
      playCloseSound,
      recordBadgesByNickForRound,
      roundPlayerAnchorElementRef,
      roundPlayerAnchorNickRef,
      roundPlayerModal,
      roundStats,
      setRoundPlayerModal,
      specialRound,
      specialScoreConfig,
      weeklyStats,
    ],
    5,
  );
  const devSelfCrownEnabled = !!devControls?.enabled && !!devControls?.selfCrown;
  const devSelfGoldNickEnabled = !!devControls?.enabled && !!devControls?.selfGoldNick;
  const crownedNickSet = React.useMemo(() => {
    const set = new Set();
    const add = (entry) => {
      if (!entry?.isDailyChampion && !entry?.crowned && !entry?.isWeeklyChampion) return;
      const nick = entry?.nick ? String(entry.nick).trim().toLowerCase() : "";
      if (nick) set.add(nick);
    };
    players.forEach(add);
    lobbyPlayersList.forEach(add);
    provisionalRanking.forEach(add);
    finalResults.forEach(add);
    (tournamentRanking || []).forEach(add);
    (tournamentSummary?.ranking || []).forEach(add);
    chatMessagesSnapshot.forEach(add);
    if (duelStatus?.crowned && selfNick) {
      set.add(String(selfNick).trim().toLowerCase());
    }
    return set;
  }, [
    players,
    lobbyPlayersList,
    provisionalRanking,
    finalResults,
    tournamentRanking,
    tournamentSummary,
    chatMessagesSnapshot,
    duelStatus?.crowned,
    selfNick,
  ]);

  function renderCrownIcon(className = "") {
    return (
      <span
        className={`inline-flex items-center ${
          darkMode ? "text-amber-300" : "text-amber-600"
        } ${className}`}
        title="Equipe gagnante de la semaine precedente"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M4 6l4.5 3 3.5-4 3.5 4L20 6l-2 10H6L4 6zm3 12h10l.4 2H6.6l.4-2z" />
        </svg>
      </span>
    );
  }

  function isCrownedEntry(nick, entry = null) {
    if (entry?.isDailyChampion || entry?.crowned || entry?.isWeeklyChampion) return true;
    const cleanNick = nick ? String(nick).trim() : "";
    if (devSelfCrownEnabled && cleanNick && !!selfNick && cleanNick === String(selfNick).trim()) {
      return true;
    }
    const cleanNickLower = cleanNick.toLowerCase();
    if (cleanNickLower && crownedNickSet.has(cleanNickLower)) return true;
    if (!duelStatus?.crowned) return false;
    const entryInstallId =
      entry?.installId != null ? String(entry.installId).trim() : "";
    if (installId && entryInstallId && entryInstallId === String(installId)) return true;
    return !!cleanNick && !!selfNick && cleanNick === String(selfNick).trim();
  }

  function renderGobbleBadge(gobbles) {
    const count = Number(gobbles) || 0;
    if (count <= 0) return null;
    const badgeUrl = getImageUrl(IMAGE_KEYS.gobbleBadge);
    const suffix = count > 1 ? `x${count}` : "";
    return (
      <span
        className={`inline-flex items-center justify-center gap-1 h-4 min-w-[16px] px-1 text-[9px] font-black ${
          darkMode ? "text-white" : "text-black"
        }`}
      >
        {badgeUrl ? (
          <img
            src={badgeUrl}
            alt="G"
            className="block h-3 w-auto"
            style={{ imageRendering: "auto" }}
          />
        ) : (
          <span>G</span>
        )}
        {suffix ? <span>{suffix}</span> : null}
      </span>
    );
  }

  const tournamentFinaleSummary = React.useMemo(() => {
    if (
      tournamentSummary &&
      Array.isArray(tournamentSummary.ranking) &&
      tournamentSummary.ranking.length > 0
    ) {
      return tournamentSummary;
    }
    if (Array.isArray(tournamentRanking) && tournamentRanking.length > 0) {
      const getRankingPoints = (entry) =>
        typeof entry.score === "number" ? entry.score : entry.points || 0;
      const getRankingGobbles = (entry) => Number(entry.gobbles) || 0;
      const getRankingRoundScoreSum = (entry) =>
        Number(entry.tieBreakRoundScore) || Number(entry.roundScoreSum) || 0;
      const rankingCore = [...tournamentRanking]
        .sort((a, b) => {
          const diff = getRankingPoints(b) - getRankingPoints(a);
          if (diff !== 0) return diff;
          const gdiff = getRankingGobbles(b) - getRankingGobbles(a);
          if (gdiff !== 0) return gdiff;
          const scoreTieDiff = getRankingRoundScoreSum(b) - getRankingRoundScoreSum(a);
          if (scoreTieDiff !== 0) return scoreTieDiff;
          return (a.nick || "").localeCompare(b.nick || "");
        });
      const tieMetaByNick = new Map();
      const groupsByPrimary = new Map();
      rankingCore.forEach((entry) => {
        const key = `${getRankingPoints(entry)}|${getRankingGobbles(entry)}`;
        const group = groupsByPrimary.get(key) || [];
        group.push(entry);
        groupsByPrimary.set(key, group);
      });
      groupsByPrimary.forEach((group) => {
        if (!Array.isArray(group) || group.length <= 1) return;
        const uniqueRoundScores = new Set(group.map((entry) => getRankingRoundScoreSum(entry)));
        const tieBreakBy = uniqueRoundScores.size > 1 ? "round_score_sum" : "alphabetical";
        group.forEach((entry) => {
          tieMetaByNick.set(entry.nick, {
            tieBreakBy,
            tieGroupSize: group.length,
          });
        });
      });
      const ranking = rankingCore
        .map((entry) => ({
          nick: entry.nick,
          points: typeof entry.score === "number" ? entry.score : entry.points || 0,
          gobbles: entry.gobbles ?? null,
          rightLabel: renderTournamentTotalRightLabel(
            typeof entry.score === "number" ? entry.score : entry.points || 0,
            entry.gobbles ?? 0
          ),
          roundScoreSum: getRankingRoundScoreSum(entry),
          tieBreakRoundScore: getRankingRoundScoreSum(entry),
          tieBreakBy:
            (typeof entry.tieBreakBy === "string" && entry.tieBreakBy) ||
            tieMetaByNick.get(entry.nick)?.tieBreakBy ||
            null,
          tieGroupSize:
            Number(entry.tieGroupSize) || tieMetaByNick.get(entry.nick)?.tieGroupSize || 0,
          isBot: !!entry.isBot,
          isDailyChampion: !!entry.isDailyChampion,
          weeklyVocabPodiumRank: Number(entry.weeklyVocabPodiumRank) || 0,
          isWeeklyVocabChampion: !!entry.isWeeklyVocabChampion,
        }));
      return {
        winnerNick: ranking[0]?.nick || null,
        ranking,
        records: {},
      };
    }
    return null;
  }, [tournamentSummary, tournamentRanking]);

  const tournamentFinaleMedals = React.useMemo(() => {
    const ranking = tournamentFinaleSummary?.ranking;
    if (!Array.isArray(ranking) || !ranking.length) return null;
    const medalOrder = ["gold", "silver", "bronze"];
    const map = {};
    medalOrder.forEach((medal, index) => {
      const entry = ranking[index];
      if (!entry?.nick) return;
      map[entry.nick] = { [medal]: 1 };
    });
    return map;
  }, [tournamentFinaleSummary]);

  const devSelfSilverNickEnabled = !!devControls?.enabled && !!devControls?.selfSilverNick;
  const devSelfBronzeNickEnabled = !!devControls?.enabled && !!devControls?.selfBronzeNick;
  const weeklyVocabPodiumEntries = React.useMemo(() => {
    const podium = Array.isArray(weeklyStats?.previousWeeklyVocabPodium)
      ? weeklyStats.previousWeeklyVocabPodium
      : [];
    if (podium.length) {
      return podium
        .map((entry, index) => ({ ...entry, rank: Number(entry?.rank) || index + 1 }))
        .filter((entry) => entry.rank >= 1 && entry.rank <= 3);
    }
    const champion = weeklyStats?.previousWeeklyVocabChampion;
    return champion && typeof champion === "object" ? [{ ...champion, rank: 1 }] : [];
  }, [weeklyStats?.previousWeeklyVocabChampion, weeklyStats?.previousWeeklyVocabPodium]);
  const weeklyVocabPodiumIdentities = React.useMemo(
    () =>
      weeklyVocabPodiumEntries.map((entry) => {
        const playerKey = String(entry?.playerKey || "").trim();
        const installId = String(
          entry?.installId ||
            (playerKey.startsWith("install:") ? playerKey.slice("install:".length) : "")
        ).trim();
        const userId =
          Number.isInteger(Number(entry?.userId)) && Number(entry.userId) > 0
            ? String(Number(entry.userId))
            : /^[1-9]\d*$/.test(installId)
            ? installId
            : "";
        return {
          rank: Number(entry?.rank) || 0,
          nick: String(entry?.nick || "").trim().toLowerCase(),
          playerKey,
          installId,
          userId,
        };
      }),
    [weeklyVocabPodiumEntries]
  );
  const weeklyVocabPodiumNickClassByRank = React.useMemo(
    () => ({
      1: "nick-podium-gold",
      2: "nick-podium-silver",
      3: "nick-podium-bronze",
    }),
    []
  );

  function getWeeklyVocabPodiumRank(entry = null, nick = "") {
    if (entry?.isBot) return 0;
    const cleanNick = nick ? String(nick).trim().toLowerCase() : "";
    const cleanSelfNick = selfNick ? String(selfNick).trim().toLowerCase() : "";
    if (cleanNick && cleanSelfNick && cleanNick === cleanSelfNick) {
      if (devSelfGoldNickEnabled) return 1;
      if (devSelfSilverNickEnabled) return 2;
      if (devSelfBronzeNickEnabled) return 3;
    }
    const explicitRank = Number(entry?.weeklyVocabPodiumRank) || 0;
    if (explicitRank >= 1 && explicitRank <= 3) return explicitRank;
    if (entry?.isWeeklyVocabChampion) return 1;
    const entryPlayerKey = String(entry?.playerKey || "").trim();
    const entryInstallId = String(
      entry?.installId ||
        (entryPlayerKey.startsWith("install:")
          ? entryPlayerKey.slice("install:".length)
          : "")
    ).trim();
    const entryUserId =
      Number.isInteger(Number(entry?.userId)) && Number(entry.userId) > 0
        ? String(Number(entry.userId))
        : /^[1-9]\d*$/.test(entryInstallId)
        ? entryInstallId
        : "";
    for (const identity of weeklyVocabPodiumIdentities) {
      if (!identity.rank) continue;
      if (identity.playerKey && entryPlayerKey && identity.playerKey === entryPlayerKey) {
        return identity.rank;
      }
      if (identity.installId && entryInstallId && identity.installId === entryInstallId) {
        return identity.rank;
      }
      if (identity.userId && entryUserId && identity.userId === entryUserId) {
        return identity.rank;
      }
      if (identity.nick && cleanNick && identity.nick === cleanNick) {
        return identity.rank;
      }
    }
    return 0;
  }

  function isWeeklyVocabChampionEntry(nick, entry = null) {
    return getWeeklyVocabPodiumRank(entry, nick || entry?.nick) === 1;
  }

  function getLiveNickClassName(entry = null, nick = "") {
    const rank = getWeeklyVocabPodiumRank(entry, nick || entry?.nick);
    const classes = [];
    if (weeklyVocabPodiumNickClassByRank[rank]) {
      classes.push(weeklyVocabPodiumNickClassByRank[rank]);
    }
    if (entry?.afk) {
      classes.push("text-red-600 dark:text-red-300 italic");
    }
    return classes.join(" ");
  }

  const botNickSet = React.useMemo(() => {
    const set = new Set();
    players.forEach((p) => {
      if (p?.isBot && p?.nick) set.add(p.nick);
    });
    lobbyPlayersList.forEach((p) => {
      if (p?.isBot && p?.nick) set.add(p.nick);
    });
    finalResults.forEach((entry) => {
      if (entry?.isBot && entry?.nick) set.add(entry.nick);
    });
    (tournamentRanking || []).forEach((entry) => {
      if (entry?.isBot && entry?.nick) set.add(entry.nick);
    });
    (tournamentFinaleSummary?.ranking || []).forEach((entry) => {
      if (entry?.isBot && entry?.nick) set.add(entry.nick);
    });
    return set;
  }, [players, lobbyPlayersList, finalResults, tournamentRanking, tournamentFinaleSummary]);

  const humanNickSet = React.useMemo(() => {
    const set = new Set();
    players.forEach((p) => {
      if (p?.isBot === false && p?.nick) set.add(p.nick);
    });
    lobbyPlayersList.forEach((p) => {
      if (p?.isBot === false && p?.nick) set.add(p.nick);
    });
    finalResults.forEach((entry) => {
      if (entry?.isBot === false && entry?.nick) set.add(entry.nick);
    });
    (tournamentRanking || []).forEach((entry) => {
      if (entry?.isBot === false && entry?.nick) set.add(entry.nick);
    });
    (tournamentFinaleSummary?.ranking || []).forEach((entry) => {
      if (entry?.isBot === false && entry?.nick) set.add(entry.nick);
    });
    if (selfNick) set.add(selfNick);
    return set;
  }, [players, lobbyPlayersList, finalResults, tournamentRanking, tournamentFinaleSummary, selfNick]);

  const teamByNick = React.useMemo(() => {
    const map = new Map();
    const put = (nick, team) => {
      const cleanNick = nick ? String(nick).trim() : "";
      if (!cleanNick) return;
      if (team !== "red" && team !== "blue") return;
      if (map.has(cleanNick)) return;
      map.set(cleanNick, team);
    };
    players.forEach((entry) => put(entry?.nick, entry?.team));
    lobbyPlayersList.forEach((entry) => put(entry?.nick, entry?.team));
    provisionalRanking.forEach((entry) => put(entry?.nick, entry?.team));
    finalResults.forEach((entry) => put(entry?.nick, entry?.team));
    (tournamentRanking || []).forEach((entry) => put(entry?.nick, entry?.team));
    (tournamentFinaleSummary?.ranking || []).forEach((entry) => put(entry?.nick, entry?.team));
    const boardEntries = Array.isArray(dailyBoard?.entries) ? dailyBoard.entries : [];
    boardEntries.forEach((entry) => put(entry?.nick, entry?.team));
    const historyDays = Array.isArray(dailyHistory?.days) ? dailyHistory.days : [];
    historyDays.forEach((day) => {
      if (!Array.isArray(day?.entries)) return;
      day.entries.forEach((entry) => put(entry?.nick, entry?.team));
    });
    if (selfNick && (duelStatus?.team === "red" || duelStatus?.team === "blue")) {
      map.set(selfNick, duelStatus.team);
    }
    return map;
  }, [
    players,
    lobbyPlayersList,
    provisionalRanking,
    finalResults,
    tournamentRanking,
    tournamentFinaleSummary,
    dailyBoard?.entries,
    dailyHistory?.days,
    duelStatus?.team,
    selfNick,
  ]);
  const nickDecorationKey = React.useMemo(() => {
    const setSignature = (set) =>
      Array.from(set || [])
        .map((value) => String(value || ""))
        .filter(Boolean)
        .sort()
        .join(",");
    const teamSignature = Array.from(teamByNick?.entries?.() || [])
      .map(([nick, team]) => `${String(nick || "").trim()}:${team}`)
      .filter((entry) => entry.length > 1)
      .sort()
      .join(",");
    let medalsSignature = "";
    let finaleMedalsSignature = "";
    try {
      medalsSignature = medals ? JSON.stringify(medals) : "";
    } catch (_) {
      medalsSignature = "";
    }
    try {
      finaleMedalsSignature = tournamentFinaleMedals ? JSON.stringify(tournamentFinaleMedals) : "";
    } catch (_) {
      finaleMedalsSignature = "";
    }
    return [
      devSelfCrownEnabled ? "dc1" : "dc0",
      devSelfGoldNickEnabled ? "dg1" : "dg0",
      devSelfSilverNickEnabled ? "ds1" : "ds0",
      devSelfBronzeNickEnabled ? "db1" : "db0",
      selfNick || "",
      phase,
      breakKind || "",
      tournamentSummaryAt || 0,
      tournamentFinaleHoldUntil || 0,
      setSignature(crownedNickSet),
      JSON.stringify(weeklyVocabPodiumIdentities),
      setSignature(botNickSet),
      setSignature(humanNickSet),
      teamSignature,
      medalsSignature,
      finaleMedalsSignature,
    ].join("|");
  }, [
    botNickSet,
    breakKind,
    crownedNickSet,
    devSelfCrownEnabled,
    devSelfGoldNickEnabled,
    devSelfSilverNickEnabled,
    devSelfBronzeNickEnabled,
    humanNickSet,
    medals,
    phase,
    selfNick,
    teamByNick,
    tournamentFinaleMedals,
    tournamentFinaleHoldUntil,
    tournamentSummaryAt,
    weeklyVocabPodiumIdentities,
  ]);

  function renderMedalsInline(nick, fallbackMedals) {
    const persistentMedals = medals?.[nick] || null;
    if (phase === "results" && breakKind === "tournament_end") {
      const times = [];
      if (tournamentSummaryAt) times.push(tournamentSummaryAt);
      if (tournamentFinaleHoldUntil) times.push(tournamentFinaleHoldUntil);
      if (times.length && getNowServerMs() < Math.max(...times)) {
        if (!persistentMedals) return null;
      }
    }
    const m = persistentMedals || fallbackMedals?.[nick];
    if (!m) return null;
    const renderMedalCount = (value) =>
      value > 1 ? (
        <span className="text-[10px] font-extrabold leading-none tabular-nums">
          {value}
        </span>
      ) : null;

    const parts = [];
    if (m.gold)
      parts.push(
        <span key="gold" className="inline-flex items-center gap-0.5">
          <span aria-hidden="true">{"\u{1F947}"}</span>
          {renderMedalCount(m.gold)}
        </span>
      );
    if (m.silver)
      parts.push(
        <span key="silver" className="inline-flex items-center gap-0.5">
          <span aria-hidden="true">{"\u{1F948}"}</span>
          {renderMedalCount(m.silver)}
        </span>
      );
    if (m.bronze)
      parts.push(
        <span key="bronze" className="inline-flex items-center gap-0.5">
          <span aria-hidden="true">{"\u{1F949}"}</span>
          {renderMedalCount(m.bronze)}
        </span>
      );

    return parts.length ? (
      <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap leading-none align-middle">
        {parts}
      </span>
    ) : null;
  }

  function renderMedals(nick, entryOrFallback, maybeFallback) {
    const entry =
      entryOrFallback && typeof entryOrFallback === "object" && !Array.isArray(entryOrFallback)
        ? entryOrFallback
        : null;
    const fallbackMedals = Array.isArray(entryOrFallback)
      ? entryOrFallback
      : Array.isArray(maybeFallback)
      ? maybeFallback
      : null;
    const medalsInline = renderMedalsInline(nick, fallbackMedals);
    const crown = isCrownedEntry(nick, entry) ? renderCrownIcon() : null;
    if (!medalsInline && !crown) return null;
    return (
      <span className="inline-flex items-center gap-0.5 ml-1">
        {crown}
        {medalsInline}
      </span>
    );
  }

  function renderHumanDot(nick, entry = null) {
    const explicitTeam =
      entry?.team === "red" || entry?.team === "blue" ? entry.team : null;
    if (explicitTeam) {
      return (
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            explicitTeam === "red" ? "bg-red-500" : "bg-blue-500"
          }`}
          aria-hidden="true"
        />
      );
    }
    if (!nick) return null;
    if (botNickSet.has(nick)) return null;
    if (!humanNickSet.has(nick)) return null;
    const team =
      (entry?.team === "red" || entry?.team === "blue" ? entry.team : null) ||
      teamByNick.get(nick) ||
      null;
    const colorClass =
      team === "red"
        ? "bg-red-500"
        : team === "blue"
        ? "bg-blue-500"
        : "bg-slate-400";
    return (
      <span
        className={`inline-block w-2 h-2 rounded-full ${colorClass}`}
        aria-hidden="true"
      />
    );
  }

  function renderNickSuffix(nick, entryOrFallback, maybeFallback) {
    const entry =
      entryOrFallback && typeof entryOrFallback === "object" && !Array.isArray(entryOrFallback)
        ? entryOrFallback
        : null;
    const fallbackMedals = Array.isArray(entryOrFallback)
      ? entryOrFallback
      : Array.isArray(maybeFallback)
      ? maybeFallback
      : null;
    const dot = renderHumanDot(nick, entry);
    const medalsInline = renderMedalsInline(nick, fallbackMedals);
    const crown = isCrownedEntry(nick, entry) ? renderCrownIcon() : null;
    const tieBreakRoundScore = Number(entry?.tieBreakRoundScore);
    const showTieBreakBadge =
      entry?.showTieBreakBadge === true &&
      entry?.tieBreakBy === "round_score_sum" &&
      Number(entry?.tieGroupSize) > 1 &&
      Number.isFinite(tieBreakRoundScore);
    if (!dot && !medalsInline && !crown && !showTieBreakBadge) return null;
    return (
      <span className="inline-flex min-w-0 max-w-full shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none align-middle">
        {crown}
        {dot}
        {medalsInline}
        {showTieBreakBadge ? (
          <span
            className={`inline-flex items-center rounded px-1 py-[1px] text-[9px] font-extrabold ${
              darkMode ? "bg-amber-300/20 text-amber-200" : "bg-amber-100 text-amber-800"
            }`}
            title={`Départage ex aequo: somme des scores de manches (${formatNumber(
              tieBreakRoundScore
            )})`}
          >
            {`TB ${formatNumber(tieBreakRoundScore)}`}
          </span>
        ) : null}
      </span>
    );
  }

  function renderGobbleWordAwardsInline(nick, countOverride = null) {
    const resolvedNick = nick ? String(nick).trim() : "";
    const liveAwards = resolvedNick ? gobbleAwardsForLive?.get?.(resolvedNick) || null : null;
    const count =
      Number.isFinite(countOverride) && countOverride > 0
        ? Math.trunc(countOverride)
        : (liveAwards?.bestWord ? 1 : 0) + (liveAwards?.longestWord ? 1 : 0);
    if (count <= 0) return null;
    const badgeUrl = getImageUrl(IMAGE_KEYS.gobbleBadge);
    return (
      <span className="inline-flex items-center gap-0.5 ml-1">
        {Array.from({ length: count }).map((_, idx) =>
          badgeUrl ? (
            <img
              key={`players-overlay-gobble-${resolvedNick || "nick"}-${idx}`}
              src={badgeUrl}
              alt="G"
              className="block h-3 w-auto"
              style={{ imageRendering: "auto" }}
            />
          ) : (
            <span
              key={`players-overlay-gobble-${resolvedNick || "nick"}-${idx}`}
              className={darkMode ? "text-white" : "text-black"}
            >
              G
            </span>
          )
        )}
      </span>
    );
  }

  function renderMobileNickSuffix(nick, entryOrFallback) {
    const entry =
      entryOrFallback && typeof entryOrFallback === "object" && !Array.isArray(entryOrFallback)
        ? entryOrFallback
        : null;
    const crown = isCrownedEntry(nick, entry) ? renderCrownIcon() : null;
    const dot = renderHumanDot(nick, entry);
    if (!crown && !dot) return null;
    return (
      <span className="inline-flex items-center gap-1 ml-1">
        {crown}
        {dot}
      </span>
    );
  }

  function renderRankDelta(entry) {
    const delta = typeof entry?.delta === "number" ? entry.delta : 0;
    if (!delta) return null;
    const up = delta > 0;
    return (
      <span
        className={`text-[10px] font-black tabular-nums ${
          up ? "text-emerald-600" : "text-red-600"
        }`}
        title={up ? `+${delta} places` : `${delta} places`}
      >
        {up ? "\u25B2" : "\u25BC"}
        {Math.abs(delta)}
      </span>
    );
  }

  function renderBlockedListPanel(className = "") {
    if (!showBlockedList) return null;
    return (
      <div
        className={`mt-2 rounded-lg border px-2 py-2 text-[11px] ${
          darkMode
            ? "bg-slate-900/70 border-slate-600 text-slate-100"
            : "bg-gray-50 border-gray-200 text-gray-700"
        } ${className}`}
      >
        {blockedCount === 0 ? (
          <div className="text-center">Aucun joueur bloqué.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blockedEntries.map((entry) => (
              <div key={entry.id} className="inline-flex items-center gap-2">
                <span className="font-semibold">{entry.label}</span>
                <button
                  type="button"
                  className={`text-[11px] font-semibold ${
                    darkMode ? "text-amber-300" : "text-blue-600"
                  }`}
                  onClick={() => unblockInstallId(entry.id)}
                >
                  Réactiver
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


  // Surbrillance par border-4 interne (plus de ring)
  const gameBlockClasses =
    "p-4 bg-white rounded-xl space-y-3 w-full max-w-md flex-shrink-0 " +
    (activeArea === "game" ? "border-4 border-black" : "border border-gray-300");

  const chatBlockClasses =
    "bg-white/90 dark:bg-slate-900/80 rounded-xl p-4 w-full justify-self-stretch flex flex-col h-full " +
    (activeArea === "chat" ? "border-4 border-black" : "border border-gray-300");
  const activeRoomId = currentRoomId || roomId;
  const activeRoom = ROOM_OPTIONS[activeRoomId] || ROOM_OPTIONS["room-4x4"];
  const isFinaleBanner =
    breakKind === "tournament_end" ||
    (tournament?.round &&
      tournament?.totalRounds &&
      tournament.round === tournament.totalRounds);
  const chatTopInsetPx = isFullscreen ? mobileHeaderOffsetPx : 0;
  const chatDrawerBaseHeightPx = Math.round(
    chatBodyLockHeightRef.current ||
      chatViewportHeight ||
      window.innerHeight ||
      document.documentElement?.clientHeight ||
      0
  );
  const chatDrawerHeightCeilingPx =
    chatDrawerBaseHeightPx > 0
      ? Math.max(
          220,
          Math.round(chatDrawerBaseHeightPx - chatTopInsetPx - CHAT_DRAWER_TOP_GAP_PX)
        )
      : 0;
  const chatKeyboardInsetForLayoutPx =
    isChatOpenMobile || isChatClosing ? Math.max(0, Math.round(chatKeyboardInsetPx || 0)) : 0;
  const chatDrawerVisibleHeightCeilingPx =
    chatDrawerBaseHeightPx > 0
      ? Math.max(
          180,
          Math.round(
            chatDrawerBaseHeightPx -
              chatKeyboardInsetForLayoutPx -
              chatTopInsetPx -
              CHAT_DRAWER_TOP_GAP_PX
          )
        )
      : 0;
  const chatDrawerEffectiveHeightCeilingPx =
    chatKeyboardInsetForLayoutPx > 0 && chatDrawerVisibleHeightCeilingPx > 0
      ? Math.min(chatDrawerHeightCeilingPx, chatDrawerVisibleHeightCeilingPx)
      : chatDrawerHeightCeilingPx;
  const chatDrawerCalibration =
    isChatOpenMobile || isChatClosing
      ? chatDrawerSessionCalibrationRef.current
      : chatDrawerCalibrationRef.current;
  const chatDrawerCalibrationMatchesOrientation =
    !!chatDrawerCalibration &&
    String(chatDrawerCalibration.orientation || "portrait") === getChatDrawerOrientationKey();
  const calibratedChatSheetHeightPx =
    chatDrawerEffectiveHeightCeilingPx > 0 && chatDrawerCalibrationMatchesOrientation
      ? clampValue(
          Number.isFinite(chatDrawerCalibration?.ratio)
            ? Math.round(chatDrawerBaseHeightPx * chatDrawerCalibration.ratio)
            : Number.isFinite(chatDrawerCalibration?.heightPx)
            ? Math.round(chatDrawerCalibration.heightPx)
            : 0,
          Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, chatDrawerEffectiveHeightCeilingPx),
          Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, chatDrawerEffectiveHeightCeilingPx)
        )
      : 0;
  const globalChatSheetHeightPx =
    chatDrawerEffectiveHeightCeilingPx > 0
      ? calibratedChatSheetHeightPx ||
        clampValue(
          Math.round(chatDrawerBaseHeightPx * CHAT_DRAWER_FIXED_HEIGHT_RATIO),
          Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, chatDrawerEffectiveHeightCeilingPx),
          Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, chatDrawerEffectiveHeightCeilingPx)
        )
      : 0;
  const chatViewportStyle = chatTopInsetPx
    ? { paddingTop: `${Math.max(0, chatTopInsetPx)}px` }
    : undefined;
  const globalChatOverlayStyle = undefined;
  const keyboardInsetReservePx = 0;
  const globalChatSheetStyle = globalChatSheetHeightPx
    ? {
        height: `${globalChatSheetHeightPx}px`,
        maxHeight: `${globalChatSheetHeightPx}px`,
      }
    : undefined;
  const desktopGridColumnHeight = Math.max(
    0,
    Number(playColumnHeight) || Number(desktopMainGridHeight) || 0
  );
  const desktopUiScale = isMobileLayout
    ? 1
    : computeDesktopUiScale({
        hostWidth: desktopGridMetrics.width,
        columnHeight: desktopGridColumnHeight,
        isDailyPlay,
      });
  const desktopResponsiveColumnFractions = normalizeDesktopColumnFractions(
    desktopColumnFractions,
    desktopColumnDefaultFractions
  );
  const desktopColumnUiScaleById = computeDesktopColumnUiScales({
    columnDefs: desktopColumnBaseDefs,
    columnFractions: desktopResponsiveColumnFractions,
    columnOrder: desktopColumnOrderSafe,
    gapPx: desktopGridMetrics.gapPx,
    globalScale: desktopUiScale,
    hostWidth: desktopGridMetrics.width,
    isDailyPlay,
  });
  const desktopGridUiScale = isMobileLayout
    ? 1
    : desktopColumnUiScaleById.grid || desktopUiScale;
  const desktopPlayersUiScale = isMobileLayout
    ? 1
    : desktopColumnUiScaleById.players || desktopUiScale;
  const desktopSideUiScale = isMobileLayout
    ? 1
    : desktopColumnUiScaleById.side || desktopUiScale;
  const desktopChatUiScale = isMobileLayout
    ? 1
    : desktopColumnUiScaleById.chat || desktopUiScale;
  const isCompactDesktopGridLayout =
    !isMobileLayout && desktopGridUiScale < 0.82;
  const desktopGridChrome = computeDesktopGridChrome(desktopGridUiScale);
  const desktopDefaultColumnUiScaleById = computeDesktopColumnUiScales({
    columnDefs: desktopColumnBaseDefs,
    columnFractions: desktopColumnDefaultFractions,
    columnOrder: desktopColumnOrderSafe,
    gapPx: desktopGridMetrics.gapPx,
    globalScale: desktopUiScale,
    hostWidth: desktopGridMetrics.width,
    isDailyPlay,
  });
  const desktopDefaultGridChrome = computeDesktopGridChrome(
    desktopDefaultColumnUiScaleById.grid || desktopUiScale
  );
  const desktopResponsiveBaseHeightPx = isMobileLayout
    ? 0
    : Math.max(
        DESKTOP_MAIN_GRID_MIN_HEIGHT,
        Number(desktopMainGridHeight) || 0
      );
  const desktopGridHeightBoundTrackWidthPx =
    computeDesktopGridResizeMaxTrackWidth({
      columnHeight: desktopResponsiveBaseHeightPx,
      gridChrome: desktopDefaultGridChrome,
      maxGridWidth: MAX_GRID_WIDTH,
    });
  const desktopGridTrackWidthLimitPx = desktopGridHeightBoundTrackWidthPx;
  desktopGridResizeMaxTrackWidthRef.current = desktopGridTrackWidthLimitPx;
  const desktopGridVisualWidthLimitPx = Math.max(
    1,
    Math.min(
      MAX_GRID_WIDTH,
      desktopGridTrackWidthLimitPx - desktopDefaultGridChrome.columnPadding - 12
    )
  );
  const previewBarMinHeight = desktopGridChrome.previewBarHeight;
  const validationBarPaddingPx = desktopGridChrome.validationPadding;
  const validationBarHeightPx = desktopGridChrome.validationBarHeight;
  const countdownBarHeightPx = desktopGridChrome.countdownBarHeight;
  const previewTileStyle = {};
  const lightPanelStyle = darkMode ? {} : { backgroundColor: "#ffffff" };
  const lightGridSurfaceStyle = undefined;
  const clampGridWidth = (raw) => {
    if (!raw || Number.isNaN(raw)) return null;
    const adjusted = raw - 24; // laisse un peu d'air avec les bordures/paddings
    return Math.min(MAX_GRID_WIDTH, Math.max(MIN_GRID_WIDTH, adjusted));
  };
  const measuredWidth = clampGridWidth(gridWidth);
  const fallbackWidth = clampGridWidth(
    playColumnRef.current?.getBoundingClientRect?.().width ||
      560
  );
  const widthCandidate =
    measuredWidth ??
    fallbackWidth ??
    Math.min(MAX_GRID_WIDTH, 360);
  const desktopGridStageWidth =
    !isMobileLayout &&
    desktopGridStageSize.width > 0
      ? desktopGridStageSize.width
      : null;
  const effectiveGridWidth = desktopGridStageWidth
    ? Math.min(
        desktopGridVisualWidthLimitPx,
        Math.max(1, desktopGridStageWidth - 12)
      )
    : Math.min(widthCandidate, desktopGridVisualWidthLimitPx);
  const isSquareMaterial = tileMaterialPreset === "square";
  const gapRatio = Math.max(0.08, Math.min(0.18, BASE_GAP_RATIO));
  const effectiveDesktopPaddingPx = isSquareMaterial
    ? 0
    : Math.min(GRID_PADDING_PX, Math.max(0, effectiveGridWidth * 0.12));
  const effectiveGapRatio = isSquareMaterial ? 0 : gapRatio;
  const innerGridWidth = Math.max(
    0,
    (effectiveGridWidth || 0) - effectiveDesktopPaddingPx
  );
  const tileSizeRaw =
    innerGridWidth > 0
      ? innerGridWidth / (gridSize + effectiveGapRatio * (gridSize - 1))
      : BASE_TILE_PX;
  const tileSizePx = Math.max(isMobileLayout ? MIN_TILE_SIZE : 1, tileSizeRaw);
  const tileGapPx = isSquareMaterial
    ? 0
    : clampValue(tileSizePx * gapRatio, isMobileLayout ? 4 : 0, 10);
  const computedGridWidth =
    tileSizePx * gridSize + tileGapPx * (gridSize - 1) + effectiveDesktopPaddingPx;
  const fontScale = 1;
  const tileFontPx = Math.max(
    isMobileLayout ? 14 : 8,
    Math.min(38, tileSizePx * 0.35 * fontScale)
  );
  const tileMaterialClass = getTileMaterialClass(tileMaterialPreset);
  const special3PreviewIsSquareMaterial = String(tileMaterialClass || "").includes("theme-material-square");
  function renderSpecial3PreviewTiles(
    wordValue,
    keyPrefix,
    pathValue = [],
    boardSource = null,
    options = {}
  ) {
    const value = String(wordValue || "");
    if (!value) return null;
    const align = options?.align === "left" ? "left" : "center";
    const disableRotation = !!options?.disableRotation;
    const edgePadding = !!options?.edgePadding;
    const compact = !!options?.compact;
    const reserveScaledWidth = !!options?.reserveScaledWidth;
    const minScale = Number.isFinite(options?.minScale)
      ? Math.max(0.25, Math.min(1, Number(options.minScale)))
      : 0.42;
    const onClick = typeof options?.onClick === "function" ? options.onClick : null;
    const title = typeof options?.title === "string" ? options.title : undefined;
    const ariaLabel = typeof options?.ariaLabel === "string" ? options.ariaLabel : title;
    const safePath = Array.isArray(pathValue) ? pathValue : [];
    const previewBoard =
      Array.isArray(boardSource) && boardSource.length > 0 ? boardSource : boardForRender;
    const canUsePath =
      safePath.length > 0 &&
      Array.isArray(previewBoard) &&
      safePath.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < previewBoard.length);
    const tiles = canUsePath
      ? safePath.map((boardIndex, idx) => {
          const cell = previewBoard[boardIndex] || {};
          return {
            id: `path-${idx}-${boardIndex}`,
            letter: String(cell.letter || ""),
            boardIndex,
            bonus: normalizeBonusLabel(cell.bonus),
          };
        })
      : value.split("").map((ch, idx) => ({
          id: `txt-${idx}-${ch}`,
          letter: ch,
          boardIndex: idx,
          bonus: null,
        }));
    const useFillIndicator = specialIndicatorPreset === "fill";
    const useRingIndicator = specialIndicatorPreset === "ring";
    const useBadgeIndicator = specialIndicatorPreset === "badge";
    const inner = (
        <AutoScaleInline
          minScale={minScale}
          align={align}
          estimatedContentWidth={
            tiles.length * (compact ? 22 : 28) +
            Math.max(0, tiles.length - 1) * (compact ? 2 : 4)
          }
          measurePaddingPx={edgePadding ? 4 : 1}
          reserveScaledWidth={reserveScaledWidth}
          className={compact ? "gap-0.5 py-0.5" : `gap-1 ${edgePadding ? "px-1" : ""}`}
        >
          {tiles.map((tile, idx) => {
            const angle = disableRotation ? 0 : ((idx * 17 + tiles.length * 13) % 11) - 5;
            const displayBonus = tile.bonus;
            const tileBaseClass =
              useFillIndicator && displayBonus ? BONUS_CLASSES[displayBonus] : defaultTileBaseClass;
            const letterRingClass =
              useRingIndicator && displayBonus ? getBonusLetterRingClass(displayBonus) : "";
            const textureStyle =
              getTileColorTextureStyle(
                Number.isInteger(tile.boardIndex) ? tile.boardIndex : idx,
                gridSize,
                tileColorPreset
              ) || {};
            return (
              <span
                key={`${keyPrefix}-${tile.id}`}
                className={[
                  compact
                    ? "tile-cell relative inline-flex items-center justify-center rounded px-1 h-6 min-w-[22px] text-xs font-black select-none"
                    : "tile-cell relative inline-flex items-center justify-center rounded-md px-1.5 h-7 min-w-[28px] text-sm font-black select-none",
                  tileMaterialClass,
                  tileBaseClass,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  transform: `rotate(${angle}deg)`,
                  pointerEvents: "none",
                  ...textureStyle,
                }}
              >
                <GridTileLetter cell={tile} className={letterRingClass} />
                {displayBonus && useBadgeIndicator ? (
                  <span
                    className={`absolute top-0 right-0 h-2.5 w-2.5 rounded-full shadow ${getBonusBadgeClass(
                      displayBonus
                    )}`}
                    aria-hidden="true"
                    style={{
                      transform: special3PreviewIsSquareMaterial
                        ? "translate(-25%, 25%)"
                        : "translate(25%, -25%)",
                    }}
                  />
                ) : null}
              </span>
            );
          })}
        </AutoScaleInline>
    );
    if (onClick) {
      return (
        <button
          type="button"
          className={`min-h-[28px] min-w-0 flex items-center w-full rounded-md text-left transition focus:outline-none focus:ring-2 focus:ring-blue-400/70 ${
            darkMode ? "hover:bg-slate-700/60" : "hover:bg-slate-100"
          }`}
          onClick={onClick}
          title={title}
          aria-label={ariaLabel}
        >
          {inner}
        </button>
      );
    }
    return (
      <div className={`${compact ? "min-h-[24px]" : "min-h-[28px]"} min-w-0 flex items-center`}>
        {inner}
      </div>
    );
  }
  const renderSpecial3BonusChipButton = (bonusKey, { keyPrefix = "special3", sizeClass = "h-12 min-w-12 px-3", pulse = false } = {}) => {
    const placedIndex = Number.isInteger(dailySpecialPlacements?.[bonusKey])
      ? dailySpecialPlacements[bonusKey]
      : null;
    const useFillIndicator = specialIndicatorPreset === "fill";
    const useRingIndicator = specialIndicatorPreset === "ring";
    const useBadgeIndicator = specialIndicatorPreset === "badge";
    const baseClass = useFillIndicator ? BONUS_CLASSES[bonusKey] : defaultTileBaseClass;
    const ringClass = useRingIndicator ? getBonusLetterRingClass(bonusKey) : "";
    return (
      <button
        key={`${keyPrefix}-${bonusKey}-${dailyLockPulseKey}`}
        type="button"
        className={[
          "relative rounded-xl border shadow-sm select-none touch-none",
          "flex items-center justify-center font-black text-sm",
          tileMaterialClass,
          baseClass,
          sizeClass,
          placedIndex != null ? "ring-2 ring-emerald-400/80" : "",
          pulse ? "special3-tutorial-pulse" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onPointerDown={(e) => beginDailySpecialDrag(e, bonusKey)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        aria-label={`Tuile ${bonusKey}`}
      >
        <span className={`tile-letter ${ringClass}`.trim()}>{bonusKey}</span>
        {useFillIndicator || useBadgeIndicator ? (
          <span
            className={`absolute top-0 right-0 text-[0.6rem] px-1 py-0.5 rounded-full font-black shadow ${getBonusBadgeClass(
              bonusKey
            )}`}
            style={{
              transform: special3PreviewIsSquareMaterial
                ? "translate(-8%, 8%)"
                : "translate(10%, -10%)",
            }}
          >
            {bonusKey}
          </span>
        ) : null}
        {placedIndex != null ? (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
            ✓
          </span>
        ) : null}
      </button>
    );
  };
  const special3DragGhostStyle =
    dailySpecialDrag &&
    Number.isFinite(dailySpecialDrag.x) &&
    Number.isFinite(dailySpecialDrag.y)
      ? {
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: 140,
          willChange: "transform",
        }
      : null;
  const special3DragGhost =
    special3DragGhostStyle && dailySpecialDrag?.bonusKey ? (
      <div
        ref={bindDailySpecialDragGhost}
        style={special3DragGhostStyle}
        className="pointer-events-none"
      >
        <div className={isMobileLayout ? "opacity-75 scale-[2]" : "opacity-75 scale-[1.03]"}>
          {renderSpecial3BonusChipButton(dailySpecialDrag.bonusKey, {
            keyPrefix: "drag-ghost-special3",
            sizeClass: "h-12 min-w-12 px-3",
          })}
        </div>
      </div>
    ) : null;
  const roundStartDelayed = isRoundStartPreparationDelayed({
    breakKind,
    nextStartAt,
    nowMs: getNowServerMs(),
    phase,
  });
  const countdownLines = React.useMemo(
    () => [
      <IntermissionCountdownLabel
        key="live-countdown-label"
        breakKind={breakKind}
        phase={phase}
        roundPreparing={roundPreparing}
        roundStartDelayed={roundStartDelayed}
        serverStatus={serverStatus}
        standaloneTrainingSession={standaloneTrainingSession}
      />,
    ],
    [
      breakKind,
      phase,
      roundPreparing,
      roundStartDelayed,
      serverStatus,
      standaloneTrainingSession,
    ]
  );
  const mobileRoundIntroActive = mobileRoundIntroStage !== "idle";
  useEffect(() => {
    if (isMobileLayout && phase === "playing") {
      void loadMobileResultsScreen();
    }
  }, [isMobileLayout, phase]);
  useEffect(() => {
    if (!isMobileLayout || (!isLoggedIn && !isDailyPlay)) return;
    const specialScreenExpected =
      isSpecial3WordsMode ||
      roundPreparing?.special?.type === DAILY_SPECIAL_MODE ||
      upcomingSpecial?.type === DAILY_SPECIAL_MODE;
    if (specialScreenExpected) {
      void loadMobileSpecial3Scene();
      return;
    }
    if (isUltraCompact && !standaloneTrainingSession) {
      void loadMobileUltraCompactScene();
      void loadMobileStandardScene();
      return;
    }
    void loadMobileStandardScene();
  }, [
    isDailyPlay,
    isLoggedIn,
    isMobileLayout,
    isSpecial3WordsMode,
    isUltraCompact,
    roundPreparing?.special?.type,
    standaloneTrainingSession,
    upcomingSpecial?.type,
  ]);
  useEffect(() => {
    if (!isMobileLayout && (isLoggedIn || isDailyPlay)) {
      void loadDesktopGameScene();
    }
  }, [isDailyPlay, isLoggedIn, isMobileLayout]);
  useEffect(() => {
    if (isAccountAuthenticated) {
      void loadLiveLobbyScreen();
    }
  }, [isAccountAuthenticated]);
  const roundPreparationPending =
    !standaloneTrainingSession && (!!roundPreparing || roundStartDelayed);
  const showRoundPreparationWaiting = shouldShowRoundPreparationOverlay({
    phase,
    preparationAnnounced: !!roundPreparing,
    startDelayed: roundStartDelayed,
    standaloneTraining: !!standaloneTrainingSession,
  });
  const preparingSpecial = roundPreparing?.special || upcomingSpecial || null;
  const roundPreparationTitle = preparingSpecial?.isSpecial
    ? `Préparation : ${getSpecialRoundDisplayLabel(preparingSpecial)}`
    : "Grille en préparation";
  const roundPreparationMessage =
    typeof roundPreparing?.message === "string" && roundPreparing.message.trim()
      ? roundPreparing.message.trim()
      : "La grille met un peu plus de temps à générer. La manche démarre dès qu'elle est prête.";
  const roundPreparationOverlay = (
    <RoundPreparationOverlay
      darkMode={darkMode}
      message={roundPreparationMessage}
      title={roundPreparationTitle}
      visible={showRoundPreparationWaiting}
    />
  );
  const mobileResultsPhaseFadeOverlay =
    isMobileLayout &&
    phase === "results" &&
    mobileResultsOutroFadeActive &&
    !roundPreparationPending ? (
      <div className="fixed inset-0 z-[121] pointer-events-none select-none">
        <div className="absolute inset-0 bg-black mobile-round-intro-fade-to-black" />
      </div>
    ) : null;
  const mobileRoundIntroOverlay = (
    <MobileRoundIntroOverlay
      darkMode={darkMode}
      goLabel={MOBILE_ROUND_INTRO_GO_LABEL}
      gridRef={gridRef}
      isMobileLayout={isMobileLayout}
      roundLabel={mobileRoundIntroRoundLabel}
      roundDescription={mobileRoundIntroRoundDescription}
      roundTypeLabel={mobileRoundIntroRoundTypeLabel}
      stage={mobileRoundIntroStage}
      titleFadeMs={MOBILE_ROUND_INTRO_TITLE_FADE_MS}
    />
  );

  const tournamentFinaleGateAt = (() => {
    const times = [];
    if (tournamentSummaryAt) times.push(tournamentSummaryAt);
    if (tournamentFinaleHoldUntil) times.push(tournamentFinaleHoldUntil);
    if (!times.length) return null;
    return Math.max(...times);
  })();
  const tournamentFinaleDismissKey = tournamentFinaleSummary
    ? String(
        tournamentFinaleSummary.tournamentId ||
          tournament?.id ||
          tournamentSummaryAt ||
          tournamentFinaleHoldUntil ||
          "current"
      )
    : "";

  const showTournamentFinale =
    phase === "results" &&
    breakKind === "tournament_end" &&
    (!tournamentFinaleGateAt || getNowServerMs() >= tournamentFinaleGateAt) &&
    dismissedTournamentFinaleKey !== tournamentFinaleDismissKey &&
    tournamentFinaleSummary &&
    Array.isArray(tournamentFinaleSummary.ranking) &&
    tournamentFinaleSummary.ranking.length > 0;
  const prevShowTournamentFinaleRef = useRef(showTournamentFinale);
  const trophyLeague =
    trophyStatus?.league || trophyStatus?.progress?.league || "Bronze";
  const trophyProgress = trophyStatus?.progress || {
    league: trophyLeague,
    currentFloor: 0,
    nextFloor: null,
    pct: 0,
  };
  const trophyPalette = getLeaguePalette(trophyLeague, darkMode);
  const trophyTotalValue = Number.isFinite(trophyStatus?.trophies)
    ? trophyStatus.trophies
    : null;
  const trophyDeltaValue = Number.isFinite(trophyStatus?.lastDelta)
    ? trophyStatus.lastDelta
    : Number.isFinite(trophyHistory?.[0]?.delta)
    ? trophyHistory[0].delta
    : 0;
  const trophyDeltaLabel =
    trophyDeltaValue > 0
      ? `+${trophyDeltaValue}`
      : `${trophyDeltaValue}`;
  const trophyProgressLabel =
    Number.isFinite(trophyTotalValue) && Number.isFinite(trophyProgress.nextFloor)
      ? `${formatNumber(trophyTotalValue)} / ${formatNumber(trophyProgress.nextFloor)}`
      : trophyTotalValue != null
      ? `${formatNumber(trophyTotalValue)}`
      : "\u2014";

  useEffect(() => {
    if (showTournamentFinale && !tournamentCelebrationPlayedRef.current) {
      playTournamentCelebrationSound();
      triggerConfettiBurst("tournament");
      tournamentCelebrationPlayedRef.current = true;
    }
    if (!showTournamentFinale) {
      tournamentCelebrationPlayedRef.current = false;
    }
  }, [showTournamentFinale]);

  useEffect(() => {
    if (showTournamentFinale && !prevShowTournamentFinaleRef.current && definitionModal.open) {
      closeDefinition();
    }
    prevShowTournamentFinaleRef.current = showTournamentFinale;
  }, [showTournamentFinale, definitionModal.open]);

  useEffect(() => {
    if (!showTournamentFinale) return;
    setFinalePage(0);
    if (finaleScrollRef.current) {
      finaleScrollRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [showTournamentFinale]);

  useEffect(() => {
    if (!showTournamentFinale) return;
    if (!trophyStatus) {
      void requestTrophyStatus();
    }
  }, [showTournamentFinale, trophyStatus]);

  useEffect(() => {
    if (!showTournamentFinale || isMobileLayout) return;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isKeyboardEditableTarget(e.target)) return;
      if (
        authModalMode ||
        definitionModal.open ||
        isChatRulesOpen ||
        isSettingsOpen ||
        roundPlayerModal.open ||
        userMenu.open
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (tournamentFinaleDismissKey) {
          setDismissedTournamentFinaleKey(tournamentFinaleDismissKey);
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        shiftFinalePage(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        shiftFinalePage(1);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        goToFinalePage(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        goToFinalePage(finalePagesCount - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    authModalMode,
    definitionModal.open,
    finalePage,
    finalePagesCount,
    goToFinalePage,
    isChatRulesOpen,
    isMobileLayout,
    isSettingsOpen,
    roundPlayerModal.open,
    shiftFinalePage,
    showTournamentFinale,
    tournamentFinaleDismissKey,
    userMenu.open,
  ]);

  const shouldShowChatInteractionOverlays =
    isChatRulesOpen ||
    userMenu.open ||
    desktopChatReactionPicker.open ||
    desktopChatReactionDetails.open ||
    reportDialog.open;
  const chatInteractionOverlaysView = shouldShowChatInteractionOverlays ? (
    <Suspense fallback={null}>
      <ChatInteractionOverlays
        appearance={{ darkMode }}
        rules={{
          open: isChatRulesOpen,
          confirmRef: chatRulesConfirmRef,
          onCancel: cancelChatRules,
          onConfirm: confirmChatRules,
          playCloseSound,
        }}
        userMenu={{
          state: userMenu,
          onBlock: blockInstallId,
          onClose: closeUserMenu,
          onOpenProfile: openPlayerProfile,
          onReport: openReportDialog,
        }}
        reactions={{
          details: desktopChatReactionDetails,
          emojis: CHAT_REACTION_EMOJIS,
          installId,
          picker: desktopChatReactionPicker,
          onClosePicker: closeDesktopChatReactionPicker,
          onKeepDetailsOpen: clearDesktopReactionDetailsCloseTimer,
          onScheduleDetailsClose: scheduleCloseDesktopChatReactionDetails,
          onSend: sendChatReaction,
        }}
        report={{
          state: reportDialog,
          onChange: setReportDialog,
          onClose: closeReportDialog,
          onSubmit: submitReport,
        }}
      />
    </Suspense>
  ) : null;
  const playerProfileModalView = (
    <PlayerProfileModalHost
      open={playerProfileModal.open}
      darkMode={darkMode}
      loading={playerProfileModal.loading}
      error={playerProfileModal.error}
      profile={playerProfileModal.profile}
      onClose={closePlayerProfileModal}
    />
  );

  const weeklyBoardsMeta = WEEKLY_BOARDS;
  const safeWeeklyIndex =
    weeklyActiveIndex >= 0 && weeklyActiveIndex < weeklyBoardsMeta.length ? weeklyActiveIndex : 0;
  const activeWeeklyBoard = weeklyBoardsMeta[safeWeeklyIndex] || weeklyBoardsMeta[0];
  const vocabBoardEntries = React.useMemo(() => {
    if (!Number.isFinite(vocabCount)) return [];
    return [
      {
        nick: selfNick || "Toi",
        vocabCount,
        achievedAt: Number.isFinite(vocabUpdatedAt) ? vocabUpdatedAt : null,
        playerKey: installId ? `install:${installId}` : null,
      },
    ];
  }, [vocabCount, selfNick, vocabUpdatedAt, installId]);
  const weeklyVocabBoardEntries = React.useMemo(() => {
    if (!Number.isFinite(vocabWeeklyCount) || vocabWeeklyCount <= 0) return [];
    return [
      {
        nick: selfNick || "Toi",
        weeklyVocabCount: vocabWeeklyCount,
        achievedAt: Number.isFinite(vocabWeeklyUpdatedAt) ? vocabWeeklyUpdatedAt : null,
        playerKey: installId ? `install:${installId}` : null,
      },
    ];
  }, [vocabWeeklyCount, selfNick, vocabWeeklyUpdatedAt, installId]);
  const weeklyBoardData = React.useMemo(() => {
    const data = { ...(weeklyStats?.boards || {}) };
    if (!Array.isArray(data.vocab) || data.vocab.length === 0) {
      data.vocab = vocabBoardEntries;
    }
    if (!Array.isArray(data.weeklyVocab) || data.weeklyVocab.length === 0) {
      data.weeklyVocab = weeklyVocabBoardEntries;
    }
    return data;
  }, [weeklyStats?.boards, vocabBoardEntries, weeklyVocabBoardEntries]);
  const weeklyVocabLookup = React.useMemo(() => {
    const lookup = new Map();
    const weeklyVocabEntries = Array.isArray(weeklyBoardData.vocab)
      ? weeklyBoardData.vocab
      : [];
    weeklyVocabEntries.forEach((entry) => {
      if (!entry) return;
      const count = Number(entry.vocabCount) || 0;
      if (entry.playerKey) {
        lookup.set(entry.playerKey, count);
      }
      if (entry.nick) {
        const nickKey = String(entry.nick).trim().toLowerCase();
        if (nickKey) lookup.set(nickKey, count);
      }
    });
    return lookup;
  }, [weeklyBoardData.vocab]);
  const weeklyLimit = weeklyStats?.topN || weeklyStats?.limits?.topN || 50;
  const weeklyBoardDisplayLimit = STATS_WEEKLY_DISPLAY_LIMIT;
  const seasonBoardDisplayLimit = Math.min(
    STATS_SEASON_TARGET_LIMIT,
    Math.max(STATS_WEEKLY_DISPLAY_LIMIT, weeklyLimit)
  );
  const finaleBaselineBoards = tournamentBaselineRef.current.weeklyStats?.boards || {};
  const finaleBaselineRankMaps = {};
  const finaleBaselineValueMaps = {};
  FINALE_WEEKLY_BOARDS.forEach((boardMeta) => {
    const entries = dedupeWeeklyEntries(
      boardMeta.key,
      finaleBaselineBoards[boardMeta.key],
      weeklyLimit
    );
    const rankMap = new Map();
    const valueMap = new Map();
    entries.forEach((entry, idx) => {
      const entryKey = getWeeklyEntryKey(entry);
      if (!entryKey) return;
      rankMap.set(entryKey, idx + 1);
      const value = getWeeklyMetricValue(boardMeta.key, entry);
      if (Number.isFinite(value)) valueMap.set(entryKey, value);
    });
    finaleBaselineRankMaps[boardMeta.key] = rankMap;
    finaleBaselineValueMaps[boardMeta.key] = valueMap;
  });
  const seasonVocabEntries = dedupeWeeklyEntries(
    "vocab",
    weeklyBoardData.vocab,
    seasonBoardDisplayLimit
  );
  const weeklyEntriesByBoard = React.useMemo(() => {
    const out = {};
    weeklyBoardsMeta.forEach((board) => {
      out[board.key] = dedupeWeeklyEntries(
        board.key,
        weeklyBoardData[board.key],
        weeklyBoardDisplayLimit
      );
    });
    return out;
  }, [weeklyBoardsMeta, weeklyBoardData, weeklyBoardDisplayLimit]);
  const weeklyWeekNumber = weeklyStats?.weekStartTs
    ? getISOWeekNumber(new Date(weeklyStats.weekStartTs))
    : getISOWeekNumber(new Date());
  const weeklyVocabSelfRank = getSelfWeeklyVocabRankFromStats(weeklyStats);
  const weeklyVocabSelfCount = Number.isFinite(vocabWeeklyCount)
    ? Math.max(0, vocabWeeklyCount)
    : null;
  const homeSurfaceUsesFixedFantasyTheme =
    !isLoggedIn && appView !== "daily_play" && appView !== "daily_results";
  const menuDarkMode = homeSurfaceUsesFixedFantasyTheme ? true : darkMode;
  const weeklyOverlayHeight = mobileLayoutSizing.viewportHeight || 0;
  const weeklyOverlayStyle =
    weeklyOverlayHeight > 0
      ? {
          height: `${Math.round(weeklyOverlayHeight)}px`,
          maxHeight: `${Math.round(weeklyOverlayHeight)}px`,
          minHeight: `${Math.round(weeklyOverlayHeight)}px`,
          boxSizing: "border-box",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }
      : {
          height: "100dvh",
          maxHeight: "100dvh",
          minHeight: "100dvh",
          boxSizing: "border-box",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        };
  const weeklyStatsPage =
    appView === "stats" ? (
      <Suspense fallback={null}>
        <WeeklyStatsScreen
          runtime={{
      activeWeeklyBoard,
      closeWeeklyStatsOverlay,
      darkMode,
      getImageUrl,
      getSeasonPages,
      getUserIdFromPlayerProfileTarget,
      goToSeasonPage,
      goToWeeklyBoard,
      handleStatsTouchEnd,
      handleStatsTouchMove,
      handleStatsTouchStart,
      installId,
      isCrownedEntry,
      menuDarkMode,
      openDefinition,
      openPlayerProfile,
      playCloseSound,
      renderCrownIcon,
      renderVocabPanel,
      safeWeeklyIndex,
      seasonActiveIndex,
      seasonSwipeBlockRef,
      seasonSwipeTrack,
      seasonVocabEntries,
      selfNick,
      setStatsTab,
      shiftSeasonPage,
      shiftWeeklyBoard,
      shouldIgnoreSwipeClick,
      statsTab,
      weeklyBoardsMeta,
      weeklyEntriesByBoard,
      weeklyStatsError,
      weeklyStatsLoading,
      weeklySwipeBlockRef,
      weeklySwipeTrack,
      weeklyVocabLookup,
      weeklyVocabSelfCount,
      weeklyVocabSelfRank,
      weeklyWeekNumber,
          }}
        />
      </Suspense>
    ) : null;

  const playersOverlay = isPlayersOverlayOpen ? (
    <Suspense fallback={null}>
      <PlayersOverlay
        appearance={{ darkMode }}
        directory={{
          hideBots: isLoggedIn && appView === "live" && phase === "lobby",
          lobbyPlayersList,
          lobbyPlayersLoading,
          mode: playersOverlayMode,
          open: isPlayersOverlayOpen,
          playersAlphaList,
          snapshot: playersOverlaySnapshot,
        }}
        round={{
          breakKind,
          defaultDuration: DEFAULT_DURATION,
          isLoggedIn,
          lobbyRoomStatus,
          phase,
          roomMeta: ROOM_OPTIONS[currentRoomId || roomId] || {},
          serverRoundDurationMs,
        }}
        tournament={{
          defaultTotalRounds: TOURNAMENT_TOTAL_ROUNDS,
          lobby: tournamentLobby,
          state: tournament,
        }}
        actions={{
          canOpenProfile: canOpenPlayerProfile,
          onClose: closePlayersOverlay,
          onOpenProfile: openPlayerProfile,
          playCloseSound,
        }}
        renderers={{
          gobbleAwards: renderGobbleWordAwardsInline,
          humanDot: renderHumanDot,
          nickClassName: getLiveNickClassName,
        }}
      />
    </Suspense>
  ) : null;

  const trainingConfirmModal = trainingConfirm ? (
    <Suspense fallback={null}>
      <TrainingConfirmDialog
        darkMode={darkMode}
        onCancel={() => setTrainingConfirm(null)}
        onConfirm={confirmTrainingRound}
        selection={trainingConfirm}
      />
    </Suspense>
  ) : null;

  const definitionOverlaysView =
    definitionModal.open || wordInfoModal.open ? (
      <Suspense fallback={null}>
        <DefinitionOverlays
          runtime={{
        closeDefinition,
        closeWordInfoModal,
        darkMode,
        definitionModal,
        GUIDED_RESULTS_STEPS,
        guidedResultsStep,
        handleDefinitionVaultAction,
        homeSurfaceUsesFixedFantasyTheme,
        isAccountAuthenticated,
        isWordInVault,
        menuDarkMode,
        openDefinition,
        playCloseSound,
        wordInfoModal,
        wordVaultActionPending,
          }}
        />
      </Suspense>
    ) : null;

  const roundPlayerModalView = (
    <RoundPlayerDetailsModalHost
      open={roundPlayerModal.open}
      darkMode={darkMode}
      modal={roundPlayerModal}
      finalRanking={finalRanking}
      canOpenRoundPlayerDetails={canOpenRoundPlayerDetails}
      canOpenPlayerProfile={stableCanOpenPlayerProfile}
      gobbleBadgeUrl={getImageUrl(IMAGE_KEYS.gobbleBadge)}
      isSpeedRound={specialRound?.type === "speed"}
      allowScoreGobble={
        specialRound?.type !== MASSIVE_BOGGLE_TYPE &&
        specialRound?.type !== DAILY_SPECIAL_MODE
      }
      isSpecial3Round={specialRound?.type === DAILY_SPECIAL_MODE}
      renderSpecial3PreviewTiles={renderSpecial3PreviewTiles}
      showWordScores={specialRound?.type !== "speed" && specialRound?.type !== DAILY_SPECIAL_MODE}
      sortWordsByLengthAlpha={specialRound?.type === MASSIVE_BOGGLE_TYPE}
      onNavigate={navigateRoundPlayerModal}
      onSwipeSound={playSwipeSound}
      onClose={() => closeRoundPlayerModal({ withSound: true })}
      onOpenPlayerProfile={stableOpenPlayerProfile}
      onOpenDefinition={(word) => {
        if (!word) return;
        openDefinition(word, { fromWordInfo: true });
      }}
    />
  );

  const recordModalView = recordModal.open ? (
    <Suspense fallback={null}>
      <RecordModal
        darkMode={darkMode}
        onClose={closeRecordModal}
        playCloseSound={playCloseSound}
        recordModal={recordModal}
      />
    </Suspense>
  ) : null;
  const vocabOverlayView = (
    <Suspense fallback={null}>
      <VocabProgressOverlay
        ref={vocabOverlayControllerRef}
        darkMode={darkMode}
        fallbackLevel={vocabLevel}
        getImageUrl={getImageUrl}
        isMobileLayout={isMobileLayout}
        onVisibilityChange={handleVocabOverlayVisibilityChange}
        playCloseSound={playCloseSound}
        playVocabOverlayClingSound={playVocabOverlayClingSound}
        playVocabOverlayTickSound={playVocabOverlayTickSound}
        playVocabOverlayZeroSound={playVocabOverlayZeroSound}
        request={vocabOverlayRequest}
        triggerConfettiBurst={triggerConfettiBurst}
      />
    </Suspense>
  );
  const {
    special3DesktopStep2TutorialOverlay,
    special3InGameTutorialCard,
    special3MobileStep1Ghost,
    special3MobileStep2TutorialOverlay,
    specialTutorialOverlay,
    tutorialOverlay,
  } = useTutorialPresentation({
    completeTutorial,
    darkMode,
    isMobileLayout,
    isSpecial3TutorialInteractiveActive,
    isSpecialTutorialOpen,
    isTutorialOpen,
    markSpecialTutorialSeen,
    mobileSpecial3Step1GhostStyle,
    mobileSpecial3Step2OverlayStyle,
    renderSpecial3BonusChipButton,
    setIsSpecialTutorialOpen,
    setSpecialTutorialPlan,
    setSpecialTutorialStepIndex,
    SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK,
    specialTutorialPlan,
    specialTutorialStepIndex,
  });

  const authDialogView = (
    <AuthDialogHost
      mode={authModalMode}
      darkMode={darkMode}
      form={authForm}
      error={authError}
      info={authInfo}
      loading={authSubmitting}
      mustResetPassword={!!authState.user?.mustResetPassword}
      onClose={closeAuthDialog}
      onSubmit={submitAuthDialog}
      onFieldChange={(field, value) =>
        setAuthForm((prev) => ({
          ...prev,
          [field]: field === "username" ? normalizeAuthUsernameInput(value) : value,
        }))
      }
      onModeChange={(mode) => openAuthDialog(mode)}
    />
  );
  const ambientOn = !isAmbientMuted;
  const allSoundOn =
    ambientOn &&
    soundValidationEnabled &&
    soundTileStepEnabled &&
    soundTimerEnabled &&
    soundGobbleEnabled &&
    soundInvalidErrorEnabled;
  const enabledSoundCount = [
    ambientOn,
    soundValidationEnabled,
    soundTileStepEnabled,
    soundTimerEnabled,
    soundGobbleEnabled,
    soundInvalidErrorEnabled,
  ].filter(Boolean).length;
  const allVisualOn =
    visualGobbleEnabled &&
    visualPraiseEnabled &&
    visualScoreFlightsEnabled &&
    visualInvalidWordsEnabled &&
    visualScreenShakeEnabled &&
    visualConfettiEnabled &&
    visualGoldNickFxEnabled;
  const enabledVisualCount = [
    visualGobbleEnabled,
    visualPraiseEnabled,
    visualScoreFlightsEnabled,
    visualInvalidWordsEnabled,
    visualScreenShakeEnabled,
    visualConfettiEnabled,
    visualGoldNickFxEnabled,
  ].filter(Boolean).length;
  const vibrationOn = isVibrationEnabled && canVibrate;
  const setAllSoundEnabled = React.useCallback((enabled) => {
    const next = !!enabled;
    setIsAmbientMuted(!next);
    setSoundValidationEnabled(next);
    setSoundTileStepEnabled(next);
    setSoundTimerEnabled(next);
    setSoundGobbleEnabled(next);
    setSoundInvalidErrorEnabled(next);
  }, []);
  const setAllVisualEnabled = React.useCallback((enabled) => {
    const next = !!enabled;
    setVisualGobbleEnabled(next);
    setVisualPraiseEnabled(next);
    setVisualScoreFlightsEnabled(next);
    setVisualInvalidWordsEnabled(next);
    setVisualScreenShakeEnabled(next);
    setVisualConfettiEnabled(next);
    setVisualGoldNickFxEnabled(next);
  }, []);
  const toggleSoundQuick = React.useCallback(
    (event) => {
      requestAudioUnlock(event);
      setAllSoundEnabled(!allSoundOn);
    },
    [allSoundOn, setAllSoundEnabled]
  );
  const tileLetterColorSelected =
    LETTER_COLOR_MAP[tileLetterColorPreset] || LETTER_COLOR_MAP[DEFAULT_THEME_PRESET.letterColor];
  const gobblarsBadgeUrl = getImageUrl(IMAGE_KEYS.gobblarsBadge) || "/Gobblars.png";
  const themeDraftSafe = React.useMemo(() => normalizeThemePreset(themeDraft), [themeDraft]);
  const themePreviewBackgroundStyle = React.useMemo(() => {
    const bgMeta = BACKGROUND_MAP[themeDraftSafe.background] || {};
    const style = bgMeta.style || {};
    if (bgMeta.native) {
      return {
        backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
        backgroundImage: "none",
      };
    }
    return {
      backgroundColor: style.color || "#dbeafe",
      backgroundImage: style.image || "none",
      backgroundSize: style.size || "auto",
      backgroundRepeat: style.repeat || "repeat",
      backgroundPosition: style.position || "center",
    };
  }, [darkMode, themeDraftSafe.background]);
  const themePreviewTileColor =
    TILE_COLOR_MAP[themeDraftSafe.tileColor] || TILE_COLOR_MAP[DEFAULT_THEME_PRESET.tileColor];
  const themePreviewMaterialClass = getTileMaterialClass(themeDraftSafe.material);
  const themePreviewCells = React.useMemo(
    () => [
      { letter: "G", bonus: "M2" },
      { letter: "O", bonus: null },
      { letter: "B", bonus: "L2" },
      { letter: "B", bonus: null },
      { letter: "L", bonus: "L3" },
      { letter: "E", bonus: "M3" },
      { letter: "A", bonus: null },
      { letter: "R", bonus: "L2" },
      { letter: "T", bonus: null },
      { letter: "H", bonus: "M2" },
      { letter: "E", bonus: null },
      { letter: "M", bonus: "L3" },
      { letter: "E", bonus: "L2" },
      { letter: "X", bonus: null },
      { letter: "Y", bonus: null },
      { letter: "Z", bonus: "M3" },
    ],
    []
  );
  const themePreviewGridRef = useRef(null);
  const themePreviewTileRefs = useRef([]);
  const themePreviewEmptySet = React.useMemo(() => new Set(), []);
  const themePreviewNoop = React.useCallback(() => {}, []);
  const themePreviewMobileGapPx = "clamp(6px, 2.4vw, 14px)";
  const themePreviewMobileGridSide = React.useMemo(() => {
    const viewportWidth =
      mobileLayoutSizing.viewportWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 360);
    return Math.round(Math.max(180, Math.min(viewportWidth - 96, 320)));
  }, [mobileLayoutSizing.viewportWidth]);
  const themePreviewMobileTileFontPx = React.useMemo(
    () =>
      Math.max(
        18,
        Math.min(32, Math.round((themePreviewMobileGridSide / 4) * 0.35))
      ),
    [themePreviewMobileGridSide]
  );
  const themePreviewUseFill = themeDraftSafe.specialIndicator === "fill";
  const themePreviewUseRing = themeDraftSafe.specialIndicator === "ring";
  const themePreviewUseBadge = themeDraftSafe.specialIndicator === "badge";
  const themePreviewIsSquare = themeDraftSafe.material === "square";
  const themePreviewGap = themePreviewIsSquare
    ? "0px"
    : isMobileLayout
    ? "4px"
    : `${tileGapPx}px`;
  const themePreviewPadding = themePreviewIsSquare ? "0px" : isMobileLayout ? "8px" : "16px";
  const themeControlButtons = React.useMemo(
    () => [
      { id: "darkMode", kind: "toggle", title: "Mode clair/sombre" },
      { id: "tileColor", kind: "picker", title: "Couleur de tuile" },
      { id: "font", kind: "picker", title: "Police" },
      { id: "letterScale", kind: "picker", title: "Taille des lettres" },
      { id: "letterColor", kind: "picker", title: "Couleur des lettres" },
      { id: "background", kind: "picker", title: "Fond / papier peint" },
      { id: "material", kind: "picker", title: "Formes" },
      { id: "specialIndicator", kind: "picker", title: "Indicateur spécial" },
      { id: "tilePoints", kind: "toggle", title: "Score sur tuile" },
    ],
    []
  );
  const isThemeCategoryLockable = React.useCallback(
    (category) => THEME_LOCKABLE_CATEGORIES.includes(String(category || "")),
    []
  );
  const isThemeOptionUnlocked = React.useCallback(
    (category, optionId, unlocksOverride = null) => {
      const safeUnlocks = unlocksOverride && typeof unlocksOverride === "object"
        ? unlocksOverride
        : themeUnlocks;
      return isThemeOptionUnlockedFromMap(safeUnlocks, category, optionId);
    },
    [themeUnlocks]
  );
  const computeThemeApplyMeta = React.useCallback(
    (mode, category = "", draftOverride = null) => {
      const safeMode = mode === "single" ? "single" : "full";
      const safeCategory = String(category || "").trim();
      const draftTheme = normalizeThemePreset(draftOverride || themeDraftSafe);
      const categoriesToApply =
        safeMode === "single"
          ? [safeCategory].filter((key) => THEME_PRESET_CATEGORIES.includes(key))
          : THEME_PRESET_CATEGORIES.slice();
      const changedCategories = categoriesToApply.filter(
        (key) =>
          getThemeCategoryValue(themeAppliedSafe, key) !==
          getThemeCategoryValue(draftTheme, key)
      );
      const requiredUnlocks = changedCategories
        .map((key) => {
          if (!isThemeCategoryLockable(key)) return "";
          const optionId = getThemeCategoryValue(draftTheme, key);
          const defaultId = getThemeCategoryValue(DEFAULT_THEME_PRESET, key);
          if (optionId === defaultId) return "";
          if (isThemeOptionUnlocked(key, optionId, themeUnlocks)) return "";
          return getThemeUnlockItemKey(key, optionId);
        })
        .filter(Boolean);
      const parsedUnlockCost = Number(themeUnlockCost);
      const unlockUnitCost = Math.max(
        0,
        Number.isFinite(parsedUnlockCost) ? parsedUnlockCost : THEME_UNLOCK_COST_DEFAULT
      );
      const totalCost = requiredUnlocks.length * unlockUnitCost;
      const canAfford = gobblarsBalance >= totalCost;
      return {
        mode: safeMode,
        category: safeCategory,
        categoriesToApply,
        changedCategories,
        requiredUnlocks,
        draftTheme,
        unlockUnitCost,
        totalCost,
        canAfford,
      };
    },
    [
      gobblarsBalance,
      isThemeCategoryLockable,
      isThemeOptionUnlocked,
      themeAppliedSafe,
      themeDraftSafe,
      themeUnlocks,
      themeUnlockCost,
    ]
  );
  const themeSingleApplyMeta = React.useMemo(
    () => computeThemeApplyMeta("single", themeLastChangedCategory),
    [computeThemeApplyMeta, themeLastChangedCategory]
  );
  const themeFullApplyMeta = React.useMemo(
    () => computeThemeApplyMeta("full"),
    [computeThemeApplyMeta]
  );
  const applyThemeDraftCategory = React.useCallback(
    (category, value) => {
      const key = String(category || "").trim();
      if (!THEME_PRESET_CATEGORIES.includes(key)) return;
      const nextDraft = normalizeThemePreset({
        ...themeDraftSafe,
        [key]:
          key === "darkMode"
            ? !!value
            : key === "letterScale"
            ? normalizeTileLetterScale(value, themeDraftSafe.letterScale)
            : value,
      });
      setThemeLastChangedCategory(key);
      setThemeDraft(nextDraft);
      applyThemeVisualState(nextDraft);
    },
    [applyThemeVisualState, themeDraftSafe]
  );
  const buildThemeDraftWithOption = React.useCallback(
    (category, optionId) =>
      normalizeThemePreset({
        ...themeDraftSafe,
        [String(category || "").trim()]: optionId,
      }),
    [themeDraftSafe]
  );
  const closeThemeMenu = React.useCallback(() => {
    setIsThemeMenuOpen(false);
    setThemePickerCategory("");
    setThemePurchaseConfirm(null);
    setThemeDraft(themeAppliedSafe);
    applyThemeVisualState(themeAppliedSafe);
  }, [applyThemeVisualState, themeAppliedSafe]);
  const fetchThemeProfile = React.useCallback(
    async ({ silent = false, announceGain = false, force = false, retryAuth = true } = {}) => {
      if (!installId) return null;
      const fetchState = themeProfileFetchStateRef.current;
      const now = Date.now();
      if (fetchState.inFlight) return null;
      if (!force && silent && now - (Number(fetchState.lastAt) || 0) < 3000) {
        return null;
      }
      fetchState.inFlight = true;
      fetchState.lastAt = now;
      if (!silent) setThemeLoading(true);
      try {
        for (let attempt = 0; attempt < (retryAuth ? 2 : 1); attempt += 1) {
          const query = new URLSearchParams();
          query.set("installId", installId);
          if (attempt > 0) {
            query.set("r", String(Date.now()));
          }
          const res = await fetch(`/api/theme/profile?${query.toString()}`, {
            cache: "no-store",
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const parsed = await readJsonResponseLoose(res);
          const payload = parsed?.data;
          if (res.ok && payload?.ok) {
            const nextUnlocks = normalizeThemeUnlocks(
              payload.themeUnlocks || {},
              payload.themeApplied || {}
            );
            const nextThemeFromServer = coerceThemeToLegacyNativeDefault(
              payload.themeApplied || {},
              nextUnlocks
            );
            const nextTheme = normalizeThemePreset({
              ...nextThemeFromServer,
              // La preference localement appliquee (clair/sombre) reste prioritaire.
              darkMode: !!darkMode,
              // Champ local (non persisté serveur pour l'instant): on preserve.
              gridSurface: themeAppliedSafe.gridSurface,
            });
            const nextBalance = Math.max(0, Number(payload.balance) || 0);
            const prevBalance = Number(gobblarsKnownBalanceRef.current);
            if (
              announceGain &&
              Number.isFinite(prevBalance) &&
              nextBalance > prevBalance
            ) {
              const gain = nextBalance - prevBalance;
              showToastRef.current?.(`+${gain} Gobblars`, 2600, {
                iconSrc: gobblarsBadgeUrl,
                iconAlt: "Gobblars",
              });
            }
            gobblarsKnownBalanceRef.current = nextBalance;
            setGobblarsBalance(nextBalance);
            const parsedUnlockCost = Number(payload.unlockCost);
            setThemeUnlockCost(
              Math.max(
                0,
                Number.isFinite(parsedUnlockCost) ? parsedUnlockCost : THEME_UNLOCK_COST_DEFAULT
              )
            );
            setThemeUnlocks(nextUnlocks);
            if (isThemeMenuOpen) {
              setThemeApplied(nextTheme);
            } else {
              applyThemePresetToLocalState(nextTheme, { syncDraft: true });
            }
            setAccountNotice((prev) =>
              prev === ACCOUNT_SESSION_UNAVAILABLE_MESSAGE ? "" : prev
            );
            return payload;
          }
          const errorCode = String(
            payload?.error || (parsed?.isLikelyHtml ? "bad_payload_html" : `http_${res.status || "error"}`)
          );
          if (errorCode === "auth_required" && retryAuth && attempt === 0) {
            const refreshed = await refreshAuthStatus({ silent: true });
            if (refreshed?.status === "authenticated" && refreshed?.user) {
              continue;
            }
          }
          if (errorCode === "auth_required") {
            setAccountNotice(ACCOUNT_SESSION_UNAVAILABLE_MESSAGE);
          }
          return null;
        }
        return null;
      } catch (_) {
        return null;
      } finally {
        fetchState.inFlight = false;
        if (!silent) setThemeLoading(false);
      }
    },
    [
      applyThemePresetToLocalState,
      darkMode,
      gobblarsBadgeUrl,
      installId,
      isThemeMenuOpen,
      refreshAuthStatus,
      themeAppliedSafe.gridSurface,
    ]
  );
  const openThemeMenu = React.useCallback(() => {
    setIsSoundMenuOpen(false);
    setIsVisualMenuOpen(false);
    setIsKeyboardMenuOpen(false);
    setIsDevMenuOpen(false);
    setIsModerationMenuOpen(false);
    setThemeDraft(themeAppliedSafe);
    applyThemeVisualState(themeAppliedSafe);
    setThemePickerCategory("");
    setThemePurchaseConfirm(null);
    setIsThemeMenuOpen(true);
    void fetchThemeProfile({ silent: true, force: true });
  }, [applyThemeVisualState, fetchThemeProfile, themeAppliedSafe]);
  const openSoundMenu = React.useCallback(() => {
    setIsThemeMenuOpen(false);
    setIsVisualMenuOpen(false);
    setIsKeyboardMenuOpen(false);
    setIsDevMenuOpen(false);
    setIsModerationMenuOpen(false);
    setIsSoundMenuOpen(true);
  }, []);
  const closeSoundMenu = React.useCallback(() => {
    setIsSoundMenuOpen(false);
  }, []);
  const openVisualMenu = React.useCallback(() => {
    setIsThemeMenuOpen(false);
    setIsSoundMenuOpen(false);
    setIsKeyboardMenuOpen(false);
    setIsDevMenuOpen(false);
    setIsModerationMenuOpen(false);
    setIsVisualMenuOpen(true);
  }, []);
  const closeVisualMenu = React.useCallback(() => {
    setIsVisualMenuOpen(false);
  }, []);
  const openKeyboardMenu = React.useCallback(() => {
    setIsThemeMenuOpen(false);
    setIsSoundMenuOpen(false);
    setIsVisualMenuOpen(false);
    setIsDevMenuOpen(false);
    setIsModerationMenuOpen(false);
    setIsKeyboardMenuOpen(true);
  }, []);
  const closeKeyboardMenu = React.useCallback(() => {
    setIsKeyboardMenuOpen(false);
  }, []);
  const applyDevControlsResponse = React.useCallback((res) => {
    if (!res || typeof res !== "object") return;
    setDevControlsAvailable(!!res.available);
    setDevControlsLocked(!!res.locked);
    setDevAccountAllowed(!!res.accountAllowed);
    setDevAccountLabel(typeof res.accountLabel === "string" ? res.accountLabel : "");
    if (res.available && res.locked === false) {
      setDevMenuUnlocked(true);
    } else if (res.locked) {
      setDevMenuUnlocked(false);
    }
    setDevPasswordRequired(!!res.passwordRequired);
    setDevPasswordConfigured(!!res.passwordConfigured);
    if (res.controls && typeof res.controls === "object") {
      setDevControls((prev) => ({ ...prev, ...res.controls }));
    }
    if (Array.isArray(res.roundTypes)) {
      setDevRoundTypes(res.roundTypes);
    }
  }, []);
  const fetchDevBots = React.useCallback(() => {
    if (!socket?.connected) return;
    socket.emit(
      "dev:bots:list",
      { roomId: currentRoomIdRef.current || roomIdRef.current },
      (res) => {
        if (Array.isArray(res?.bots)) setDevBots(res.bots);
        if (!res?.ok && res?.error === "dev_tools_locked") {
          applyDevControlsResponse(res);
        }
      }
    );
  }, [applyDevControlsResponse]);
  const fetchDevControls = React.useCallback(() => {
    if (!socket?.connected) return;
    socket.emit("dev:controls:get", null, (res) => {
      applyDevControlsResponse(res);
      if (res?.ok && !res?.locked) fetchDevBots();
    });
  }, [applyDevControlsResponse, fetchDevBots]);
  const unlockDevControls = React.useCallback(() => {
    if (!socket?.connected) return;
    setDevControlsBusy(true);
    setDevError("");
    socket.emit("dev:unlock", { password: devPassword }, (res) => {
      setDevControlsBusy(false);
      applyDevControlsResponse(res);
      if (res?.ok) {
        setDevMenuUnlocked(true);
        setDevPassword("");
        fetchDevBots();
        return;
      }
      setDevError(
        res?.error === "bad_password"
          ? "Mot de passe incorrect."
          : res?.error === "password_not_configured"
          ? "Mot de passe serveur manquant."
          : "Acces dev refuse."
      );
    });
  }, [applyDevControlsResponse, devPassword, fetchDevBots]);
  const lockDevControls = React.useCallback(() => {
    if (!socket?.connected) return;
    socket.emit("dev:lock", null, (res) => {
      applyDevControlsResponse(res);
      setDevMenuUnlocked(false);
      setDevBots([]);
    });
  }, [applyDevControlsResponse]);
  const patchDevControls = React.useCallback(
    (patch) => {
      if (!socket?.connected || !patch || typeof patch !== "object") return;
      setDevControlsBusy(true);
      setDevError("");
      socket.emit("dev:controls:set", patch, (res) => {
        setDevControlsBusy(false);
        applyDevControlsResponse(res);
        if (res?.ok) fetchDevBots();
        if (!res?.ok) showToast("Options dev indisponibles sur ce serveur.");
      });
    },
    [applyDevControlsResponse, fetchDevBots, showToast]
  );
  const returnToLiveLobbyDev = React.useCallback(() => {
    if (!socket?.connected) return;
    setDevControlsBusy(true);
    setDevError("");
    socket.emit(
      "dev:returnToLiveLobby",
      { roomId: currentRoomIdRef.current || roomIdRef.current },
      (res) => {
        setDevControlsBusy(false);
        applyDevControlsResponse(res);
        if (res?.ok) {
          showToast("Retour au lobby live.");
          return;
        }
        showToast("Retour au lobby impossible.");
      }
    );
  }, [applyDevControlsResponse, showToast]);
  const openDevMenu = React.useCallback(() => {
    setIsThemeMenuOpen(false);
    setIsSoundMenuOpen(false);
    setIsVisualMenuOpen(false);
    setIsKeyboardMenuOpen(false);
    setIsModerationMenuOpen(false);
    setIsDevMenuOpen(true);
    fetchDevControls();
  }, [fetchDevControls]);
  const closeDevMenu = React.useCallback(() => {
    setIsDevMenuOpen(false);
  }, []);
  const openTargetWaitDevPlayground = React.useCallback(() => {
    setIsDevMenuOpen(false);
    setIsSettingsOpen(false);
    if (targetWaitDevArmed) {
      targetWaitDevArmedRoundIdRef.current = null;
      setTargetWaitDevArmed(false);
      showToast("Simulation du mini-jeu annulée.", 2200);
      return;
    }
    targetWaitDevArmedRoundIdRef.current = roundIdRef.current;
    setTargetWaitDevArmed(true);
    showToast("Mini-jeu armé : démarrage à la prochaine manche.", 3000);
  }, [targetWaitDevArmed]);
  React.useEffect(() => {
    if (!targetWaitDevArmed || phase !== "playing" || roundId == null) return;
    const currentRoundKey = String(roundId);
    const armedRoundKey =
      targetWaitDevArmedRoundIdRef.current == null
        ? ""
        : String(targetWaitDevArmedRoundIdRef.current);
    if (armedRoundKey && armedRoundKey === currentRoundKey) return;
    setTargetWaitDevActiveRoundId(currentRoundKey);
    setTargetWaitDevArmed(false);
    targetWaitDevArmedRoundIdRef.current = null;
    showToast("Simulation cible active : la cible est considérée comme trouvée.", 3200);
  }, [phase, roundId, targetWaitDevArmed]);
  React.useEffect(() => {
    if (targetWaitDevActiveRoundId == null) return;
    if (phase === "playing" && String(roundId ?? "") === targetWaitDevActiveRoundId) return;
    setTargetWaitDevActiveRoundId(null);
    setTargetWaitDevGridHost(null);
    setTargetWaitDevSideHost(null);
    setTargetWaitDevSessionState((previous) => ({
      ...previous,
      phase: "idle",
      remainingSeconds: 90,
      wordLength: 0,
    }));
  }, [phase, roundId, targetWaitDevActiveRoundId]);
  const targetWaitDevActive =
    targetWaitDevActiveRoundId != null &&
    phase === "playing" &&
    String(roundId ?? "") === targetWaitDevActiveRoundId;
  const applyModerationResponse = React.useCallback((res) => {
    if (!res || typeof res !== "object") return;
    setModerationAvailable(!!res.available);
    setModerationAccountLabel(typeof res.accountLabel === "string" ? res.accountLabel : "");
    if (Array.isArray(res.players)) setModerationPlayers(res.players);
  }, []);
  const fetchModerationState = React.useCallback(() => {
    if (!socket?.connected) return;
    socket.emit(
      "moderation:state",
      { roomId: currentRoomIdRef.current || roomIdRef.current },
      (res) => {
        applyModerationResponse(res);
        if (!res?.ok && res?.error !== "account_not_allowed" && res?.error !== "auth_required") {
          setModerationError("Moderation indisponible.");
        } else {
          setModerationError("");
        }
      }
    );
  }, [applyModerationResponse]);
  const openModerationMenu = React.useCallback(() => {
    setIsThemeMenuOpen(false);
    setIsSoundMenuOpen(false);
    setIsVisualMenuOpen(false);
    setIsKeyboardMenuOpen(false);
    setIsDevMenuOpen(false);
    setIsModerationMenuOpen(true);
    fetchModerationState();
  }, [fetchModerationState]);
  const closeModerationMenu = React.useCallback(() => {
    setIsModerationMenuOpen(false);
  }, []);
  const handleSettingsTitleDevTap = React.useCallback(() => {
    if (devMenuUnlocked) return;
    setDevMenuTapCount((prev) => {
      const next = prev + 1;
      if (next >= 7) {
        setIsDevMenuOpen(true);
        setDevError("");
        showToast("Mot de passe dev requis.");
        fetchDevControls();
        return 0;
      }
      return next;
    });
  }, [devMenuUnlocked, fetchDevControls, showToast]);
  const fillDevChat = React.useCallback(() => {
    if (!socket?.connected) return;
    setDevControlsBusy(true);
    socket.emit("dev:chat:fill", { roomId: currentRoomIdRef.current || roomIdRef.current, count: 90 }, (res) => {
      setDevControlsBusy(false);
      if (!res?.ok) showToast("Remplissage chat indisponible.");
    });
  }, [showToast]);
  const setDevBotActive = React.useCallback(
    (nick, active) => {
      if (!socket?.connected || !nick) return;
      setDevControlsBusy(true);
      socket.emit(
        "dev:bots:set",
        {
          roomId: currentRoomIdRef.current || roomIdRef.current,
          nick,
          active,
          duration: "manual",
        },
        (res) => {
          setDevControlsBusy(false);
          if (Array.isArray(res?.bots)) setDevBots(res.bots);
          if (!res?.ok) showToast("Impossible de modifier ce bot.");
        }
      );
    },
    [showToast]
  );
  const setAllDevBotsActive = React.useCallback(
    (active) => {
      if (!socket?.connected) return;
      setDevControlsBusy(true);
      socket.emit(
        "dev:bots:setAll",
        {
          roomId: currentRoomIdRef.current || roomIdRef.current,
          active: !!active,
        },
        (res) => {
          setDevControlsBusy(false);
          if (Array.isArray(res?.bots)) setDevBots(res.bots);
          if (!res?.ok) {
            showToast(active ? "Impossible d'activer tous les bots." : "Impossible de couper tous les bots.");
          }
        }
      );
    },
    [showToast]
  );
  const clearDevChat = React.useCallback(() => {
    if (!socket?.connected) return;
    setDevControlsBusy(true);
    socket.emit("dev:chat:clear", { roomId: currentRoomIdRef.current || roomIdRef.current }, (res) => {
      setDevControlsBusy(false);
      if (!res?.ok) showToast("Nettoyage chat indisponible.");
    });
  }, [showToast]);
  const requestDuelWeekRecap = React.useCallback((previewMode = false) => {
    if (!isAccountAuthenticated || !installId) {
      showToast("Connecte-toi avec un compte pour charger le recap hebdo.", 2400);
      return;
    }
    setDuelWeekRecapPreviewMode(!!previewMode);
    setDuelWeekRecapPage(0);
    if (
      duelStatus?.lastWeekSummary &&
      isWeeklyRecapPodiumReady(duelStatus.lastWeekSummary, weeklyStats)
    ) {
      setDuelWeekRecapOpen(true);
      return;
    }
    duelWeekRecapOpenAfterRefreshRef.current = previewMode ? "dev" : "public";
    showToast("Chargement du recap hebdo...", 1600);
    void fetchDuelStatus({ force: true });
    fetchWeeklyStats(true);
  }, [
    duelStatus?.lastWeekSummary,
    installId,
    isAccountAuthenticated,
    showToast,
    weeklyStats,
  ]);
  const showDevDuelWeekRecap = React.useCallback(() => {
    requestDuelWeekRecap(true);
  }, [requestDuelWeekRecap]);
  const showPublicDuelWeekRecap = React.useCallback(() => {
    requestDuelWeekRecap(false);
  }, [requestDuelWeekRecap]);

  const sendDevGlobalAnnouncement = React.useCallback(
    (message) =>
      new Promise((resolve) => {
        const body = typeof message === "string" ? message.trim() : "";
        if (!body) {
          resolve(false);
          return;
        }
        if (!socket?.connected) {
          showToast("Serveur indisponible pour l'annonce.", 2200);
          resolve(false);
          return;
        }
        setDevControlsBusy(true);
        socket.emit("dev:globalAnnouncement", { message: body }, (res) => {
          setDevControlsBusy(false);
          applyDevControlsResponse(res);
          if (res?.ok) {
            showToast("Annonce envoyee a tous.", 2200);
            resolve(true);
            return;
          }
          showToast(
            res?.error === "empty_message"
              ? "Message vide."
              : "Annonce globale refusee par le serveur.",
            2600
          );
          resolve(false);
        });
      }),
    [applyDevControlsResponse, showToast]
  );

  useEffect(() => {
    const pendingMode = duelWeekRecapOpenAfterRefreshRef.current;
    if (!pendingMode) return;
    if (duelStatus?.loading || weeklyStatsLoading) return;
    const summary = duelStatus?.lastWeekSummary;
    if (summary && isWeeklyRecapPodiumReady(summary, weeklyStats)) {
      duelWeekRecapOpenAfterRefreshRef.current = null;
      setDuelWeekRecapPreviewMode(pendingMode === "dev");
      setDuelWeekRecapPage(0);
      setDuelWeekRecapOpen(true);
      return;
    }
    if (duelStatus?.error || weeklyStatsError || duelStatus?.loading === false) {
      duelWeekRecapOpenAfterRefreshRef.current = null;
      showToast("Aucun recap hebdo disponible pour l'instant.", 2400);
    }
  }, [
    duelStatus?.error,
    duelStatus?.lastWeekSummary,
    duelStatus?.loading,
    showToast,
    weeklyStats,
    weeklyStatsError,
    weeklyStatsLoading,
  ]);
  const applyModerationAction = React.useCallback(
    (player, action) => {
      if (!socket?.connected || !player) return;
      const label = action === "ban_5m" ? "bannir 5 minutes" : "retirer";
      const nick = String(player.nick || "").trim();
      if (!nick) return;
      if (typeof window !== "undefined" && !window.confirm(`${label} ${nick} ?`)) return;
      setModerationBusy(true);
      setModerationError("");
      socket.emit(
        "moderation:action",
        {
          roomId: currentRoomIdRef.current || roomIdRef.current,
          action,
          socketId: player.socketId,
          installId: player.installId,
          userId: player.userId,
          nick,
        },
        (res) => {
          setModerationBusy(false);
          applyModerationResponse(res);
          if (res?.ok) {
            showToast(action === "ban_5m" ? `${nick} banni 5 minutes.` : `${nick} retire du live.`);
            return;
          }
          setModerationError(
            res?.error === "cannot_target_self"
              ? "Action impossible sur ton propre compte."
              : res?.error === "target_not_found"
              ? "Joueur introuvable."
              : "Action moderation refusee."
          );
        }
      );
    },
    [applyModerationResponse, showToast]
  );
  useEffect(() => {
    if (!isSettingsOpen && settingsCloseTimerRef.current) {
      clearTimeout(settingsCloseTimerRef.current);
      settingsCloseTimerRef.current = null;
    }
  }, [isSettingsOpen]);
  useEffect(() => {
    if (!isSettingsOpen || !socket?.connected) return;
    fetchModerationState();
  }, [fetchModerationState, isSettingsOpen]);
  useEffect(() => {
    return () => {
      if (settingsCloseTimerRef.current) {
        clearTimeout(settingsCloseTimerRef.current);
        settingsCloseTimerRef.current = null;
      }
    };
  }, []);
  const closeSettingsMenu = React.useCallback(
    ({ animatePanels = false } = {}) => {
      playCloseSound();
      if (settingsCloseTimerRef.current) {
        clearTimeout(settingsCloseTimerRef.current);
        settingsCloseTimerRef.current = null;
      }
      const shouldAnimatePanels =
        animatePanels &&
        (isThemeMenuOpen ||
          isSoundMenuOpen ||
          isVisualMenuOpen ||
          isKeyboardMenuOpen ||
          isDevMenuOpen ||
          isModerationMenuOpen);
      if (shouldAnimatePanels) {
        if (isThemeMenuOpen) {
          closeThemeMenu();
        }
        if (isSoundMenuOpen) {
          closeSoundMenu();
        }
        if (isVisualMenuOpen) {
          closeVisualMenu();
        }
        if (isKeyboardMenuOpen) {
          closeKeyboardMenu();
        }
        if (isDevMenuOpen) {
          closeDevMenu();
        }
        if (isModerationMenuOpen) {
          closeModerationMenu();
        }
        settingsCloseTimerRef.current = window.setTimeout(() => {
          settingsCloseTimerRef.current = null;
          setIsSettingsOpen(false);
        }, 320);
        return;
      }
      setIsSettingsOpen(false);
    },
    [
      closeSoundMenu,
      closeThemeMenu,
      closeKeyboardMenu,
      closeDevMenu,
      closeModerationMenu,
      closeVisualMenu,
      isDevMenuOpen,
      isKeyboardMenuOpen,
      isModerationMenuOpen,
      isSoundMenuOpen,
      isThemeMenuOpen,
      isVisualMenuOpen,
    ]
  );
  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (
        authModalMode ||
        definitionModal.open ||
        playerProfileModal.open ||
        roundPlayerModal.open
      ) {
        return;
      }
      event.preventDefault();
      closeSettingsMenu({ animatePanels: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    authModalMode,
    closeSettingsMenu,
    definitionModal.open,
    isSettingsOpen,
    playerProfileModal.open,
    roundPlayerModal.open,
  ]);
  fetchThemeProfileRef.current = fetchThemeProfile;
  const requestThemeResetDefault = React.useCallback(() => {
    const defaults = normalizeThemePreset({
      ...DEFAULT_THEME_PRESET,
      darkMode: !!themeDraftSafe.darkMode,
    });
    setThemeDraft(defaults);
    setThemeLastChangedCategory("tileColor");
    applyThemeVisualState(defaults);
  }, [applyThemeVisualState, themeDraftSafe.darkMode]);
  const executeThemeApply = React.useCallback(
    async (actionMeta) => {
      if (!installId || themeApplying) return false;
      const mode = actionMeta?.mode === "single" ? "single" : "full";
      const category =
        mode === "single" ? String(actionMeta?.category || themeLastChangedCategory || "") : "";
      const draftThemeForApply = normalizeThemePreset(actionMeta?.draftTheme || themeDraftSafe);
      setThemeApplying(true);
      try {
        let res = null;
        let parsed = null;
        let payload = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          res = await fetch("/api/theme/apply", {
            method: "POST",
            cache: "no-store",
            credentials: "include",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              installId,
              mode,
              category,
              draftTheme: draftThemeForApply,
            }),
          });
          parsed = await readJsonResponseLoose(res);
          payload = parsed?.data;
          if (res.ok && payload?.ok) break;
          if (String(payload?.error || "") !== "auth_required" || attempt > 0) break;
          const refreshed = await refreshAuthStatus({ silent: true });
          if (refreshed?.status !== "authenticated" || !refreshed?.user) break;
        }
        if (!res.ok || !payload?.ok) {
          if (payload?.error === "insufficient_funds") {
            const required = Math.max(0, Number(payload?.required) || 0);
            const balance = Math.max(0, Number(payload?.balance) || 0);
            gobblarsKnownBalanceRef.current = balance;
            setGobblarsBalance(balance);
            showToast(
              required > 0
                ? `Pas assez de Gobblars (${balance}/${required}).`
                : "Pas assez de Gobblars.",
              2600,
              { iconSrc: gobblarsBadgeUrl, iconAlt: "Gobblars" }
            );
          } else if (payload?.error === "auth_required") {
            setAccountNotice(ACCOUNT_SESSION_UNAVAILABLE_MESSAGE);
            showToast("Reconnecte-toi pour appliquer ce thème.");
          } else {
            showToast("Impossible d'appliquer ce thème.");
          }
          return false;
        }
        const nextUnlocks = normalizeThemeUnlocks(
          payload.themeUnlocks || {},
          payload.themeApplied || themeDraftSafe
        );
        const nextTheme = coerceThemeToLegacyNativeDefault(
          payload.themeApplied || draftThemeForApply,
          nextUnlocks
        );
        const unlockedNow = Object.keys(nextUnlocks || {}).filter(
          (key) => !!nextUnlocks[key] && !themeUnlocks?.[key]
        );
        const nextBalance = Math.max(0, Number(payload.balance) || 0);
        gobblarsKnownBalanceRef.current = nextBalance;
        setGobblarsBalance(nextBalance);
        {
          const parsedUnlockCost = Number(payload.unlockCost);
          setThemeUnlockCost(
            Math.max(
              0,
              Number.isFinite(parsedUnlockCost) ? parsedUnlockCost : THEME_UNLOCK_COST_DEFAULT
            )
          );
        }
        setThemeUnlocks(nextUnlocks);
        applyThemePresetToLocalState(nextTheme, { syncDraft: true });
        if (unlockedNow.length > 0) {
          setThemeRecentlyUnlocked(unlockedNow);
          setThemeUnlockAnimToken((prev) => prev + 1);
          showToast(`Déverrouillé: ${unlockedNow.length} option(s).`);
          window.setTimeout(() => {
            setThemeRecentlyUnlocked((prev) =>
              prev.filter((key) => !unlockedNow.includes(key))
            );
          }, 650);
        }
        const spent = Math.max(0, Number(payload.spent) || 0);
        showToast(spent > 0 ? `-${spent} Gobblars` : "Thème appliqué.", 2600, {
          iconSrc: spent > 0 ? gobblarsBadgeUrl : "",
          iconAlt: "Gobblars",
        });
        setThemePurchaseConfirm(null);
        return true;
      } catch (_) {
        showToast("Erreur réseau thème.");
        return false;
      } finally {
        setThemeApplying(false);
      }
    },
    [
      applyThemePresetToLocalState,
      installId,
      gobblarsBadgeUrl,
      refreshAuthStatus,
      setAccountNotice,
      showToast,
      themeApplying,
      themeDraftSafe,
      themeLastChangedCategory,
      themeUnlocks,
    ]
  );
  const handleThemeAction = React.useCallback(
    (actionMeta) => {
      if (!actionMeta) return;
      const hasAnyChange = actionMeta.changedCategories.length > 0;
      if (!hasAnyChange) {
        closeThemeMenu();
        return;
      }
      if (actionMeta.totalCost > 0) {
        setThemePurchaseConfirm(actionMeta);
        return;
      }
      void executeThemeApply(actionMeta);
    },
    [closeThemeMenu, executeThemeApply]
  );
  const handleThemeOptionBuy = React.useCallback(
    (category, optionId) => {
      const safeCategory = String(category || "").trim();
      if (!safeCategory) return;
      const nextDraft = buildThemeDraftWithOption(safeCategory, optionId);
      setThemeLastChangedCategory(safeCategory);
      setThemeDraft(nextDraft);
      applyThemeVisualState(nextDraft);
      const actionMeta = {
        ...computeThemeApplyMeta("single", safeCategory, nextDraft),
        draftTheme: nextDraft,
      };
      handleThemeAction(actionMeta);
    },
    [
      applyThemeVisualState,
      buildThemeDraftWithOption,
      computeThemeApplyMeta,
      handleThemeAction,
    ]
  );
  const confirmThemePurchase = React.useCallback(() => {
    if (!themePurchaseConfirm) return;
    if (themePurchaseConfirm.totalCost > gobblarsBalance) {
      showToast("Pas assez de Gobblars.", 2600, {
        iconSrc: gobblarsBadgeUrl,
        iconAlt: "Gobblars",
      });
      return;
    }
    void executeThemeApply(themePurchaseConfirm);
  }, [executeThemeApply, gobblarsBalance, gobblarsBadgeUrl, showToast, themePurchaseConfirm]);
  useEffect(() => {
    const safeFetch = (opts) => void fetchThemeProfileRef.current?.(opts);
    let forceNextFetch = true;
    return refreshFeature.schedule("theme-profile", {
      enabled: !!installId && phase !== "playing",
      intervalMs: 120000,
      onFocus: true,
      onVisible: true,
      run: () => {
        const force = forceNextFetch;
        forceNextFetch = false;
        safeFetch({ silent: true, force });
      },
    });
  }, [installId, phase]);
  useEffect(() => {
    if (isSettingsOpen) return;
    setIsSoundMenuOpen(false);
    setIsVisualMenuOpen(false);
    setIsDevMenuOpen(false);
    setIsModerationMenuOpen(false);
    setIsThemeMenuOpen(false);
    setThemePickerCategory("");
    setThemePurchaseConfirm(null);
    setThemeDraft(themeAppliedSafe);
    applyThemeVisualState(themeAppliedSafe);
  }, [applyThemeVisualState, isSettingsOpen, themeAppliedSafe]);
  useEffect(() => {
    if (isSettingsOpen) return;
    if (appView !== "daily_play") return;
    // Force une synchro visuelle à l'entrée de la grille du jour (tous modes).
    applyThemeVisualState(themeAppliedSafe);
  }, [
    appView,
    applyThemeVisualState,
    isSettingsOpen,
    themeAppliedSafe,
  ]);
  const themeSingleActionLabel = themeSingleApplyMeta.totalCost > 0 ? "Acheter" : "Appliquer";
  const themeFullActionLabel = themeFullApplyMeta.totalCost > 0 ? "Acheter le thème" : "Appliquer";
  const themeCategoryLabel = React.useCallback(
    (category) =>
      category === "darkMode"
        ? "Mode clair/sombre"
        : THEME_PICKER_LABELS[category] || String(category || ""),
    []
  );
  const themeFullChangedLabels = React.useMemo(
    () => (themeFullApplyMeta.changedCategories || []).map((key) => themeCategoryLabel(key)),
    [themeCategoryLabel, themeFullApplyMeta.changedCategories]
  );
  const themeFullChangedSummary =
    themeFullChangedLabels.length > 0
      ? themeFullChangedLabels.join(" · ")
      : "Aucun paramètre modifié";
  const themePickerOptions = THEME_PICKER_OPTIONS[themePickerCategory] || [];
  const themePickerTitle = THEME_PICKER_LABELS[themePickerCategory] || "Choix";
  const themePickerCurrentValue =
    themePickerCategory && themeDraftSafe && Object.prototype.hasOwnProperty.call(themeDraftSafe, themePickerCategory)
      ? themeDraftSafe[themePickerCategory]
      : null;
  const themePickerViewMode =
    themePickerCategory === "tileColor" ||
    themePickerCategory === "letterColor" ||
    themePickerCategory === "background"
      ? "palette"
      : themePickerCategory === "letterScale"
      ? "slider"
      : themePickerCategory === "font"
      ? "font-list"
      : "list";
  const themeLastCategoryLabel =
    themeLastChangedCategory === "darkMode"
      ? "Mode clair/sombre"
      : THEME_PICKER_LABELS[themeLastChangedCategory] || "Dernier changement";
  const toggleDarkModeQuick = React.useCallback(() => {
    const nextDarkMode = !themeDraftSafe.darkMode;
    const nextTheme = normalizeThemePreset({
      ...themeDraftSafe,
      darkMode: nextDarkMode,
    });
    setThemeLastChangedCategory("darkMode");
    setThemeDraft(nextTheme);
    setThemeApplied((prev) =>
      normalizeThemePreset({
        ...prev,
        darkMode: nextDarkMode,
      })
    );
    applyThemeVisualState(nextTheme);
  }, [applyThemeVisualState, themeDraftSafe]);
  const settingsShellClass = menuDarkMode
    ? "border-amber-300/70 bg-[linear-gradient(180deg,rgba(18,47,103,0.96),rgba(7,22,55,0.98))] text-amber-50"
    : "border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,250,232,0.98),rgba(226,238,255,0.99))] text-slate-900";
  const settingsPanelButtonClass = menuDarkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50 hover:bg-slate-950/50"
    : "bg-white/65 border-amber-300/45 text-slate-800 hover:bg-amber-50/80";
  const settingsGoldButtonClass =
    "bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950 shadow";
  const settingsPositiveButtonClass = menuDarkMode
    ? "bg-emerald-900/55 border-emerald-300/40 text-emerald-50 hover:bg-emerald-900/70"
    : "bg-emerald-50/85 border-emerald-300/60 text-emerald-800 hover:bg-emerald-100";
  const settingsMutedButtonClass = menuDarkMode
    ? "bg-slate-950/25 border-amber-200/20 text-amber-50/80 hover:bg-slate-950/40"
    : "bg-white/45 border-amber-300/35 text-slate-700 hover:bg-amber-50/70";
  const settingsDangerButtonClass = menuDarkMode
    ? "bg-rose-950/55 border-rose-300/40 text-rose-50 hover:bg-rose-950/70"
    : "bg-rose-50/85 border-rose-300/60 text-rose-800 hover:bg-rose-100";
  const settingsMenuView = isSettingsOpen ? (
    <Suspense fallback={null}>
      <SettingsMenu
      ACCOUNT_SERVER_BUSY_MESSAGE={ACCOUNT_SERVER_BUSY_MESSAGE}
      AUTH_MODAL_MODES={AUTH_MODAL_MODES}
      BONUS_CLASSES={BONUS_CLASSES}
      GridTileLetter={GridTileLetter}
      MOBILE_GRID_MAX_WIDTH={MOBILE_GRID_MAX_WIDTH}
      MobileGrid={MobileGrid}
      SOUND_MASTER_VOLUME_DEFAULT={SOUND_MASTER_VOLUME_DEFAULT}
      TILE_LETTER_SCALE_DEFAULT={TILE_LETTER_SCALE_DEFAULT}
      TILE_LETTER_SCALE_MAX={TILE_LETTER_SCALE_MAX}
      TILE_LETTER_SCALE_MIN={TILE_LETTER_SCALE_MIN}
      allSoundOn={allSoundOn}
      allVisualOn={allVisualOn}
      ambientOn={ambientOn}
      applyModerationAction={applyModerationAction}
      applyThemeDraftCategory={applyThemeDraftCategory}
      applyThemeVisualState={applyThemeVisualState}
      authState={authState}
      buildThemeDraftWithOption={buildThemeDraftWithOption}
      canVibrate={canVibrate}
      clearDevChat={clearDevChat}
      closeDevMenu={closeDevMenu}
      closeKeyboardMenu={closeKeyboardMenu}
      closeModerationMenu={closeModerationMenu}
      closeSettingsMenu={closeSettingsMenu}
      closeSoundMenu={closeSoundMenu}
      closeThemeMenu={closeThemeMenu}
      closeVisualMenu={closeVisualMenu}
      computeThemeApplyMeta={computeThemeApplyMeta}
      confirmThemePurchase={confirmThemePurchase}
      darkMode={darkMode}
      defaultTileBaseClass={defaultTileBaseClass}
      chatBotVisibility={chatBotVisibility}
      chatBotVisibilityOptions={CHAT_BOT_VISIBILITY_OPTIONS}
      devAccountAllowed={devAccountAllowed}
      devAccountLabel={devAccountLabel}
      devBots={devBots}
      devControls={devControls}
      devControlsAvailable={devControlsAvailable}
      devControlsBusy={devControlsBusy}
      devControlsLocked={devControlsLocked}
      devError={devError}
      devMenuUnlocked={devMenuUnlocked}
      devPassword={devPassword}
      devPasswordConfigured={devPasswordConfigured}
      devPasswordRequired={devPasswordRequired}
      devPlaytimeLimits={devPlaytimeLimits}
      devRoundTypes={devRoundTypes}
      targetWaitDevArmed={targetWaitDevArmed}
      targetWaitDevActive={targetWaitDevActive}
      enabledSoundCount={enabledSoundCount}
      enabledVisualCount={enabledVisualCount}
      fetchDevBots={fetchDevBots}
      fetchDevPlaytimeLimits={fetchDevPlaytimeLimits}
      fetchModerationState={fetchModerationState}
      fillDevChat={fillDevChat}
      getBonusBadgeClass={getBonusBadgeClass}
      getBonusLetterRingClass={getBonusLetterRingClass}
      getThemeUnlockItemKey={getThemeUnlockItemKey}
      getTileColorSwatchStyle={getTileColorSwatchStyle}
      getTileColorTextureStyle={getTileColorTextureStyle}
      gobblarsBadgeUrl={gobblarsBadgeUrl}
      gobblarsBalance={gobblarsBalance}
      handleAccountLogout={handleAccountLogout}
      handleSettingsTitleDevTap={handleSettingsTitleDevTap}
      handleThemeAction={handleThemeAction}
      handleThemeOptionBuy={handleThemeOptionBuy}
      isAccountAuthenticated={isAccountAuthenticated}
      isAuthServerUnavailable={isAuthServerUnavailable}
      isAuthStatusPending={isAuthStatusPending}
      isConnecting={isConnecting}
      isDevMenuOpen={isDevMenuOpen}
      isKeyboardMenuOpen={isKeyboardMenuOpen}
      isMobileLayout={isMobileLayout}
      isModerationMenuOpen={isModerationMenuOpen}
      isOpen={isSettingsOpen}
      isSoundMenuOpen={isSoundMenuOpen}
      isThemeMenuOpen={isThemeMenuOpen}
      isThemeOptionLockableGlobal={isThemeOptionLockableGlobal}
      isThemeOptionUnlocked={isThemeOptionUnlocked}
      isVibrationEnabled={isVibrationEnabled}
      isVisualMenuOpen={isVisualMenuOpen}
      keyboardRecallSubmittedWord={keyboardRecallSubmittedWord}
      legacyProfileUsername={legacyProfileUsername}
      lockDevControls={lockDevControls}
      menuDarkMode={menuDarkMode}
      moderationAccountLabel={moderationAccountLabel}
      moderationAvailable={moderationAvailable}
      moderationBusy={moderationBusy}
      moderationError={moderationError}
      moderationPlayers={moderationPlayers}
      normalizeBonusLabel={normalizeBonusLabel}
      normalizeLetterKey={normalizeLetterKey}
      normalizeSoundMasterVolume={normalizeSoundMasterVolume}
      normalizeThemePreset={normalizeThemePreset}
      normalizeTileLetterScale={normalizeTileLetterScale}
      openAuthDialog={openAuthDialog}
      openDevMenu={openDevMenu}
      openTargetWaitDevPlayground={openTargetWaitDevPlayground}
      openKeyboardMenu={openKeyboardMenu}
      openModerationMenu={openModerationMenu}
      openSoundMenu={openSoundMenu}
      openThemeMenu={openThemeMenu}
      openVisualMenu={openVisualMenu}
      openTutorialFromHome={openTutorialFromHome}
      patchDevControls={patchDevControls}
      perfTestEnabled={perfTestEnabled}
      playUiClickSound={playSwipeSound}
      playtimeLimit={playtimeLimit}
      playtimeRemainingMs={playtimeRemainingMs}
      refreshAuthStatus={refreshAuthStatus}
      setPlaytimeLimitFromSettings={setPlaytimeLimitFromSettings}
      clearDevPlaytimeLimit={clearDevPlaytimeLimit}
      requestThemeResetDefault={requestThemeResetDefault}
      returnToLobby={returnToLobby}
      returnToLiveLobbyDev={returnToLiveLobbyDev}
      sendDevGlobalAnnouncement={sendDevGlobalAnnouncement}
      setAllDevBotsActive={setAllDevBotsActive}
      setChatBotVisibility={setChatBotVisibility}
      setAllSoundEnabled={setAllSoundEnabled}
      setAllVisualEnabled={setAllVisualEnabled}
      setDevBotActive={setDevBotActive}
      setDevPassword={setDevPassword}
      setIsAboutOpen={setIsAboutOpen}
      setIsAmbientMuted={setIsAmbientMuted}
      setIsSettingsOpen={setIsSettingsOpen}
      setIsVibrationEnabled={setIsVibrationEnabled}
      setKeyboardRecallSubmittedWord={setKeyboardRecallSubmittedWord}
      setPerfTestEnabled={setPerfTestEnabled}
      setShowHelp={setShowHelp}
      setSoundGobbleEnabled={setSoundGobbleEnabled}
      setSoundInvalidErrorEnabled={setSoundInvalidErrorEnabled}
      setSoundMasterVolume={setSoundMasterVolume}
      setSoundTileStepEnabled={setSoundTileStepEnabled}
      setSoundTimerEnabled={setSoundTimerEnabled}
      setSoundValidationEnabled={setSoundValidationEnabled}
      setThemeApplied={setThemeApplied}
      setThemeDraft={setThemeDraft}
      setThemeLastChangedCategory={setThemeLastChangedCategory}
      setThemePickerCategory={setThemePickerCategory}
      setThemePurchaseConfirm={setThemePurchaseConfirm}
      setTilePointsVisible={setTilePointsVisible}
      setVisualConfettiEnabled={setVisualConfettiEnabled}
      setVisualGoldNickFxEnabled={setVisualGoldNickFxEnabled}
      setVisualGobbleEnabled={setVisualGobbleEnabled}
      setVisualInvalidWordsEnabled={setVisualInvalidWordsEnabled}
      setVisualPraiseEnabled={setVisualPraiseEnabled}
      setVisualScoreFlightsEnabled={setVisualScoreFlightsEnabled}
      setVisualScreenShakeEnabled={setVisualScreenShakeEnabled}
      showDevDuelWeekRecap={showDevDuelWeekRecap}
      soundGobbleEnabled={soundGobbleEnabled}
      soundInvalidErrorEnabled={soundInvalidErrorEnabled}
      soundMasterVolume={soundMasterVolume}
      soundTileStepEnabled={soundTileStepEnabled}
      soundTimerEnabled={soundTimerEnabled}
      soundValidationEnabled={soundValidationEnabled}
      themeApplying={themeApplying}
      themeCategoryLabel={themeCategoryLabel}
      themeControlButtons={themeControlButtons}
      themeDraftSafe={themeDraftSafe}
      themeFullActionLabel={themeFullActionLabel}
      themeFullApplyMeta={themeFullApplyMeta}
      themeFullChangedSummary={themeFullChangedSummary}
      themeLastCategoryLabel={themeLastCategoryLabel}
      themePickerCategory={themePickerCategory}
      themePickerCurrentValue={themePickerCurrentValue}
      themePickerOptions={themePickerOptions}
      themePickerTitle={themePickerTitle}
      themePickerViewMode={themePickerViewMode}
      themePreviewBackgroundStyle={themePreviewBackgroundStyle}
      themePreviewCells={themePreviewCells}
      themePreviewEmptySet={themePreviewEmptySet}
      themePreviewGap={themePreviewGap}
      themePreviewGridRef={themePreviewGridRef}
      themePreviewIsSquare={themePreviewIsSquare}
      themePreviewMaterialClass={themePreviewMaterialClass}
      themePreviewMobileGapPx={themePreviewMobileGapPx}
      themePreviewMobileGridSide={themePreviewMobileGridSide}
      themePreviewMobileTileFontPx={themePreviewMobileTileFontPx}
      themePreviewNoop={themePreviewNoop}
      themePreviewPadding={themePreviewPadding}
      themePreviewTileColor={themePreviewTileColor}
      themePreviewTileRefs={themePreviewTileRefs}
      themePreviewUseBadge={themePreviewUseBadge}
      themePreviewUseFill={themePreviewUseFill}
      themePreviewUseRing={themePreviewUseRing}
      themePurchaseConfirm={themePurchaseConfirm}
      themeRecentlyUnlocked={themeRecentlyUnlocked}
      themeUnlockAnimToken={themeUnlockAnimToken}
      tileLetterColorValue={tileLetterColorValue}
      tilePointsVisible={tilePointsVisible}
      tileScore={tileScore}
      unlockDevControls={unlockDevControls}
      vibrationOn={vibrationOn}
      visualConfettiEnabled={visualConfettiEnabled}
      visualGoldNickFxEnabled={visualGoldNickFxEnabled}
      visualGobbleEnabled={visualGobbleEnabled}
      visualInvalidWordsEnabled={visualInvalidWordsEnabled}
      visualPraiseEnabled={visualPraiseEnabled}
      visualScoreFlightsEnabled={visualScoreFlightsEnabled}
      visualScreenShakeEnabled={visualScreenShakeEnabled}
      />
    </Suspense>
  ) : null;

  const accountMenuView = isAccountMenuOpen ? (
    <Suspense fallback={null}>
      <AccountMenu
        appearance={{
          dangerButtonClass: settingsDangerButtonClass,
          darkMode: menuDarkMode,
          goldButtonClass: settingsGoldButtonClass,
          panelButtonClass: settingsPanelButtonClass,
          shellClass: settingsShellClass,
        }}
        auth={{
          authenticated: isAccountAuthenticated,
          modes: AUTH_MODAL_MODES,
          pending: isAuthStatusPending,
          serverUnavailable: isAuthServerUnavailable,
          status: authState.status,
          user: authState.user,
          userId: authenticatedUserId,
        }}
        labels={{
          legacyUsername: legacyProfileUsername,
          nickname,
          serverBusyMessage: ACCOUNT_SERVER_BUSY_MESSAGE,
        }}
        actions={{
          onClose: () => setIsAccountMenuOpen(false),
          onLogout: handleAccountLogout,
          onOpenAuth: openAuthDialog,
          onOpenProfile: openPlayerProfile,
          onRefresh: () => refreshAuthStatus({ silent: false }),
        }}
      />
    </Suspense>
  ) : null;
  const aboutModalView = (
    <>
      {isAboutOpen || isSupportOpen || isPatchNotesOpen ? (
        <Suspense fallback={null}>
          <AboutModals
            isAboutOpen={isAboutOpen}
            isSupportOpen={isSupportOpen}
            isPatchNotesOpen={isPatchNotesOpen}
            menuDarkMode={menuDarkMode}
            darkMode={darkMode}
            supportModalSection={supportModalSection}
            setIsAboutOpen={setIsAboutOpen}
            setIsSupportOpen={setIsSupportOpen}
            setIsPatchNotesOpen={setIsPatchNotesOpen}
            setSupportModalSection={setSupportModalSection}
            closePatchNotes={closePatchNotes}
          />
        </Suspense>
      ) : null}
      <FacebookGroupInviteModal
        open={isFacebookInviteOpen}
        darkMode={menuDarkMode}
        onClose={() => setIsFacebookInviteOpen(false)}
      />
    </>
  );

  const quickHelpOverlay = showHelp ? (
    <Suspense fallback={null}>
      <HelpOverlay open={showHelp} darkMode={darkMode} onClose={() => setShowHelp(false)} />
    </Suspense>
  ) : null;

  const isLiveLobbyMobileView =
    isMobileLayout && isLoggedIn && appView === "live" && phase === "lobby";
  const mobileChatProps = {
    appView,
    blockedCount,
    blockedEntries,
    chatAnimationMs: CHAT_DRAWER_ANIM_MS,
    chatEditTarget,
    chatInputDisabled,
    chatFocusPreserveKey: `${appView}:${isLoggedIn ? "live" : "guest"}`,
    chatInputPlaceholder,
    chatInputRef,
    chatInputType,
    chatOpenedAtMs,
    chatKeyboardInsetPx,
    chatMessagesUnreadCount,
    chatOverlayStyle: globalChatOverlayStyle,
    chatReplyTarget,
    chatSheetStyle: globalChatSheetStyle,
    chatSystemCount,
    chatTab,
    chatViewportStyle,
    closeChatPanel,
    cycleChatHistory,
    darkMode: appView === "home" ? true : darkMode,
    installId,
    isChatClosing: isLiveLobbyMobileView ? false : isChatClosing,
    isChatOpenMobile: isLiveLobbyMobileView ? false : isChatOpenMobile,
    isLoggedIn,
    isMobileLayout,
    isSpecial3WordsMode: phase === "playing" && isSpecial3WordsMode,
    keyboardInsetReservePx,
    mobileChatUnreadIsBotOnly,
    mobileChatUnreadCount,
    getAuthorNickClassName: getLiveNickClassName,
    onChangeChatTab: setChatTab,
    onChatInputFocus: handleChatInputFocus,
    onClearChatEdit: clearChatEditTarget,
    onClearChatReply: clearChatReplyTarget,
    onCloseSound: playCloseSound,
    onDeleteOwnMessage: deleteOwnChatMessage,
    onEditOwnMessage: beginChatEditFromMessage,
    onOpenChat: requestOpenChat,
    onOpenRules: () => setIsChatRulesOpen(true),
    onOpenUserMenu: openUserMenu,
    onReactToMessage: sendChatReaction,
    onSelectChatReply: setChatReplyTargetFromMessage,
    onToggleBlockedList: () => setShowBlockedList((prev) => !prev),
    onUnblockInstallId: unblockInstallId,
    reactionEmojis: CHAT_REACTION_EMOJIS,
    selfNick,
    setChatInput,
    showLauncherButton: !isLiveLobbyMobileView,
    showBlockedList,
    showBotMessages,
    submitChat,
    onToggleShowBotMessages: () => setShowBotMessages((prev) => !prev),
    visibleMessages,
  };
  const homeChatVisibleMessages = React.useMemo(() => {
    const source = safeChatTab === "system" ? chatSystemMessages : chatMessagesOnly;
    const cap =
      safeChatTab === "system" ? CHAT_SYSTEM_HISTORY_MAX : CHAT_MESSAGES_HISTORY_MAX;
    if (!Array.isArray(source)) return [];
    if (source.length <= cap) return source;
    return source.slice(-cap);
  }, [safeChatTab, chatSystemMessages, chatMessagesOnly]);
  const homeChatProps = {
    open: isHomeChatOpen,
    darkMode: menuDarkMode,
    chatTab: safeChatTab,
    onChangeChatTab: setChatTab,
    onClose: closeHomeChat,
    messagesUnreadCount: homeChatUnreadCount,
    visibleMessages: homeChatVisibleMessages,
    showBlockedList,
    blockedEntries,
    blockedCount,
    onToggleBlockedList: () => setShowBlockedList((prev) => !prev),
    onUnblockInstallId: unblockInstallId,
    onOpenRules: () => setIsChatRulesOpen(true),
    onOpenUserMenu: openUserMenu,
    setChatInput,
    chatFocusPreserveKey: `${appView}:home`,
    chatInputRef,
    chatInputDisabled,
    chatInputPlaceholder,
    onChatInputFocus: handleChatInputFocus,
    submitChat,
    cycleChatHistory,
    chatEditTarget,
    onClearChatEdit: clearChatEditTarget,
    chatReplyTarget,
    onClearChatReply: clearChatReplyTarget,
    onEditOwnMessage: beginChatEditFromMessage,
    onDeleteOwnMessage: deleteOwnChatMessage,
    onSelectChatReply: setChatReplyTargetFromMessage,
    onReactToMessage: sendChatReaction,
    reactionEmojis: CHAT_REACTION_EMOJIS,
    getAuthorNickClassName: getLiveNickClassName,
    showBotMessages,
    onToggleShowBotMessages: () => setShowBotMessages((prev) => !prev),
    selfNick,
    selfInstallId: installId,
  };
  const mobileExitConfirmLayer = mobileExitConfirmOpen ? (
    <div
      className="fixed inset-0 z-[22000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmer la sortie"
      onClick={() => {
        setMobileExitConfirmOpen(false);
        if (shouldProtectMobileLiveExit) pushMobileExitGuardHistoryEntry();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-red-300/50 bg-slate-950 px-4 py-4 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-red-300">
          Quitter la partie ?
        </div>
        <div className="mt-3 text-center text-sm font-semibold leading-snug text-slate-100">
          Tu es en pleine manche. Si tu quittes maintenant, tu abandonnes la manche en cours.
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-black text-white"
            onClick={() => {
              setMobileExitConfirmOpen(false);
              if (shouldProtectMobileLiveExit) pushMobileExitGuardHistoryEntry();
            }}
          >
            Rester
          </button>
          <button
            type="button"
            className="rounded-xl bg-red-600 px-3 py-2 text-sm font-black text-white shadow-lg shadow-red-950/30"
            onClick={() => {
              mobileExitGuardLeavingRef.current = true;
              mobileExitGuardActiveRef.current = false;
              setMobileExitConfirmOpen(false);
              returnToLobby();
            }}
          >
            Quitter
          </button>
        </div>
      </div>
    </div>
  ) : null;
  const globalChatLayer = (
    <>
      <GlobalChatLayer
        key="global-chat-layer"
        mobileProps={mobileChatProps}
        homeProps={homeChatProps}
      />
      {mobileExitConfirmLayer}
    </>
  );
  const duelTeam = duelStatus?.team === "red" || duelStatus?.team === "blue" ? duelStatus.team : null;
  const homeBackgroundDesktop = getUiImageUrl(getHomeBackgroundKey(duelTeam, "wide"));
  const homeBackgroundMobile = getUiImageUrl(getHomeBackgroundKey(duelTeam, "tall"));
  const dailyRemainingCount = dailyStatus?.ready
    ? [
        !dailyStatus?.hasPlayedMonstrous,
        !dailyStatus?.hasPlayedSpecial,
        !dailyStatus?.hasPlayedFakeTwins,
      ].filter(Boolean).length
    : 0;
  const homeMaintenanceActive = !!(
    tournamentLobby?.maintenanceMode || dailyStatus?.maintenanceMode
  );
  const {
    duelContributorsBlue,
    duelContributorsRed,
    shouldPrepareDailyOrDuelStandaloneView,
    shouldPrepareDailyStandaloneView,
  } = useDailyDuelStandalonePrep({ appView, duelStatus, isLoggedIn });
  const broadcastMessageKey = getBroadcastMessageKey(broadcastNotice?.message);
  const broadcastAccountMarker = buildBroadcastSeenMarker(broadcastMessageKey);
  const broadcastAlreadySeen =
    !isAccountAuthenticated ||
    !accountSeenReady ||
    !broadcastAccountMarker ||
    accountSeenMarkers.has(broadcastAccountMarker);
  const isHomeLobbyView = !isLoggedIn && appView === "home";
  const shouldShowBroadcastPopup =
    isHomeLobbyView &&
    !shouldShowTutorial &&
    !isTutorialOpen &&
    !isNewPlayerPopupQuiet &&
    !duelPopupState?.mode &&
    !!broadcastNotice?.message &&
    !broadcastAlreadySeen;
  const broadcastPopupOverlay = shouldShowBroadcastPopup ? (
    <Suspense fallback={null}>
      <BroadcastNoticePopup
        darkMode={menuDarkMode}
        message={broadcastNotice?.message}
        onClose={dismissBroadcastNotice}
      />
    </Suspense>
  ) : null;
  const shouldShowPlaytimeCountdown =
    isLoggedIn && appView === "live" && !!playtimeLimit?.active;
  const playtimeCountdownOverlay = shouldShowPlaytimeCountdown ? (
    <Suspense fallback={null}>
      <PlaytimeCountdownOverlay visible remainingMs={playtimeRemainingMs} />
    </Suspense>
  ) : null;
  const globalRedAnnouncementOverlay = globalRedAnnouncement ? (
    <Suspense fallback={null}>
      <GlobalRedAnnouncementOverlay announcement={globalRedAnnouncement} />
    </Suspense>
  ) : null;
  const perfTestOverlay = perfTestEnabled ? (
    <Suspense fallback={null}>
      <PerfTestOverlay phase={phase} roundId={roundId} />
    </Suspense>
  ) : null;
  const vaultWordOfDayOverlay = vaultWordOfDayPopup.open ? (
    <Suspense fallback={null}>
      <VaultWordOfDayPopup
        definition={vaultWordOfDayPopup.definition}
        displayWord={vaultWordOfDayPopup.displayWord}
        onClose={closeVaultWordOfDayPopup}
        onOpenVault={openVaultFromWordOfDay}
        source={vaultWordOfDayPopup.source}
        url={vaultWordOfDayPopup.url}
        word={vaultWordOfDayPopup.word}
      />
    </Suspense>
  ) : null;
  const duelTeamTintColor =
    duelTeam === "red"
      ? "rgba(239, 68, 68, 0.05)"
      : duelTeam === "blue"
      ? "rgba(37, 99, 235, 0.05)"
      : "";
  const teamTintOverlay = duelTeamTintColor ? (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{ backgroundColor: duelTeamTintColor }}
    />
  ) : null;
  const duelPopupOverlay = duelPopupState?.mode ? (
    <Suspense fallback={null}>
      <DuelPopupOverlay
        darkMode={menuDarkMode}
        state={duelPopupState}
        tutorialSteps={DUEL_TUTORIAL_STEPS}
        status={{
          hasPlayedDaily: !!dailyStatus?.hasPlayed,
          objectives: duelStatus?.objectives,
          rerollBusyBucket: duelRerollBusyBucket,
        }}
        actions={{
          getConsumedValidatedKeys: getDuelConsumedValidatedKeys,
          onAcknowledgeTeam: acknowledgeDuelTeamPopup,
          onAdvanceTutorial: advanceDuelTutorial,
          onCloseObjectives: closeDuelObjectivesPopup,
          onObjectiveValidated: handleDuelObjectiveValidated,
          onReroll: rerollDuelObjective,
          onValidatedObjectiveConsumed: markDuelValidatedObjectiveConsumed,
        }}
      />
    </Suspense>
  ) : null;
  const duelWeekSummary = duelStatus?.lastWeekSummary || null;
  const closeDuelWeekRecap = React.useCallback(() => {
    const weekId = String(duelWeekSummary?.weekId || "").trim();
    if (!duelWeekRecapPreviewMode && weekId) {
      markAccountSeen(buildDuelWeekRecapSeenMarker(weekId));
    }
    setDuelWeekRecapOpen(false);
    setDuelWeekRecapPage(0);
    setDuelWeekRecapPreviewMode(false);
  }, [duelWeekRecapPreviewMode, duelWeekSummary?.weekId, markAccountSeen]);
  const nextDuelWeekRecapPage = React.useCallback(() => {
    setDuelWeekRecapPage((prev) => Math.min(prev + 1, 2));
  }, []);
  const duelWeekRecapOverlay = duelWeekRecapOpen ? (
    <Suspense fallback={null}>
      <DuelWeekRecapOverlay
        open
        summary={duelWeekSummary}
        page={duelWeekRecapPage}
        weeklyStats={weeklyStats}
        onNext={nextDuelWeekRecapPage}
        onClose={closeDuelWeekRecap}
        formatNumber={formatNumber}
      />
    </Suspense>
  ) : null;
  const homeLobbyActions = useHomeLobbyActions({
    onDismissResume: dismissResumePrompt,
    onOpenAccount: openHomeAccount,
    onOpenChat: openHomeChat,
    onOpenDaily: openDailyHome,
    onOpenDuel: openDuelPage,
    onOpenPlayers: openPlayersOverlayAlpha,
    onOpenSettings: openSettingsPanel,
    onOpenStats: openWeeklyStatsOverlay,
    onOpenVault: openWordVaultPage,
    onOpenWeeklyRecap: showPublicDuelWeekRecap,
    onPlay: handleLoginOrResume,
    onResume: handleResumeFromPrompt,
  });
  const trainingSessionControls = standaloneTrainingSession ? (
    <TrainingSessionControls
      compact={isMobileLayout}
      phase={phase}
      onJoinLive={standaloneTrainingController.requestJoinLive}
      onFinish={finishStandaloneTraining}
      onReplay={replayStandaloneTraining}
      onReturnLobby={standaloneTrainingController.returnToLobby}
    />
  ) : null;
  const chatOverlays = (
    <>
      {duelPopupOverlay}
      {duelWeekRecapOverlay}
      {globalRedAnnouncementOverlay}
      {playtimeCountdownOverlay}
      {perfTestOverlay}
      {playersOverlay}
      {trainingConfirmModal}
      <TrainingJoinLiveDialog
        busy={standaloneTrainingController.busy}
        darkMode={darkMode}
        status={standaloneTrainingController.joinDialog}
        onCancel={standaloneTrainingController.cancelJoinDialog}
        onConfirm={standaloneTrainingController.confirmJoinLive}
      />
      {chatInteractionOverlaysView}
      {playerProfileModalView}
      {definitionOverlaysView}
      {roundPlayerModalView}
      {recordModalView}
      {vocabOverlayView}
      {tutorialOverlay}
      {authDialogView}
      {specialTutorialOverlay}
      {settingsMenuView}
      {targetWaitDevActive ? (
        <Suspense fallback={null}>
          <TargetWaitDevPlayground
            active
            gridHost={targetWaitDevGridHost}
            sideHost={targetWaitDevSideHost}
            socket={socket}
            darkMode={darkMode}
            getNickClassName={getLiveNickClassName}
            onToast={showToast}
            onSessionStateChange={setTargetWaitDevSessionState}
            compact={isMobileLayout}
          />
        </Suspense>
      ) : null}
      {aboutModalView}
      <ChatReactionToastSatellite />
      <NotificationToastLayer darkMode={darkMode} />
    </>
  );
  const suppressLiveChatMotion = isMobileLayout && (isChatOpenMobile || isChatClosing);
  const savedSessionNick = sessionRef.current?.nick?.trim() || "";
  const canResumeNow = !isLoggedIn && hasSavedSession() && !!resumeSnapshot;
  const resumeRoomLabel =
    resumeSnapshot?.roomId && ROOM_OPTIONS[resumeSnapshot.roomId]
      ? ROOM_OPTIONS[resumeSnapshot.roomId].label
      : resumeSnapshot?.roomId || "";
  const resumePhaseLabel =
    resumeSnapshot?.phase === "playing"
      ? "Manche en cours"
      : resumeSnapshot?.phase === "results"
      ? "Résultats"
      : "Accueil";
  const resumeRoundLabel =
    resumeSnapshot?.currentRound?.tournament?.round ||
    resumeSnapshot?.lastRoundResults?.payload?.tournament?.round ||
    null;

  if (!isLoggedIn && (appView === "daily" || appView === "daily_results")) {
    return (
      <Suspense fallback={null}>
        <DailyHubScreen
          view={{ appView, darkMode, isMobileLayout, menuDarkMode }}
          daily={{
            dailyBoard,
            dailyEntries,
            dailyHistory,
            dailyHistoryError,
            dailyHistoryIndex,
            dailyHistoryLoading,
            dailyHistoryScrollRef,
            dailyLaunchDialog,
            dailyRankingView,
            dailyResult,
            dailySection,
            dailyStartError,
            dailyStatus,
            dailySubmitError,
            duelStatus,
          }}
          identity={{ installId, selfNick }}
          background={{ homeBackgroundDesktop, homeBackgroundMobile }}
          preparation={{
            shouldPrepareDailyOrDuelStandaloneView,
            shouldPrepareDailyStandaloneView,
          }}
          overlays={{
            aboutModalView,
            authDialogView,
            chatOverlays,
            globalChatLayer,
            quickHelpOverlay,
            settingsMenuView,
            tutorialOverlay,
          }}
          actions={{
            closeDailyLaunchDialog,
            confirmDailyLaunch,
            openDailyLaunchDialog,
            openDefinition,
            setAppView,
            setDailyHistoryIndex,
            setDailyRankingView,
            setDailySection,
          }}
          renderers={{ renderCrownIcon, renderGobbleBadge, renderHumanDot }}
        />
      </Suspense>
    );
  }

  if (!isLoggedIn && appView === "duel") {
    return (
      <Suspense fallback={null}>
        <DuelHubScreen
          overlays={{
            aboutModalView,
            authDialogView,
            definitionModalView: definitionOverlaysView,
            playerProfileModalView,
            playersOverlay,
            quickHelpOverlay,
            settingsMenuView,
            tutorialOverlay,
          }}
          appearance={{ darkMode, menuDarkMode, weeklyOverlayStyle }}
          duel={{
            dailyStatus,
            duelBlueScore,
            duelContributorsBlue,
            duelContributorsRed,
            duelRedScore,
            duelRerollBusyBucket,
            duelStatus,
            duelTeam,
          }}
          identity={{ installId, selfNick }}
          actions={{
            getDuelConsumedValidatedKeys,
            handleDuelObjectiveValidated,
            markDuelValidatedObjectiveConsumed,
            rerollDuelObjective,
            setAppView,
          }}
          renderHumanDot={renderHumanDot}
        />
      </Suspense>
    );
  }

  if (!isLoggedIn && appView === "vault") {
    return (
      <>
        {playersOverlay}
        {playerProfileModalView}
        {definitionOverlaysView}
        {tutorialOverlay}
        {authDialogView}
        {settingsMenuView}
        {aboutModalView}
        {quickHelpOverlay}
        <Suspense fallback={null}>
          <WordVaultPage
            backgroundDesktop={homeBackgroundDesktop}
            backgroundMobile={homeBackgroundMobile}
            darkMode={menuDarkMode}
            loading={wordVault.loading}
            error={wordVault.error}
            words={wordVault.words}
            accountLabel={authState.user?.usernameDisplay || ""}
            standaloneWarning={isIosStandalone}
            sortMode={wordVault.sortMode}
            onSortChange={setWordVaultSortMode}
            onOpenWord={(word) => openDefinition(word, { fromVault: true, preferLongDefinition: true })}
            onRetry={() => fetchWordVault()}
            onClose={() => setAppView("home")}
          />
        </Suspense>
      </>
    );
  }

  if (!isLoggedIn && appView === "stats") {
    return (
      <>
        {playersOverlay}
        {playerProfileModalView}
        {definitionOverlaysView}
        {tutorialOverlay}
        {authDialogView}
        {settingsMenuView}
        {aboutModalView}
        {quickHelpOverlay}
        {globalChatLayer}
        <div
          className="relative w-full flex items-stretch justify-center px-2 sm:px-4 overflow-hidden text-white"
          style={weeklyOverlayStyle}
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('${
                isMobileLayout ? homeBackgroundMobile : homeBackgroundDesktop
              }')`,
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
            aria-hidden="true"
          />
          {weeklyStatsPage}
        </div>
      </>
    );
  }

  if (!isLoggedIn && !isDailyPlay) {
    const homeAccountLabel =
      authState.user?.usernameDisplay ||
      legacyProfileUsername ||
      savedSessionNick ||
      nickname ||
      "Compte";

    return (
      <>
        {teamTintOverlay}
        {duelPopupOverlay}
        {duelWeekRecapOverlay}
        {globalRedAnnouncementOverlay}
        {playtimeCountdownOverlay}
        {perfTestOverlay}
        {broadcastPopupOverlay}
        {vaultWordOfDayOverlay}
        {playersOverlay}
        {playerProfileModalView}
        {chatInteractionOverlaysView}
        {definitionOverlaysView}
        {tutorialOverlay}
        {authDialogView}
        {accountMenuView}
        {settingsMenuView}
        {aboutModalView}
        {quickHelpOverlay}
        <ChatReactionToastSatellite />
        <NotificationToastLayer darkMode={menuDarkMode} />
        {globalChatLayer}
        <HomeLobby
          accountLabel={homeAccountLabel}
          accountOnline={isAccountAuthenticated}
          accountNotice={accountNotice}
          canResumeNow={canResumeNow}
          dailyRemainingCount={dailyRemainingCount}
          duelBlueScore={duelBlueScore}
          duelRedScore={duelRedScore}
          homeChatUnreadCount={homeChatUnreadCount}
          homeChatUnreadIsBotOnly={homeChatUnreadIsBotOnly}
          isAuthServerUnavailable={isAuthServerUnavailable}
          isAuthStatusPending={isAuthStatusPending}
          isConnecting={isConnecting}
          loginError={loginError}
          maintenanceMode={homeMaintenanceActive}
          onIntroComplete={handleHomeLobbyIntroComplete}
          displayModeAction={displayMode.homeAction}
          onToggleFullscreen={displayMode.toggleFullscreen}
          {...homeLobbyActions}
          playerTeam={duelTeam}
          playIntro={!homeLobbyIntroPlayedRef.current}
          playersCount={playersCountForLobby}
          resumePhaseLabel={resumePhaseLabel}
          resumeRoomLabel={resumeRoomLabel}
          savedSessionNick={savedSessionNick}
          trainingControl={
            <StandaloneTrainingPicker
              busy={standaloneTrainingController.busy}
              darkMode={menuDarkMode}
              disabled={isAuthStatusPending || isConnecting || homeMaintenanceActive}
              onRequestOpen={() => ensureAuthenticated({ source: "training" })}
              onStart={startStandaloneTrainingFromHome}
              playUiClickSound={playSwipeSound}
              team={duelTeam}
            />
          }
          weeklyRecapLoading={!!duelWeekRecapOpenAfterRefreshRef.current}
        />
      </>
    );

  }

  const shouldMountCelebrationOverlay =
    phase === "playing" &&
    (visualGobbleEnabled || visualPraiseEnabled || visualInvalidWordsEnabled);
  const shouldMountScoreFlightLayer = phase === "playing" && visualScoreFlightsEnabled;
  const praiseOverlay = shouldMountCelebrationOverlay || shouldMountScoreFlightLayer ? (
    <>
      {shouldMountCelebrationOverlay ? (
        <GameCelebrationOverlay
          assetsReady={bootReady}
          hostRef={gridRef}
          isMobileLayout={isMobileLayout}
          liteVisualEffects={preferLiteVisualEffects}
          phase={phase}
        />
      ) : null}
      {shouldMountScoreFlightLayer ? (
        <ScoreFlightSatellite />
      ) : null}
    </>
  ) : null;
  if (showTournamentFinale) {
    return (
      <Suspense fallback={null}>
        <TournamentFinaleScreen
          appearance={{
            assetVersion,
            chatDesktopFontScale,
            darkMode,
            desktopChatFontPx,
            desktopChatInputFontPx,
            desktopChatInputLineHeightPx,
            desktopChatLineHeightPx,
            desktopChatMetaFontPx,
            desktopChatMetaLineHeightPx,
            desktopChatMicroFontPx,
            desktopChatQuickReplyFontPx,
            desktopChatScaleLabel,
            isMobileLayout,
            isSettingsOpen,
          }}
          chat={{
            beginChatEditFromMessage,
            blockedCount,
            chatEditTarget,
            chatInputDisabled,
            chatInputPlaceholder,
            chatInputRef,
            chatInputType,
            chatMessagesUnreadCount,
            chatReplyTarget,
            clearChatEditTarget,
            clearChatReplyTarget,
            deleteOwnChatMessage,
            getLiveNickClassName,
            handleChatDesktopFontScaleChange,
            handleChatInputFocus,
            handleChatInputKeyDown,
            handleDesktopChatScroll,
            lastMessageId,
            openDesktopChatReactionDetails,
            openDesktopChatReactionPicker,
            openUserMenu,
            renderBlockedListPanel,
            safeChatTab,
            scheduleCloseDesktopChatReactionDetails,
            setChatDesktopListNode,
            setChatInput,
            setChatReplyTargetFromMessage,
            setChatTab,
            setIsChatRulesOpen,
            setIsSettingsOpen,
            setShowBlockedList,
            submitChat,
            visibleMessages,
          }}
          finale={{
            FINALE_WEEKLY_BOARDS,
            TOURNAMENT_TOTAL_ROUNDS,
            duelBlueScore,
            duelRedScore,
            finaleBaselineBoards,
            finaleBaselineRankMaps,
            finaleBaselineValueMaps,
            finalePage,
            finaleScrollRef,
            getTournamentPoints,
            gobbleAwardsForLive,
            goToFinalePage,
            handleFinaleTouchEnd,
            handleFinaleTouchMove,
            handleFinaleTouchStart,
            nickDecorationKey,
            renderNickSuffix,
            renderRankDelta,
            renderTournamentTotalRightLabel,
            shiftFinalePage,
            stableCanOpenPlayerProfile,
            stableOpenPlayerProfile,
            tournament,
            tournamentBaselineRef,
            tournamentDuelDeltaRef,
            tournamentFinaleMedals,
            tournamentFinaleSummary,
            tournamentRanking,
            tournamentRef,
          }}
          identity={{ installId, selfNick }}
          overlays={{ aboutModalView, chatOverlays, globalChatLayer, settingsMenuView }}
          weekly={{
            dedupeWeeklyEntries,
            getImageUrl,
            getUserIdFromPlayerProfileTarget,
            isCrownedEntry,
            openDefinition,
            openPlayerProfile,
            renderCrownIcon,
            weeklyBoardData,
            weeklyLimit,
            weeklyStatsError,
            weeklyStatsLoading,
            weeklyVocabSelfRank,
            weeklyVocabLookup,
            weeklyWeekNumber,
          }}
        />
      </Suspense>
    );
  }

  // ========================================================================
  // *** NOUVELLE MISE EN PAGE MOBILE PENDANT LA MANCHE ***
  // ========================================================================

  // === Mise en page mobile dédiée pendant la manche ===
  // ??cran unique : classement + prévisualisation du mot + grille en bas + bouton de chat
  const useUltraCompactLayout = isUltraCompact;
  if (isLoggedIn && appView === "vault") {
    return (
      <>
        {chatOverlays}
        <Suspense fallback={null}>
          <WordVaultPage
            backgroundDesktop={homeBackgroundDesktop}
            backgroundMobile={homeBackgroundMobile}
            darkMode={menuDarkMode}
            loading={wordVault.loading}
            error={wordVault.error}
            words={wordVault.words}
            accountLabel={authState.user?.usernameDisplay || ""}
            standaloneWarning={isIosStandalone}
            sortMode={wordVault.sortMode}
            onSortChange={setWordVaultSortMode}
            onOpenWord={(word) =>
              openDefinition(word, { fromVault: true, preferLongDefinition: true })
            }
            onRetry={() => fetchWordVault()}
            onClose={() => setAppView("live")}
          />
        </Suspense>
      </>
    );
  }
  if (isLoggedIn && appView === "live" && phase === "lobby") {
    return (
      <Suspense fallback={null}>
        <LiveLobbyScreen
          runtime={{
            beginChatEditFromMessage,
            blockedCount,
            blockedEntries,
            chatEditTarget,
            chatInputDisabled,
            chatInputPlaceholder,
            chatInputRef,
            chatMessagesOnly,
            chatOverlays,
            chatReplyTarget,
            clearChatEditTarget,
            clearChatReplyTarget,
            cycleChatHistory,
            darkMode,
            deleteOwnChatMessage,
            devRoundTypes,
            duelTeam,
            getLiveNickClassName,
            getNowServerMs,
            handleChatInputFocus,
            installId,
            mobileChatUnreadCount,
            openPlayersOverlayAlpha,
            openSettingsPanel,
            openUserMenu,
            openWeeklyStatsOverlay,
            openWordVaultPage,
            playersAlphaList,
            returnToLobby,
            roundPreparing,
            selfNick,
            selfReadyForTournament,
            sendChatReaction,
            setChatInput,
            setChatReplyTargetFromMessage,
            setChatTab,
            setIsChatRulesOpen,
            setShowBlockedList,
            setShowBotMessages,
            setTournamentReady,
            showBlockedList,
            showBotMessages,
            signalLivePlayerActivity,
            startTrainingRound,
            submitChat,
            tournamentLobby,
            trainingBusy,
            unblockInstallId,
          }}
        />
      </Suspense>
    );
  }

  if (
    isMobileLayout &&
    useUltraCompactLayout &&
    phase === "playing" &&
    !isSpecial3WordsMode &&
    !standaloneTrainingSession
  ) {
    return (
      <Suspense fallback={null}>
        <MobileUltraCompactScene
          state={{
            board,
            bonusEffectMultiplier,
            bonusLetterKey,
            bonusLetterScore,
            chatViewportHeight,
            countdownLines,
            darkMode,
            gridRotationTurns,
            gridSize,
            hintCellSet,
            hintOutlineCellSet,
            implodeActive,
            isChatClosing,
            isChatOpenMobile,
            isMobileLayout,
            mobileLayoutSizing,
            mobileResultsPhaseFadeOverlay,
            mobileRoundIntroHideTiles,
            mobileRoundIntroOverlay,
            phase,
            rosterConfig: liveRosterConfig,
            roundTilePointsVisible,
            selfNick,
            special3LockedStartTileSet,
            specialSolvedOverlay,
            suppressLiveChatMotion,
            tileColorPreset,
            tileMaterialClass,
            usedSet,
          }}
          refs={{
            chatBodyLockHeightRef,
            gameViewportFreezeHeightRef,
            gridInputControllerRef,
            gridRef,
            mobileGameViewportLockRef,
            tileRefs,
          }}
          actions={{
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            handleTouchEnd,
            handleTouchMove,
            handleTouchStart,
            normalizeLetterKey,
            openSettingsPanel,
          }}
          content={{ chatOverlays, globalChatLayer, praiseOverlay }}
          config={{
            BONUS_CLASSES,
            MOBILE_GRID_MAX_WIDTH,
            defaultTileBaseClass,
            lightGridSurfaceStyle,
            specialIndicatorPreset,
          }}
        />
      </Suspense>
    );
  }

  if (isMobileLayout && phase === "playing" && isSpecial3WordsMode) {
    return (
      <Suspense fallback={null}>
        <MobileSpecial3Scene
          state={{
            allSoundOn,
            boardForRender,
            bonusEffectMultiplier,
            bonusLetterKey,
            bonusLetterScore,
            dailyInvalidPulseKey,
            dailyInvalidSlot,
            dailyLiveWordBlockedReason,
            dailyLiveWordNorm,
            dailyLiveWordScore,
            dailyLiveWordValid,
            dailyLockPulseKey,
            dailySpecialPlacements,
            dailyTotalScore,
            dailyWordSlotsScored,
            darkMode,
            gridRotationTurns,
            gridSize,
            highlightPath,
            hintCellSet,
            hintOutlineCellSet,
            implodeActive,
            isChatClosing,
            isChatOpenMobile,
            isDailyPlay,
            isLoggedIn,
            isMobileLayout,
            liveWord,
            mobileChatUnreadCount,
            mobileChatUnreadIsBotOnly,
            mobileLayoutSizing,
            mobileResultsPhaseFadeOverlay,
            mobileRoundIntroHideTiles,
            mobileRoundIntroOverlay,
            phase,
            safeDailySlotIndex,
            serverRoundDurationMs,
            special3DragGhost,
            special3InGameTutorialCard,
            special3LockedStartTileSet,
            special3MobileStep1Ghost,
            special3MobileStep2TutorialOverlay,
            special3TutorialStep,
            specialSolvedOverlay,
            standaloneTrainingSession,
            suppressLiveChatMotion,
            tileColorPreset,
            tileMaterialClass,
            usedSet,
            visualScreenShakeEnabled,
          }}
          refs={{
            chatBodyLockHeightRef,
            gridInputControllerRef,
            gridRef,
            mobileGameViewportLockRef,
            mobileSpecial3BonusTrayRef,
            mobileSpecial3FirstSlotRef,
            mobileSpecial3GridWrapRef,
            mobileSpecial3SecondSlotRef,
            mobileSpecial3TutorialHostRef,
            tileRefs,
          }}
          actions={{
            beginDailySpecialDrag,
            clearDailyWordSlot,
            getBonusBadgeClass,
            getBonusLetterRingClass,
            getDailyActiveSlotIndex,
            getLiveNickClassName,
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            handleTouchEnd,
            handleTouchMove,
            handleTouchStart,
            normalizeLetterKey,
            openSettingsPanel,
            renderSpecial3LengthGobbleBadge,
            requestOpenChat,
            resolveSpecial3LiveTrace,
            setDailyActiveSlot,
            submitDailyScore,
            toggleDarkModeQuick,
            toggleSoundQuick,
          }}
          content={{ chatOverlays, globalChatLayer, praiseOverlay, trainingSessionControls }}
          config={{
            BONUS_CLASSES,
            MOBILE_GRID_MAX_WIDTH,
            defaultTileBaseClass,
            lightGridSurfaceStyle,
            roundTilePointsVisible,
            specialIndicatorPreset,
          }}
        />
      </Suspense>
    );
  }

  if (isMobileLayout && (phase === "playing" || phase === "results")) {
    return (
      <Suspense fallback={null}>
        <MobileStandardScene
          state={{
            activeRoom,
            allSoundOn,
            allWords,
            analysis,
            assetVersion,
            boardForRender,
            bonusEffectMultiplier,
            bonusLetterKey,
            bonusLetterScore,
            chatInputDisabled,
            chatInputPlaceholder,
            chatViewportHeight,
            countdownLines,
            darkMode,
            devRoundTypes,
            displayList,
            duelTeam,
            endStats,
            finalRanking,
            foundDotStyle,
            foundWordsCount,
            gobbleAwardsForLive,
            gridRotationTurns,
            gridSize,
            guidedResultsEligible,
            guidedResultsStep,
            guidedWordTarget,
            highlightPlayers,
            hintCellOverlayStyleMap,
            hintCellSet,
            hintCellStyleMap,
            hintOutlineCellSet,
            hintOutlineOverlayStyleMap,
            hintOutlineStyleMap,
            implodeActive,
            installId,
            isChatClosing,
            isChatOpenMobile,
            isDailyPlay,
            isFinaleBanner,
            isMobileLayout,
            isOcidRound,
            isSpeedRound,
            isTargetRound,
            liveWord,
            liveWordTiles,
            mobileLayoutSizing,
            mobileResultPages,
            mobileResultsPage,
            mobileResultsPhaseFadeOverlay,
            mobileRoundIntroHideTiles,
            mobileRoundIntroOverlay,
            nextHintLabel,
            nickDecorationKey,
            ocidProposal,
            ocidProposalSubmitted,
            ocidSelectedOptionId,
            ocidStatusMessage,
            ocidVote,
            phase,
            rosterConfig: liveRosterConfig,
            recordBadgesByNickForRound,
            resultsRankingMode,
            resultsReorderTick,
            resultsSlidePhase,
            roundPreparing,
            roundStats,
            roundTilePointsVisible,
            selfNick,
            shouldDefinitionBlink,
            showAllWords,
            showHelp,
            showOfflineResultsLabel,
            showPreviewStats,
            showSolvedTargetLoupe,
            solvedTargetWord,
            special3LockedStartTileSet,
            specialHint,
            specialHintDisplay,
            specialRound,
            specialSolvedOverlay,
            standaloneTrainingSession,
            suppressLiveChatMotion,
            suppressWordListScores,
            targetScoreMax,
            targetSummary,
            targetWaitDevActive,
            targetWaitDevSessionState,
            tileColorPreset,
            tileMaterialClass,
            totalScoreLabel,
            totalWordsLabel,
            tournament,
            tournamentLobby,
            tournamentRanking,
            trainingBusy,
            usedSet,
            visibleMessages,
            vocabLevelUp,
          }}
          refs={{
            chatBodyLockHeightRef,
            gridInputControllerRef,
            gridRef,
            listItemRefs,
            mobileGameViewportLockRef,
            mobileHeaderRef,
            mobileRankingRef,
            tileRefs,
          }}
          actions={{
            analyzeWord,
            getLiveNickClassName,
            getLivePreviewLabelForCell,
            getNowServerMs,
            getRoundRecordsForPlayer,
            goToResultsPage,
            handleChatInputFocus,
            handleClearOcidProposal,
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            handleOcidProposalChange,
            handleResultsTouchEnd,
            handleResultsTouchMove,
            handleResultsTouchStart,
            handleTouchEnd,
            handleTouchMove,
            handleTouchStart,
            normalizeLetterKey,
            openDefinition,
            openPlayersOverlaySnapshot,
            openRoundPlayerModal,
            openSettingsPanel,
            openWordInfoModal,
            renderDesktopResultsDockPanel,
            renderGobbleCandidate,
            renderMobileNickSuffix,
            renderNickSuffix,
            renderRankDelta,
            renderVocabPanel,
            rotateGridClockwise,
            setAnalysis,
            setChatInput,
            setGuidedResultsStep,
            setHighlightPath,
            setHighlightPlayers,
            setShowHelp,
            setTargetWaitDevGridHost,
            setTargetWaitDevSideHost,
            setTournamentReady,
            stableCanOpenPlayerProfile,
            stableOpenPlayerProfile,
            startTrainingRound,
            submitChat,
            submitOcidProposal,
            submitOcidVote,
            toggleDarkModeQuick,
            toggleSoundQuick,
          }}
          content={{
            chatOverlays,
            globalChatLayer,
            ocidMobileResultOverlay,
            praiseOverlay,
            roundPreparationOverlay,
            trainingSessionControls,
          }}
          config={{
            BONUS_CLASSES,
            DARK_WORD_INACTIVE,
            GUIDED_RESULTS_STEPS,
            MOBILE_GRID_MAX_WIDTH,
            WORDS_SCROLL_MAX_HEIGHT,
            defaultTileBaseClass,
            lightGridSurfaceStyle,
            specialIndicatorPreset,
          }}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <DesktopGameScene
        runtime={{
            activeRoom,
            allSoundOn,
            allWords,
            analysis,
            appView,
            assetVersion,
            blockedCount,
            blockedEntries,
            boardForRender,
            BONUS_CLASSES,
            bonusEffectMultiplier,
            bonusLetterKey,
            bonusLetterScore,
            canOpenPlayerProfile,
            canOpenRoundPlayerDetails,
            chatBlockClasses,
            chatDesktopFontScale,
            chatEditTarget,
            chatInputDisabled,
            chatInputPlaceholder,
            chatInputRef,
            chatMessagesUnreadCount,
            chatOverlays,
            chatReplyTarget,
            clearDailyWordSlot,
            COLUMN_HEIGHT_STYLE,
            computedGridWidth,
            connectionError,
            countdownBarHeightPx,
            countdownLines,
            DAILY_DESKTOP_COLUMN_TEMPLATE,
            dailyInvalidPulseKey,
            dailyInvalidSlot,
            dailyTotalScore,
            DARK_WORD_INACTIVE,
            darkMode,
            defaultTileBaseClass,
            DESKTOP_MAIN_GRID_MIN_HEIGHT,
            desktopChatActionsRef,
            desktopChatFontPx,
            desktopChatHelpersRef,
            desktopChatInputFontPx,
            desktopChatInputLineHeightPx,
            desktopChatLineHeightPx,
            desktopChatMetaFontPx,
            desktopChatMetaLineHeightPx,
            desktopChatMicroFontPx,
            desktopChatQuickReplyFontPx,
            desktopChatScaleLabel,
            desktopChatUiScale,
            desktopColumnDragId,
            desktopColumnHandleLayout,
            desktopColumnOrderIndexById,
            desktopColumnResizeActiveIndex,
            desktopGridMetrics,
            desktopGridUiScale,
            desktopMainGridHeight,
            desktopPlayersUiScale,
            desktopResponsiveColumnFractions,
            desktopResultsDrawerLayout,
            desktopResultsSummaryExpanded,
            desktopSideUiScale,
            desktopUiScale,
            desktopViewportResizeInProgress,
            devRoundTypes,
            displayList,
            duelStatus,
            duelTeam,
            finalRanking,
            gameBlockClasses,
            getLiveNickClassName,
            getLivePreviewLabelForCell,
            getNowServerMs,
            getUserIdFromPlayerProfileTarget,
            gobbleAwardsForLive,
            gobbleBadgeUrl,
            gobbleCandidates,
            GRID_COL_TEMPLATE,
            gridInputControllerRef,
            gridRef,
            gridRotationTurns,
            gridSize,
            handleChatInputFocus,
            handleClearOcidProposal,
            handleDesktopWordAnalysisClear,
            handleDesktopWordAnalyze,
            handleDesktopWordDefinitionOpen,
            handleOcidProposalChange,
            hasDesktopResultsSummary,
            highlightPlayers,
            hintCellOverlayStyleMap,
            hintCellSet,
            hintCellStyleMap,
            hintOutlineCellSet,
            hintOutlineOverlayStyleMap,
            hintOutlineStyleMap,
            hoveredResultsWordSet,
            implodeActive,
            installId,
            isCompactDesktopGridLayout,
            isDailyPlay,
            isDesktopEmojiPickerOpen,
            isFinaleBanner,
            isInGameSpecial3Tutorial,
            isLoggedIn,
            isMobileLayout,
            isOcidRound,
            isSpecial3WordsMode,
            isSquareMaterial,
            isTargetRound,
            isWeeklyOpen,
            lastMessageId,
            lightGridSurfaceStyle,
            lightPanelStyle,
            listItemRefs,
            MAIN_GRID_HEIGHT,
            mainGridDesktopRef,
            mobileRoundIntroHideTiles,
            mobileRoundIntroOverlay,
            nextHintLabel,
            nickDecorationKey,
            normalizeLetterKey,
            ocidDefinitionText,
            ocidProposal,
            ocidProposalSubmitted,
            ocidSelectedOptionId,
            ocidStatusMessage,
            ocidSummary,
            ocidVote,
            openDefinition,
            openPlayerProfile,
            openRoundPlayerModal,
            openWeeklyStatsOverlay,
            phase,
            playColumnRef,
            praiseOverlay,
            prepareWordListFlip,
            previewBarMinHeight,
            previewTileStyle,
            quickHelpOverlay,
            rosterConfig: liveRosterConfig,
            recordBadgesByNickForRound,
            renderDesktopColumnHandle,
            renderDesktopResultsDockPanel,
            renderMedals,
            renderNickSuffix,
            renderRankDelta,
            renderSpecial3BonusChipButton,
            renderSpecial3LengthGobbleBadge,
            renderSpecial3PreviewTiles,
            resolveSpecial3LiveTrace,
            resultsPathGradientIdRef,
            resultsPathPreview,
            resultsRankingList,
            resultsRankingMode,
            resultsReorderTick,
            rotateGridClockwise,
            roundPreparationOverlay,
            roundPreparing,
            roundStats,
            roundTilePointsVisible,
            safeChatTab,
            selfNick,
            selfOcidBluffPanelText,
            selfOcidBluffPoints,
            selfOcidDetail,
            selfOcidExternalVotedAuthors,
            selfOcidGiftDetail,
            selfOcidOwnWrongVoteMessage,
            selfOcidSubmittedWord,
            selfOcidTargetDetail,
            selfOcidVoteDetail,
            selfOcidVoteOption,
            selfOcidVoters,
            selfReadyForTournament,
            serverStatus,
            setActiveArea,
            setChatDesktopListNode,
            setChatInput,
            setDailyActiveSlot,
            setDesktopChatColumnNode,
            setDesktopColumnNode,
            setDesktopGridStageNode,
            setDesktopResultsSummaryExpanded,
            setDuelPopupState,
            setHoveredResultsNick,
            setIsSettingsOpen,
            setResultsRankingModeWithPulse,
            setShowAllWords,
            setShowBotMessages,
            setTargetWaitDevGridHost,
            setTargetWaitDevSideHost,
            setTournamentReady,
            shouldDefinitionBlink,
            showAllWords,
            showBlockedList,
            showBotMessages,
            showPreviewStats,
            showResultsWordPath,
            showSolvedTargetLoupe,
            solvedTargetWord,
            special3ActiveSlotIndex,
            special3DesktopStep2TutorialOverlay,
            special3DragGhost,
            special3InGameTutorialCard,
            special3LockedStartTileSet,
            special3Slots,
            special3TutorialStep,
            specialHint,
            specialHintDisplay,
            specialIndicatorPreset,
            specialRound,
            specialSolvedOverlay,
            stableCanOpenPlayerProfile,
            stableOpenPlayerProfile,
            standaloneTrainingSession,
            startDesktopColumnResize,
            startTrainingRound,
            submitChat,
            submitDailyScore,
            submitOcidProposal,
            submitOcidVote,
            suppressWordListScores,
            targetWaitDevActive,
            targetWaitDevSessionState,
            tileColorPreset,
            tileFontPx,
            tileGapPx,
            tileMaterialClass,
            tileMaterialPreset,
            tileRefs,
            tileSizePx,
            toggleDarkModeQuick,
            toggleSoundQuick,
            totalScoreLabel,
            totalWordsLabel,
            tournament,
            tournamentLobby,
            tournamentRanking,
            trainingBusy,
            trainingSessionControls,
            usedSet,
            validationBarHeightPx,
            validationBarPaddingPx,
            visibleMessages,
            visiblePlayerList,
            visualScreenShakeEnabled,
            weeklyOverlayStyle,
            weeklyStatsPage,
            WORDS_SCROLL_MAX_HEIGHT,
        }}
      />
    </Suspense>
  );
}
