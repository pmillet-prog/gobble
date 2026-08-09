import React from "react";
import SettingsMenuFrame from "./SettingsMenuFrame.jsx";
import SettingsPanelHost from "./SettingsPanelHost.jsx";
import { FacebookLogo } from "../FacebookGroupInviteModal.jsx";
import { openFacebookGroup } from "../../utils/facebookGroup.js";

const PLAYTIME_MIN_MS = 5 * 60 * 1000;
const PLAYTIME_HOUR_OPTIONS = Array.from({ length: 13 }, (_, value) => value);
const PLAYTIME_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5);
const PLAYTIME_PRESET_MINUTES = [5, 15, 30, 60, 120];
const PLAYTIME_ROLL_DURATION_MS = 2000;
const PLAYTIME_MULTI_ROLL_DURATION_MS = 1000;

function clampOptionValue(options, value) {
  if (!Array.isArray(options) || !options.length) return 0;
  const safeValue = Number(value);
  if (options.includes(safeValue)) return safeValue;
  return options.reduce((best, item) =>
    Math.abs(item - safeValue) < Math.abs(best - safeValue) ? item : best
  );
}

function shiftOptionValue(options, value, delta) {
  if (!Array.isArray(options) || !options.length) return 0;
  const current = clampOptionValue(options, value);
  const index = options.indexOf(current);
  const nextIndex = Math.min(options.length - 1, Math.max(0, index + delta));
  return options[nextIndex];
}

function getOptionIndex(options, value) {
  if (!Array.isArray(options) || !options.length) return -1;
  return options.indexOf(clampOptionValue(options, value));
}

function buildPlaytimeRollSegments(steps, totalMs = PLAYTIME_ROLL_DURATION_MS) {
  const safeSteps = Math.max(0, Math.round(Number(steps) || 0));
  if (safeSteps <= 0) return [];
  if (safeSteps <= 3) {
    const durationMs = Math.max(140, Math.round(totalMs / safeSteps));
    return Array.from({ length: safeSteps }, (_, index) => ({
      delayMs: index * durationMs,
      durationMs,
    }));
  }

  const center = (safeSteps - 1) / 2;
  const weights = Array.from({ length: safeSteps }, (_, index) => {
    const edgeFactor = center > 0 ? Math.abs(index - center) / center : 0;
    return 0.65 + edgeFactor * 0.85;
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
  let elapsed = 0;
  return weights.map((weight, index) => {
    const remainingSteps = safeSteps - index;
    const remainingMs = Math.max(0, totalMs - elapsed);
    const rawDuration = Math.round((totalMs * weight) / weightTotal);
    const durationMs =
      index === safeSteps - 1
        ? remainingMs
        : Math.max(120, Math.min(rawDuration, remainingMs - (remainingSteps - 1) * 120));
    const segment = { delayMs: elapsed, durationMs };
    elapsed += durationMs;
    return segment;
  });
}

function SettingsMenu(props) {
  const {
    ACCOUNT_SERVER_BUSY_MESSAGE,
    AUTH_MODAL_MODES,
    BONUS_CLASSES,
    GridTileLetter,
    MOBILE_GRID_MAX_WIDTH,
    MobileGrid,
    SOUND_MASTER_VOLUME_DEFAULT,
    TILE_LETTER_SCALE_DEFAULT,
    TILE_LETTER_SCALE_MAX,
    TILE_LETTER_SCALE_MIN,
    allSoundOn,
    allVisualOn,
    ambientOn,
    applyModerationAction,
    applyThemeDraftCategory,
    applyThemeVisualState,
    authState,
    buildThemeDraftWithOption,
    canVibrate,
    clearDevChat,
    closeDevMenu,
    closeKeyboardMenu,
    closeModerationMenu,
    closeSettingsMenu,
    closeSoundMenu,
    closeThemeMenu,
    closeVisualMenu,
    computeThemeApplyMeta,
    confirmThemePurchase,
    darkMode,
    defaultTileBaseClass,
    chatBotVisibility,
    chatBotVisibilityOptions,
    devAccountAllowed,
    devAccountLabel,
    devBots,
    devControls,
    devControlsAvailable,
    devControlsBusy,
    devControlsLocked,
    devError,
    devMenuUnlocked,
    devPassword,
    devPasswordConfigured,
    devPasswordRequired,
    devPlaytimeLimits = [],
    devRoundTypes,
    targetWaitDevActive,
    targetWaitDevArmed,
    enabledSoundCount,
    enabledVisualCount,
    fetchDevBots,
    fetchDevPlaytimeLimits,
    fetchModerationState,
    fillDevChat,
    getBonusBadgeClass,
    getBonusLetterRingClass,
    getThemeUnlockItemKey,
    getTileColorSwatchStyle,
    getTileColorTextureStyle,
    gobblarsBadgeUrl,
    gobblarsBalance,
    handleAccountLogout,
    handleSettingsTitleDevTap,
    handleThemeAction,
    handleThemeOptionBuy,
    isAccountAuthenticated,
    isAuthServerUnavailable,
    isAuthStatusPending,
    isConnecting,
    isDevMenuOpen,
    isKeyboardMenuOpen,
    isMobileLayout,
    isModerationMenuOpen,
    isOpen,
    isSoundMenuOpen,
    isThemeMenuOpen,
    isThemeOptionLockableGlobal,
    isThemeOptionUnlocked,
    isVibrationEnabled,
    isVisualMenuOpen,
    keyboardRecallSubmittedWord,
    legacyProfileUsername,
    lockDevControls,
    menuDarkMode,
    moderationAccountLabel,
    moderationAvailable,
    moderationBusy,
    moderationError,
    moderationPlayers,
    normalizeBonusLabel,
    normalizeLetterKey,
    normalizeSoundMasterVolume,
    normalizeThemePreset,
    normalizeTileLetterScale,
    openAuthDialog,
    openDevMenu,
    openTargetWaitDevPlayground,
    openKeyboardMenu,
    openModerationMenu,
    openSoundMenu,
    openThemeMenu,
    openVisualMenu,
    openTutorialFromHome,
    patchDevControls,
    perfTestEnabled,
    playUiClickSound,
    playtimeLimit,
    playtimeRemainingMs,
    refreshAuthStatus,
    requestThemeResetDefault,
    returnToLobby,
    returnToLiveLobbyDev,
    sendDevGlobalAnnouncement,
    setPlaytimeLimitFromSettings,
    clearDevPlaytimeLimit,
    setAllSoundEnabled,
    setAllVisualEnabled,
    setDevPassword,
    setIsAboutOpen,
    setIsAmbientMuted,
    setIsSettingsOpen,
    setIsVibrationEnabled,
    setKeyboardRecallSubmittedWord,
    setPerfTestEnabled,
    setShowHelp,
    setSoundGobbleEnabled,
    setSoundInvalidErrorEnabled,
    setSoundMasterVolume,
    setSoundTileStepEnabled,
    setSoundTimerEnabled,
    setSoundValidationEnabled,
    setThemeApplied,
    setThemeDraft,
    setThemeLastChangedCategory,
    setThemePickerCategory,
    setThemePurchaseConfirm,
    setTilePointsVisible,
    setVisualConfettiEnabled,
    setVisualGoldNickFxEnabled,
    setVisualGobbleEnabled,
    setVisualInvalidWordsEnabled,
    setVisualPraiseEnabled,
    setVisualScoreFlightsEnabled,
    setVisualScreenShakeEnabled,
    setAllDevBotsActive,
    setChatBotVisibility,
    setDevBotActive,
    showDevDuelWeekRecap,
    soundGobbleEnabled,
    soundInvalidErrorEnabled,
    soundMasterVolume,
    soundTileStepEnabled,
    soundTimerEnabled,
    soundValidationEnabled,
    themeApplying,
    themeCategoryLabel,
    themeControlButtons,
    themeDraftSafe,
    themeFullActionLabel,
    themeFullApplyMeta,
    themeFullChangedSummary,
    themeLastCategoryLabel,
    themePickerCategory,
    themePickerCurrentValue,
    themePickerOptions,
    themePickerTitle,
    themePickerViewMode,
    themePreviewBackgroundStyle,
    themePreviewCells,
    themePreviewEmptySet,
    themePreviewGap,
    themePreviewGridRef,
    themePreviewIsSquare,
    themePreviewMaterialClass,
    themePreviewMobileGapPx,
    themePreviewMobileGridSide,
    themePreviewMobileTileFontPx,
    themePreviewNoop,
    themePreviewPadding,
    themePreviewTileColor,
    themePreviewTileRefs,
    themePreviewUseBadge,
    themePreviewUseFill,
    themePreviewUseRing,
    themePurchaseConfirm,
    themeRecentlyUnlocked,
    themeUnlockAnimToken,
    tileLetterColorValue,
    tilePointsVisible,
    tileScore,
    unlockDevControls,
    vibrationOn,
    visualConfettiEnabled,
    visualGoldNickFxEnabled,
    visualGobbleEnabled,
    visualInvalidWordsEnabled,
    visualPraiseEnabled,
    visualScoreFlightsEnabled,
    visualScreenShakeEnabled,
  } = props;

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
  const [isGeneralMenuOpen, setIsGeneralMenuOpen] = React.useState(false);
  const [isBotsMenuOpen, setIsBotsMenuOpen] = React.useState(false);
  const [playtimeHours, setPlaytimeHours] = React.useState(1);
  const [playtimeMinutes, setPlaytimeMinutes] = React.useState(0);
  const [playtimeConfirmOpen, setPlaytimeConfirmOpen] = React.useState(false);
  const [playtimeWheelAnimation, setPlaytimeWheelAnimation] = React.useState({
    hours: { token: 0, direction: 0, durationMs: PLAYTIME_ROLL_DURATION_MS },
    minutes: { token: 0, direction: 0, durationMs: PLAYTIME_ROLL_DURATION_MS },
  });
  const playtimeRollTimersRef = React.useRef([]);
  const playtimeRollSequenceRef = React.useRef(0);
  const playtimeLimitActive = !!playtimeLimit?.active;
  const playtimeMinuteOptions =
    Number(playtimeHours) >= 12 ? [0] : PLAYTIME_MINUTE_OPTIONS;
  const selectedPlaytimeMs =
    (Math.max(0, Number(playtimeHours) || 0) * 60 + Math.max(0, Number(playtimeMinutes) || 0)) *
    60 *
    1000;
  const formatPlaytimeMs = (value) => {
    if (!Number.isFinite(Number(value))) return "--";
    const total = Math.max(0, Math.ceil(Number(value) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };
  const clearPlaytimeRollTimers = React.useCallback(() => {
    playtimeRollSequenceRef.current += 1;
    for (const timerId of playtimeRollTimersRef.current) {
      clearTimeout(timerId);
    }
    playtimeRollTimersRef.current = [];
  }, []);
  React.useEffect(() => {
    if (!isGeneralMenuOpen) setIsBotsMenuOpen(false);
  }, [isGeneralMenuOpen]);
  React.useEffect(() => clearPlaytimeRollTimers, [clearPlaytimeRollTimers]);
  const playPlaytimeRollClick = React.useCallback(() => {
    if (typeof playUiClickSound === "function") playUiClickSound();
  }, [playUiClickSound]);
  const triggerPlaytimeWheelAnimation = React.useCallback((column, direction, durationMs = PLAYTIME_ROLL_DURATION_MS) => {
    if (direction === 0) return;
    setPlaytimeWheelAnimation((prev) => {
      const previous = prev[column] || {
        token: 0,
        direction: 0,
        durationMs: PLAYTIME_ROLL_DURATION_MS,
      };
      return {
        ...prev,
        [column]: {
          token: previous.token + 1,
          direction: direction > 0 ? 1 : -1,
          durationMs: Math.max(120, Math.round(Number(durationMs) || PLAYTIME_ROLL_DURATION_MS)),
        },
      };
    });
  }, []);
  const setPlaytimeFromTotalMinutes = React.useCallback(
    (totalMinutes) => {
      const safeTotal = Math.max(0, Math.min(12 * 60, Number(totalMinutes) || 0));
      const nextHours = Math.floor(safeTotal / 60);
      const nextMinutes = clampOptionValue(PLAYTIME_MINUTE_OPTIONS, safeTotal % 60);
      const currentHourIndex = getOptionIndex(PLAYTIME_HOUR_OPTIONS, playtimeHours);
      const targetHourIndex = getOptionIndex(PLAYTIME_HOUR_OPTIONS, nextHours);
      const currentMinuteIndex = getOptionIndex(PLAYTIME_MINUTE_OPTIONS, playtimeMinutes);
      const targetMinuteIndex = getOptionIndex(PLAYTIME_MINUTE_OPTIONS, nextMinutes);
      const hourDelta = targetHourIndex - currentHourIndex;
      const minuteDelta = targetMinuteIndex - currentMinuteIndex;
      const hourSteps = Math.abs(hourDelta);
      const minuteSteps = Math.abs(minuteDelta);
      clearPlaytimeRollTimers();
      if (hourSteps <= 0 && minuteSteps <= 0) return;

      const hourDirection = Math.sign(hourDelta);
      const minuteDirection = Math.sign(minuteDelta);
      const totalRollDurationMs =
        Math.max(hourSteps, minuteSteps) > 1
          ? PLAYTIME_MULTI_ROLL_DURATION_MS
          : PLAYTIME_ROLL_DURATION_MS;
      const sequenceId = playtimeRollSequenceRef.current;

      const scheduleColumnRoll = ({
        column,
        steps,
        direction,
        options,
        currentIndex,
        setValue,
      }) => {
        if (!steps || !direction || currentIndex < 0) return;
        const segments = buildPlaytimeRollSegments(steps, totalRollDurationMs);
        for (let step = 1; step <= steps; step += 1) {
          const segment = segments[step - 1] || {
            delayMs: Math.round(((step - 1) * totalRollDurationMs) / steps),
            durationMs: Math.max(140, Math.round(totalRollDurationMs / steps)),
          };
          const timerId = setTimeout(() => {
            if (playtimeRollSequenceRef.current !== sequenceId) return;
            const value = options[currentIndex + direction * step];
            if (typeof value === "undefined") return;
            triggerPlaytimeWheelAnimation(column, direction, segment.durationMs);
            setValue(value);
            playPlaytimeRollClick();
          }, Math.round(segment.delayMs));
          playtimeRollTimersRef.current.push(timerId);
        }
      };

      scheduleColumnRoll({
        column: "hours",
        steps: hourSteps,
        direction: hourDirection,
        options: PLAYTIME_HOUR_OPTIONS,
        currentIndex: currentHourIndex,
        setValue: setPlaytimeHours,
      });
      scheduleColumnRoll({
        column: "minutes",
        steps: minuteSteps,
        direction: minuteDirection,
        options: PLAYTIME_MINUTE_OPTIONS,
        currentIndex: currentMinuteIndex,
        setValue: setPlaytimeMinutes,
      });
      const cleanupTimerId = setTimeout(() => {
        if (playtimeRollSequenceRef.current !== sequenceId) return;
        setPlaytimeHours(nextHours);
        setPlaytimeMinutes(nextMinutes);
      }, totalRollDurationMs + 40);
      playtimeRollTimersRef.current.push(cleanupTimerId);
    },
    [
      clearPlaytimeRollTimers,
      playPlaytimeRollClick,
      playtimeHours,
      playtimeMinutes,
      triggerPlaytimeWheelAnimation,
    ]
  );
  const shiftPlaytimeHours = React.useCallback((delta) => {
    clearPlaytimeRollTimers();
    const current = clampOptionValue(PLAYTIME_HOUR_OPTIONS, playtimeHours);
    const next = shiftOptionValue(PLAYTIME_HOUR_OPTIONS, current, delta);
    if (next === current) return;
    triggerPlaytimeWheelAnimation("hours", delta, PLAYTIME_ROLL_DURATION_MS);
    if (next >= 12 && playtimeMinutes !== 0) {
      triggerPlaytimeWheelAnimation("minutes", -1, PLAYTIME_ROLL_DURATION_MS);
      setPlaytimeMinutes(0);
    }
    setPlaytimeHours(next);
    playPlaytimeRollClick();
  }, [
    clearPlaytimeRollTimers,
    playPlaytimeRollClick,
    playtimeHours,
    playtimeMinutes,
    triggerPlaytimeWheelAnimation,
  ]);
  const shiftPlaytimeMinutes = React.useCallback((delta) => {
    clearPlaytimeRollTimers();
    const current = clampOptionValue(playtimeMinuteOptions, playtimeMinutes);
    const next = shiftOptionValue(playtimeMinuteOptions, current, delta);
    if (next === current) return;
    triggerPlaytimeWheelAnimation("minutes", delta, PLAYTIME_ROLL_DURATION_MS);
    setPlaytimeMinutes(next);
    playPlaytimeRollClick();
  }, [
    clearPlaytimeRollTimers,
    playPlaytimeRollClick,
    playtimeMinuteOptions,
    playtimeMinutes,
    triggerPlaytimeWheelAnimation,
  ]);
  const renderPlaytimeWheelColumn = ({
    animation,
    label,
    value,
    options,
    formatValue,
    onShift,
  }) => {
    const current = clampOptionValue(options, value);
    const index = options.indexOf(current);
    const previous = index > 0 ? options[index - 1] : null;
    const next = index >= 0 && index < options.length - 1 ? options[index + 1] : null;
    const rollClass =
      animation?.direction > 0
        ? "playtime-roll-reel playtime-roll-up"
        : animation?.direction < 0
          ? "playtime-roll-reel playtime-roll-down"
          : "playtime-roll-reel";
    const rollDurationMs = Math.max(
      120,
      Math.round(Number(animation?.durationMs) || PLAYTIME_ROLL_DURATION_MS)
    );
    const handleWheelPointerDown = (event) => {
      if (event.pointerType === "mouse") return;
      const target = event.currentTarget;
      target.dataset.playtimeStartX = String(event.clientX);
      target.dataset.playtimeStartY = String(event.clientY);
      target.dataset.playtimeSwiped = "";
      target.setPointerCapture?.(event.pointerId);
    };
    const handleWheelPointerMove = (event) => {
      if (event.pointerType === "mouse") return;
      const target = event.currentTarget;
      const startY = Number(target.dataset.playtimeStartY);
      if (!Number.isFinite(startY)) return;
      if (Math.abs(event.clientY - startY) > 8) {
        event.preventDefault();
      }
    };
    const handleWheelPointerUp = (event) => {
      if (event.pointerType === "mouse") return;
      const target = event.currentTarget;
      const startX = Number(target.dataset.playtimeStartX);
      const startY = Number(target.dataset.playtimeStartY);
      delete target.dataset.playtimeStartX;
      delete target.dataset.playtimeStartY;
      target.releasePointerCapture?.(event.pointerId);
      if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dy) < 28 || Math.abs(dy) < Math.abs(dx) * 1.15) return;

      target.dataset.playtimeSwiped = "1";
      onShift(dy < 0 ? 1 : -1);
    };
    const clearWheelPointerState = (event) => {
      const target = event.currentTarget;
      delete target.dataset.playtimeStartX;
      delete target.dataset.playtimeStartY;
      target.releasePointerCapture?.(event.pointerId);
    };
    const preventSyntheticClickAfterSwipe = (event) => {
      if (event.currentTarget.dataset.playtimeSwiped !== "1") return;
      delete event.currentTarget.dataset.playtimeSwiped;
      event.preventDefault();
      event.stopPropagation();
    };
    return (
      <div className="min-w-0 rounded-2xl border border-amber-300/40 bg-slate-950/25 px-2 py-2 text-center shadow-inner">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
          {label}
        </div>
        <button
          type="button"
          disabled={previous === null}
          onClick={() => onShift(-1)}
          className="mt-1 inline-flex h-7 w-full items-center justify-center rounded-xl border border-amber-300/25 bg-white/5 disabled:opacity-25"
          aria-label={`Réduire ${label}`}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">
            keyboard_arrow_up
          </span>
        </button>
        <div
          className="relative mt-1 h-24 overflow-hidden rounded-xl border border-amber-300/25 bg-black/20"
          style={{ touchAction: "none" }}
          onPointerDown={handleWheelPointerDown}
          onPointerMove={handleWheelPointerMove}
          onPointerUp={handleWheelPointerUp}
          onPointerCancel={clearWheelPointerState}
          onClickCapture={preventSyntheticClickAfterSwipe}
        >
          <div className="pointer-events-none absolute inset-0 z-[1] grid h-full grid-rows-[1fr_1.45fr_1fr]">
            <div />
            <div className="border-y border-amber-300/30 bg-amber-200/15" />
            <div />
          </div>
          <div
            key={`${label}-${animation?.token || 0}`}
            className={`relative z-[2] grid h-full grid-rows-[1fr_1.45fr_1fr] ${rollClass}`}
            style={{
              "--playtime-roll-duration": `${rollDurationMs}ms`,
              animationDuration: `${rollDurationMs}ms`,
            }}
          >
            <button
              type="button"
              disabled={previous === null}
              onClick={() => onShift(-1)}
              className="flex items-center justify-center text-sm font-bold opacity-45 disabled:opacity-20"
            >
              {previous === null ? "--" : formatValue(previous)}
            </button>
            <div className="flex items-center justify-center text-3xl font-black tabular-nums">
              {formatValue(current)}
            </div>
            <button
              type="button"
              disabled={next === null}
              onClick={() => onShift(1)}
              className="flex items-center justify-center text-sm font-bold opacity-45 disabled:opacity-20"
            >
              {next === null ? "--" : formatValue(next)}
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={next === null}
          onClick={() => onShift(1)}
          className="mt-1 inline-flex h-7 w-full items-center justify-center rounded-xl border border-amber-300/25 bg-white/5 disabled:opacity-25"
          aria-label={`Augmenter ${label}`}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">
            keyboard_arrow_down
          </span>
        </button>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <SettingsMenuFrame
      onClose={() => closeSettingsMenu({ animatePanels: true })}
    >
      <div
        className={`relative w-full max-w-xs rounded-2xl border-2 p-4 shadow-2xl ${settingsShellClass}`}
      >
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            className="text-sm font-extrabold text-left"
            onClick={handleSettingsTitleDevTap}
          >
            Parametres
          </button>
          <button
            type="button"
            className={`h-7 w-7 rounded-full border flex items-center justify-center ${
              "bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950"
            }`}
            onClick={() => {
              closeSettingsMenu({ animatePanels: true });
            }}
            aria-label="Fermer"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            onClick={openSoundMenu}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              allSoundOn ? settingsPositiveButtonClass : settingsPanelButtonClass
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] leading-none">
                volume_up
              </span>
              <span className="inline-flex flex-col items-start leading-tight">
                <span className="font-semibold">Son</span>
                <span className="text-[10px] opacity-70">
                  {enabledSoundCount}/6 activés
                </span>
              </span>
            </span>
            <span className="text-[10px] font-semibold opacity-70">
              {allSoundOn ? "Tout On" : "Configurer"}
            </span>
          </button>
          <button
            type="button"
            onClick={openVisualMenu}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              allVisualOn ? settingsPositiveButtonClass : settingsPanelButtonClass
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] leading-none">
                visibility
              </span>
              <span className="inline-flex flex-col items-start leading-tight">
                <span className="font-semibold">Apparence</span>
                <span className="text-[10px] opacity-70">
                  {enabledVisualCount}/7 effets actifs
                </span>
              </span>
            </span>
            <span className="text-[10px] font-semibold opacity-70">
              {allVisualOn ? "Tout On" : "Configurer"}
            </span>
          </button>
          {!isMobileLayout ? (
            <button
              type="button"
              onClick={openKeyboardMenu}
              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                keyboardRecallSubmittedWord ? settingsPositiveButtonClass : settingsPanelButtonClass
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] leading-none">
                  keyboard
                </span>
                <span className="inline-flex flex-col items-start leading-tight">
                  <span className="font-semibold">Clavier</span>
                  <span className="text-[10px] opacity-70">
                    Rappel avec flèche haut
                  </span>
                </span>
              </span>
              <span className="text-[10px] font-semibold opacity-70">
                {keyboardRecallSubmittedWord ? "Envoyé" : "Valide"}
              </span>
            </button>
          ) : null}
          {devMenuUnlocked ? (
            <button
              type="button"
              onClick={openDevMenu}
              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                devControls?.enabled ? settingsPositiveButtonClass : settingsMutedButtonClass
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] leading-none">
                  code
                </span>
                <span className="inline-flex flex-col items-start leading-tight">
                  <span className="font-semibold">Dev</span>
                  <span className="text-[10px] opacity-70">
                    Tests locaux et bots
                  </span>
                </span>
              </span>
              <span className="text-[10px] font-semibold opacity-70">
                {devControls?.enabled ? "On" : "Off"}
              </span>
            </button>
          ) : null}
          {moderationAvailable ? (
            <button
              type="button"
              onClick={openModerationMenu}
              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${settingsMutedButtonClass}`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] leading-none">
                  shield
                </span>
                <span className="inline-flex flex-col items-start leading-tight">
                  <span className="font-semibold">Moderation</span>
                  <span className="text-[10px] opacity-70">
                    Kick et bans temporaires
                  </span>
                </span>
              </span>
              <span className="text-[10px] font-semibold opacity-70">
                {moderationPlayers.length}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setIsGeneralMenuOpen(true)}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${settingsPanelButtonClass}`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] leading-none">
                tune
              </span>
              <span className="inline-flex flex-col items-start leading-tight">
                <span className="font-semibold">Général</span>
                <span className="text-[10px] opacity-70">
                  Vibrations et contrôle de temps
                </span>
              </span>
            </span>
            <span className="text-[10px] font-semibold opacity-70">
              {playtimeLimitActive ? formatPlaytimeMs(playtimeRemainingMs) : "Configurer"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSettingsOpen(false);
              setShowHelp(true);
            }}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${settingsMutedButtonClass}`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
                Aide
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeSettingsMenu({ animatePanels: true });
              openTutorialFromHome();
            }}
            disabled={isConnecting}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 disabled:opacity-60 ${settingsMutedButtonClass}`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] leading-none">
                school
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
                Relire le didacticiel
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSettingsOpen(false);
              setIsAboutOpen(true);
            }}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${settingsMutedButtonClass}`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
                À propos
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={openFacebookGroup}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-blue-300/45 bg-[#1877f2] px-3 py-2 text-white shadow transition hover:bg-[#0f6de0] active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1877f2]">
                <FacebookLogo className="h-6 w-6" />
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-wide">
                Rejoignez-nous sur Facebook
              </span>
            </span>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              open_in_new
            </span>
          </button>
          <button
            type="button"
            onClick={returnToLobby}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${settingsGoldButtonClass}`}
          >
            <span className="inline-flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span>Retour lobby</span>
            </span>
          </button>
        </div>
      </div>
      <div
        className={`absolute inset-y-0 right-0 w-full max-w-md border-l-2 border-amber-300/70 shadow-2xl transition-transform duration-300 bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] text-amber-50 ${isGeneralMenuOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        <div className="h-full flex flex-col">
          <div className="shrink-0 px-4 py-3 border-b border-amber-200/25 bg-amber-300/10">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsBotsMenuOpen(false);
                  setIsGeneralMenuOpen(false);
                }}
                className={`h-8 px-2 rounded-lg border text-xs font-semibold ${settingsGoldButtonClass}`}
              >
                Retour
              </button>
              <div className="text-sm font-extrabold tracking-wide">Général</div>
              <span className="text-[10px] font-bold opacity-75">live</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            <button
              type="button"
              onClick={() => {
                if (!canVibrate) return;
                setIsVibrationEnabled((v) => !v);
              }}
              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${!canVibrate ? settingsMutedButtonClass : vibrationOn ? settingsPositiveButtonClass : settingsDangerButtonClass} ${canVibrate ? "" : "opacity-50 cursor-not-allowed"}`}
              disabled={!canVibrate}
            >
              <span className="inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] leading-none">vibration</span>
                <span>{canVibrate ? "Vibrations" : "Vibrations indisponibles"}</span>
              </span>
              <span className="text-[10px] font-semibold opacity-70">
                {canVibrate ? (isVibrationEnabled ? "On" : "Off") : "--"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsBotsMenuOpen(true)}
              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${settingsPanelButtonClass}`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] leading-none">smart_toy</span>
                <span>Bots</span>
              </span>
              <span className="text-[10px] font-semibold opacity-70">
                {Array.isArray(chatBotVisibilityOptions)
                  ? `${chatBotVisibilityOptions.filter((bot) => chatBotVisibility?.[bot.key] !== false).length}/${chatBotVisibilityOptions.length}`
                  : "--"}
              </span>
            </button>

            <div className={`rounded-xl border px-3 py-3 ${settingsPanelButtonClass}`}>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] opacity-80">
                Contrôle de temps pour joueurs compulsifs
              </div>
              {playtimeLimitActive ? (
                <div className="mt-2 space-y-1">
                  <div className="text-lg font-black">{formatPlaytimeMs(playtimeRemainingMs)}</div>
                  <div className="text-xs opacity-75">
                    Limite active jusqu'à minuit heure de Paris. Seul un admin peut la retirer.
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {renderPlaytimeWheelColumn({
                      animation: playtimeWheelAnimation.hours,
                      label: "Heures",
                      value: playtimeHours,
                      options: PLAYTIME_HOUR_OPTIONS,
                      formatValue: (value) => String(value),
                      onShift: shiftPlaytimeHours,
                    })}
                    {renderPlaytimeWheelColumn({
                      animation: playtimeWheelAnimation.minutes,
                      label: "Minutes",
                      value: playtimeMinutes,
                      options: playtimeMinuteOptions,
                      formatValue: (value) => String(value).padStart(2, "0"),
                      onShift: shiftPlaytimeMinutes,
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PLAYTIME_PRESET_MINUTES.map((minutes) => {
                      const active = selectedPlaytimeMs === minutes * 60 * 1000;
                      return (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => setPlaytimeFromTotalMinutes(minutes)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-black tabular-nums ${
                            active ? settingsGoldButtonClass : settingsMutedButtonClass
                          }`}
                        >
                          {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={selectedPlaytimeMs < PLAYTIME_MIN_MS}
                    onClick={() => setPlaytimeConfirmOpen(true)}
                    className={`w-full rounded-xl border px-3 py-2 text-sm font-black disabled:opacity-50 ${settingsGoldButtonClass}`}
                  >
                    Activer {formatPlaytimeMs(selectedPlaytimeMs)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {isBotsMenuOpen ? (
          <div className="absolute inset-0 z-[3] bg-[linear-gradient(180deg,rgba(18,47,103,0.98),rgba(7,22,55,0.99))] text-amber-50">
            <div className="h-full flex flex-col">
              <div className="shrink-0 px-4 py-3 border-b border-amber-200/25 bg-amber-300/10">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBotsMenuOpen(false)}
                    className={`h-8 px-2 rounded-lg border text-xs font-semibold ${settingsGoldButtonClass}`}
                  >
                    Retour
                  </button>
                  <div className="text-sm font-extrabold tracking-wide">Bots</div>
                  <span className="text-[10px] font-bold opacity-75">chat</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
                {(Array.isArray(chatBotVisibilityOptions) ? chatBotVisibilityOptions : []).map((bot) => {
                  const enabled = chatBotVisibility?.[bot.key] !== false;
                  return (
                    <button
                      key={bot.key}
                      type="button"
                      role="switch"
                      aria-checked={enabled ? "true" : "false"}
                      onClick={() =>
                        typeof setChatBotVisibility === "function"
                          ? setChatBotVisibility((prev) => ({
                              ...(prev || {}),
                              [bot.key]: prev?.[bot.key] === false,
                            }))
                          : null
                      }
                      className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                        enabled ? settingsPositiveButtonClass : settingsMutedButtonClass
                      }`}
                    >
                      <span className="font-semibold">{bot.nick}</span>
                      <span
                        className={`relative h-5 w-9 rounded-full transition ${
                          enabled ? "bg-emerald-500" : "bg-slate-700"
                        }`}
                        aria-hidden="true"
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                            enabled ? "left-[18px]" : "left-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
        {playtimeConfirmOpen ? (
          <div className="absolute inset-0 z-[4] flex items-center justify-center p-3">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              onClick={() => setPlaytimeConfirmOpen(false)}
              aria-label="Annuler"
            />
            <div className="relative w-full max-w-sm rounded-2xl border-2 border-amber-300/70 bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] p-4 shadow-2xl text-amber-50">
              <div className="text-sm font-extrabold">Confirmer la limite</div>
              <div className="mt-2 text-xs leading-5 opacity-85">
                Une fois activée, cette limite ne pourra pas être retirée sans intervention admin.
              </div>
              <div className="mt-3 text-lg font-black">{formatPlaytimeMs(selectedPlaytimeMs)}</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPlaytimeConfirmOpen(false)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${settingsPanelButtonClass}`}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok =
                      typeof setPlaytimeLimitFromSettings === "function"
                        ? await setPlaytimeLimitFromSettings(selectedPlaytimeMs)
                        : false;
                    if (ok) setPlaytimeConfirmOpen(false);
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${settingsGoldButtonClass}`}
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <SettingsPanelHost
        sound={{
          isOpen: isSoundMenuOpen,
          props: {
            darkMode: menuDarkMode,
            isOpen: isSoundMenuOpen,
            enabledSoundCount,
            allSoundOn,
            soundMasterVolume,
            ambientOn,
            soundValidationEnabled,
            soundInvalidErrorEnabled,
            soundTileStepEnabled,
            soundTimerEnabled,
            soundGobbleEnabled,
            onClose: closeSoundMenu,
            onToggleAll: () => setAllSoundEnabled(!allSoundOn),
            onMasterVolumeChange: (next) =>
              setSoundMasterVolume(
                normalizeSoundMasterVolume(next, SOUND_MASTER_VOLUME_DEFAULT)
              ),
            onToggleAmbient: () => setIsAmbientMuted((prev) => !prev),
            onToggleValidation: () => setSoundValidationEnabled((prev) => !prev),
            onToggleInvalidError: () => setSoundInvalidErrorEnabled((prev) => !prev),
            onToggleTileStep: () => setSoundTileStepEnabled((prev) => !prev),
            onToggleTimer: () => setSoundTimerEnabled((prev) => !prev),
            onToggleGobble: () => setSoundGobbleEnabled((prev) => !prev),
          },
        }}
        visual={{
          isOpen: isVisualMenuOpen,
          props: {
            darkMode: menuDarkMode,
            isOpen: isVisualMenuOpen,
            enabledVisualCount,
            allVisualOn,
            visualGobbleEnabled,
            visualPraiseEnabled,
            visualScoreFlightsEnabled,
            visualInvalidWordsEnabled,
            visualScreenShakeEnabled,
            visualConfettiEnabled,
            visualGoldNickFxEnabled,
            onClose: closeVisualMenu,
            onOpenTheme: openThemeMenu,
            themeBalance: gobblarsBalance,
            themeBadgeUrl: gobblarsBadgeUrl,
            onToggleAll: () => setAllVisualEnabled(!allVisualOn),
            onToggleGobble: () => setVisualGobbleEnabled((prev) => !prev),
            onTogglePraise: () => setVisualPraiseEnabled((prev) => !prev),
            onToggleScoreFlights: () => setVisualScoreFlightsEnabled((prev) => !prev),
            onToggleInvalidWords: () => setVisualInvalidWordsEnabled((prev) => !prev),
            onToggleScreenShake: () => setVisualScreenShakeEnabled((prev) => !prev),
            onToggleConfetti: () => setVisualConfettiEnabled((prev) => !prev),
            onToggleGoldNickFx: () => setVisualGoldNickFxEnabled((prev) => !prev),
          },
        }}
        keyboard={{
          isOpen: isKeyboardMenuOpen,
          props: {
            darkMode: menuDarkMode,
            isOpen: isKeyboardMenuOpen,
            recallSubmittedWord: keyboardRecallSubmittedWord,
            onClose: closeKeyboardMenu,
            onToggleRecallSubmittedWord: () =>
              setKeyboardRecallSubmittedWord((prev) => !prev),
          },
        }}
        dev={{
          isOpen: isDevMenuOpen,
          props: {
            darkMode: menuDarkMode,
            isOpen: isDevMenuOpen,
            available: devControlsAvailable,
            locked: devControlsLocked,
            accountAllowed: devAccountAllowed,
            accountLabel: devAccountLabel,
            passwordRequired: devPasswordRequired,
            passwordConfigured: devPasswordConfigured,
            controls: devControls,
            roundTypes: devRoundTypes,
            bots: devBots,
            playtimeLimits: devPlaytimeLimits,
            busy: devControlsBusy,
            password: devPassword,
            error: devError,
            perfTestEnabled,
            onClose: closeDevMenu,
            onPerfTestToggle: setPerfTestEnabled,
            onPasswordChange: setDevPassword,
            onUnlock: unlockDevControls,
            onLock: lockDevControls,
            onPatch: patchDevControls,
            onFillChat: fillDevChat,
            onClearChat: clearDevChat,
            onSendGlobalAnnouncement: sendDevGlobalAnnouncement,
            onShowWeeklyRecap: showDevDuelWeekRecap,
            onRefreshPlaytimeLimits: fetchDevPlaytimeLimits,
            onClearPlaytimeLimit: clearDevPlaytimeLimit,
            onRefreshBots: fetchDevBots,
            onSetBotActive: setDevBotActive,
            onSetAllBotsActive: setAllDevBotsActive,
            onReturnToLiveLobby: returnToLiveLobbyDev,
            onOpenTargetWaitPlayground: openTargetWaitDevPlayground,
            targetWaitDevActive,
            targetWaitDevArmed,
          },
        }}
        moderation={{
          isOpen: isModerationMenuOpen,
          props: {
            darkMode: menuDarkMode,
            isOpen: isModerationMenuOpen,
            available: moderationAvailable,
            accountLabel: moderationAccountLabel,
            players: moderationPlayers,
            busy: moderationBusy,
            error: moderationError,
            onClose: closeModerationMenu,
            onRefresh: fetchModerationState,
            onAction: applyModerationAction,
          },
        }}
      />
      <div
        className={`absolute inset-y-0 right-0 w-full max-w-md border-l-2 border-amber-300/70 shadow-2xl transition-transform duration-300 bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] text-amber-50 ${
          isThemeMenuOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <div className="h-full flex flex-col">
          <div
            className="shrink-0 px-4 py-3 border-b border-amber-200/25 bg-amber-300/10"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={closeThemeMenu}
                className={`h-8 px-2 rounded-lg border text-xs font-semibold ${settingsGoldButtonClass}`}
              >
                Retour
              </button>
              <div className="text-sm font-extrabold tracking-wide">Thème</div>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold border border-amber-400/40 bg-amber-400/15 text-amber-100">
                <img src={gobblarsBadgeUrl} alt="" className="h-3.5 w-3.5 rounded-full" />
                {gobblarsBalance}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div
              className={`rounded-2xl border p-3 ${
                darkMode ? "border-white/10 bg-slate-900/40" : "border-slate-200 bg-white/70"
              }`}
              style={themePreviewBackgroundStyle}
            >
              <div className="text-[11px] font-semibold uppercase tracking-widest opacity-80 text-center">
                Aperçu en temps réel
              </div>
              {isMobileLayout ? (
                <div className="mt-2">
                  <MobileGrid
                    board={themePreviewCells}
                    BONUS_CLASSES={BONUS_CLASSES}
                    bonusLetterKey=""
                    bonusLetterScore={20}
                    darkMode={darkMode}
                    gridRef={themePreviewGridRef}
                    gridShake={false}
                    gridSize={4}
                    gridRotationTurns={0}
                    handleMouseDown={themePreviewNoop}
                    handleMouseMove={themePreviewNoop}
                    handleMouseUp={themePreviewNoop}
                    handleTouchEnd={themePreviewNoop}
                    handleTouchMove={themePreviewNoop}
                    handleTouchStart={themePreviewNoop}
                    hintCellSet={themePreviewEmptySet}
                    hintOutlineCellSet={themePreviewEmptySet}
                    implodeActive={false}
                    isMobileLayout={true}
                    lightGridSurfaceStyle={{}}
                    MOBILE_LAYOUT_MAX_WIDTH={MOBILE_GRID_MAX_WIDTH}
                    mobileGapPx={themePreviewMobileGapPx}
                    mobileGridSide={themePreviewMobileGridSide}
                    mobileTileFontPx={themePreviewMobileTileFontPx}
                    normalizeBonusLabel={normalizeBonusLabel}
                    normalizeLetterKey={normalizeLetterKey}
                    phase="playing"
                    specialIndicatorPreset={themeDraftSafe.specialIndicator}
                    specialSolvedOverlay={false}
                    introHideTiles={false}
                    defaultTileBaseClass={defaultTileBaseClass}
                    tilePointsVisible={tilePointsVisible}
                    tileRefs={themePreviewTileRefs}
                    tileMaterialClass={themePreviewMaterialClass}
                    tileColorPreset={themeDraftSafe.tileColor}
                    tileScore={tileScore}
                    tick={0}
                    usedSet={themePreviewEmptySet}
                  />
                </div>
              ) : (
                <div
                  className="mt-2 grid bg-white border rounded-xl w-full"
                  style={{
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: themePreviewGap,
                    padding: themePreviewPadding,
                    maxWidth: "100%",
                  }}
                >
                    {themePreviewCells.map((cell, idx) => {
                      const displayBonus = normalizeBonusLabel(cell.bonus);
                      const useFillBonus =
                        themePreviewUseFill && displayBonus && BONUS_CLASSES[displayBonus];
                      const tileBaseClass = useFillBonus
                        ? BONUS_CLASSES[displayBonus]
                        : defaultTileBaseClass;
                      const letterRingClass =
                        themePreviewUseRing && displayBonus
                          ? getBonusLetterRingClass(displayBonus)
                          : "";
                      return (
                        <button
                          key={`theme-preview-tile-${idx}`}
                          type="button"
                          className={`tile-cell relative rounded-lg flex items-center justify-center font-extrabold select-none ${themePreviewMaterialClass} ${tileBaseClass}`}
                          style={{
                            width: "100%",
                            aspectRatio: "1 / 1",
                            pointerEvents: "none",
                            fontSize: "clamp(20px, 5vw, 32px)",
                            borderColor: useFillBonus ? undefined : themePreviewTileColor.border,
                            backgroundColor: useFillBonus ? undefined : themePreviewTileColor.bg,
                            ...(getTileColorTextureStyle(idx, 4, themeDraftSafe.tileColor) || {}),
                          }}
                          aria-hidden="true"
                        >
                          <GridTileLetter cell={cell} className={letterRingClass} />
                          {tilePointsVisible ? (
                            <span className="tile-points">{tileScore(cell)}</span>
                          ) : null}
                          {displayBonus && (themePreviewUseFill || themePreviewUseBadge) ? (
                            <span
                              className={`absolute top-0 right-0 text-[0.6rem] px-1 py-0.5 rounded-full font-black shadow ${getBonusBadgeClass(
                                displayBonus
                              )}`}
                              style={{
                                transform: themePreviewIsSquare
                                  ? "translate(-8%, 8%)"
                                  : "translate(10%, -10%)",
                              }}
                            >
                              {displayBonus}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={requestThemeResetDefault}
                  disabled={themeApplying}
                  className={`rounded-xl border px-2 py-2 text-left text-[11px] font-semibold disabled:opacity-50 ${settingsPanelButtonClass}`}
                >
                  <div className="font-extrabold">Par défaut</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeAction(themeFullApplyMeta)}
                  disabled={
                    themeApplying ||
                    (themeFullApplyMeta.totalCost > 0 && !themeFullApplyMeta.canAfford)
                  }
                  className={`rounded-xl border px-2 py-2 text-left text-[11px] font-semibold disabled:opacity-50 ${settingsGoldButtonClass}`}
                >
                  <div className="font-extrabold">
                    {themeFullActionLabel}
                    {themeFullApplyMeta.totalCost > 0 ? ` (${themeFullApplyMeta.totalCost} G)` : ""}
                  </div>
                  <div className="mt-1 text-slate-900/80">
                    {themeFullApplyMeta.changedCategories.length} paramètre(s) modifié(s)
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-900/80 break-words">
                    {themeFullChangedSummary}
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {themeControlButtons.map((entry) => {
                const selected = entry.kind === "picker" ? themePickerCategory === entry.id : false;
                const buttonClass = `bg-slate-950/35 border-amber-200/25 text-amber-50 ${
                  selected ? "ring-2 ring-amber-300 border-amber-300" : ""
                }`;
                return (
                  <button
                    key={`theme-control-${entry.id}`}
                    type="button"
                    title={entry.title}
                    aria-label={entry.title}
                    onClick={() => {
                      if (entry.id === "darkMode") {
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
                        return;
                      }
                      if (entry.id === "tilePoints") {
                        setTilePointsVisible((prev) => !prev);
                        return;
                      }
                      setThemePickerCategory(entry.id);
                    }}
                    className={`relative aspect-square rounded-xl border ${buttonClass}`}
                  >
                    <span className="sr-only">{entry.title}</span>
                    <span className="inline-flex h-full w-full items-center justify-center">
                      {entry.id === "darkMode" ? (
                        themeDraftSafe.darkMode ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="4" />
                            <path d="M12 2v2" />
                            <path d="M12 20v2" />
                            <path d="m4.93 4.93 1.41 1.41" />
                            <path d="m17.66 17.66 1.41 1.41" />
                            <path d="M2 12h2" />
                            <path d="M20 12h2" />
                            <path d="m6.34 17.66-1.41 1.41" />
                            <path d="m19.07 4.93-1.41 1.41" />
                          </svg>
                        )
                      ) : null}
                      {entry.id === "tileColor" ? (
                        <span
                          className="inline-flex h-6 w-6 rounded-md border"
                          style={getTileColorSwatchStyle(themePreviewTileColor)}
                        />
                      ) : null}
                      {entry.id === "font" ? (
                        <span
                          className="font-extrabold text-base"
                          style={{
                            fontFamily: "\"GobblePerfectPen\", \"KGPerfectPenmanship\", cursive",
                          }}
                        >
                          Aa
                        </span>
                      ) : null}
                      {entry.id === "letterScale" ? (
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <text
                            x="7.5"
                            y="14"
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight="700"
                            fill="currentColor"
                            stroke="none"
                          >
                            A
                          </text>
                          <line x1="15.5" y1="4.5" x2="15.5" y2="19.5" />
                          <polyline points="13.8,6.2 15.5,4.5 17.2,6.2" />
                          <polyline points="13.8,17.8 15.5,19.5 17.2,17.8" />
                        </svg>
                      ) : null}
                      {entry.id === "letterColor" ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                          <text
                            x="12"
                            y="16.5"
                            textAnchor="middle"
                            fontSize="16"
                            fontWeight="900"
                            fill={tileLetterColorValue}
                            stroke="#111111"
                            strokeWidth="1.2"
                            paintOrder="stroke fill"
                            style={{ filter: "drop-shadow(0 0 0.8px rgba(255,255,255,0.9))" }}
                          >
                            A
                          </text>
                        </svg>
                      ) : null}
                      {entry.id === "background" ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[18px] leading-none">
                            format_paint
                          </span>
                          <span
                            className="inline-flex h-3.5 w-3.5 rounded-sm border"
                            style={themePreviewBackgroundStyle}
                          />
                        </span>
                      ) : null}
                      {entry.id === "material" ? (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <rect
                            x="3.5"
                            y="3.5"
                            width="12"
                            height="12"
                            rx="2.8"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <circle
                            cx="14.5"
                            cy="14.5"
                            r="5.8"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        </svg>
                      ) : null}
                      {entry.id === "specialIndicator" ? (
                        <span className="material-symbols-outlined text-[20px] leading-none">flare</span>
                      ) : null}
                      {entry.id === "tilePoints" ? (
                        <span className="inline-flex items-center justify-center text-[13px] font-black leading-none">
                          {tilePointsVisible ? "123" : "123/"}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {themePickerCategory ? (
          <div className="absolute inset-0 z-[2] flex items-center justify-center p-3">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setThemePickerCategory("")}
              aria-label="Fermer sélecteur thème"
            />
            <div
              className="relative w-full max-w-sm rounded-2xl border-2 border-amber-300/70 bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] p-3 shadow-2xl text-amber-50"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-extrabold">{themePickerTitle}</div>
                <button
                  type="button"
                  onClick={() => setThemePickerCategory("")}
                  className={`h-7 w-7 rounded-full border flex items-center justify-center ${settingsGoldButtonClass}`}
                  aria-label="Fermer"
                >
                  <span className="text-base leading-none">×</span>
                </button>
              </div>
              {themePickerViewMode === "slider" ? (
                <div className="space-y-3 px-1 pb-1">
                  <input
                    type="range"
                    min={TILE_LETTER_SCALE_MIN}
                    max={TILE_LETTER_SCALE_MAX}
                    step={0.02}
                    value={normalizeTileLetterScale(themePickerCurrentValue, TILE_LETTER_SCALE_DEFAULT)}
                    onChange={(e) => {
                      applyThemeDraftCategory(themePickerCategory, Number(e.target.value));
                    }}
                    className="w-full accent-blue-500"
                    aria-label="Taille des lettres"
                  />
                  <div className={`text-xs font-semibold flex items-center justify-between ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                    <span>Petit</span>
                    <span>
                      {Math.round(
                        (normalizeTileLetterScale(
                          themePickerCurrentValue,
                          TILE_LETTER_SCALE_DEFAULT
                        ) /
                          TILE_LETTER_SCALE_DEFAULT) *
                          100
                      )}
                      %
                    </span>
                    <span>Grand</span>
                  </div>
                </div>
              ) : (
                <div className="max-h-[54vh] overflow-y-auto space-y-2 pr-1">
                  {themePickerOptions.map((option) => {
                    const selected = option.id === themePickerCurrentValue;
                    const optionUnlockKey = getThemeUnlockItemKey(
                      themePickerCategory,
                      option.id
                    );
                    const optionLockable = isThemeOptionLockableGlobal(
                      themePickerCategory,
                      option.id
                    );
                    const optionUnlocked = isThemeOptionUnlocked(
                      themePickerCategory,
                      option.id
                    );
                    const optionDraft = buildThemeDraftWithOption(
                      themePickerCategory,
                      option.id
                    );
                    const optionMeta = computeThemeApplyMeta(
                      "single",
                      themePickerCategory,
                      optionDraft
                    );
                    const optionBuyCost =
                      optionLockable && !optionUnlocked ? optionMeta.totalCost : 0;
                    const optionCanAfford =
                      optionBuyCost <= 0 ? true : gobblarsBalance >= optionBuyCost;
                    const justUnlocked =
                      themeRecentlyUnlocked.includes(optionUnlockKey) &&
                      themeUnlockAnimToken > 0;
                    const isPalette =
                      themePickerViewMode === "palette" &&
                      (themePickerCategory === "tileColor" ||
                        themePickerCategory === "letterColor" ||
                        themePickerCategory === "background");
                    const optionStyle =
                      themePickerCategory === "tileColor"
                        ? getTileColorSwatchStyle(option)
                        : themePickerCategory === "letterColor"
                        ? {
                            background: option.value,
                            borderColor: "rgba(0, 0, 0, 0.2)",
                          }
                        : themePickerCategory === "background"
                        ? {
                            backgroundColor: option.style?.color || "#dbeafe",
                            backgroundImage: option.style?.image || "none",
                            backgroundSize: option.style?.size || "auto",
                            borderColor: "rgba(0, 0, 0, 0.2)",
                          }
                        : null;
                    return (
                      <div
                        key={`${themePickerCategory}-${option.id}`}
                        className={`w-full rounded-xl border px-2 py-2 flex items-center justify-between gap-2 ${
                          selected
                            ? "border-amber-300 bg-amber-300/15"
                            : "border-amber-200/25 bg-slate-950/35"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            applyThemeDraftCategory(themePickerCategory, option.id);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="inline-flex items-center gap-2 min-w-0">
                            {isPalette ? (
                              <span
                                className="inline-flex h-6 w-6 rounded-md border shrink-0"
                                style={optionStyle || undefined}
                              />
                            ) : null}
                            <span
                              className="truncate text-sm"
                              style={
                                themePickerViewMode === "font-list"
                                  ? { fontFamily: option.family || undefined }
                                  : undefined
                              }
                            >
                              {option.label}
                            </span>
                          </span>
                        </button>
                        <div className="shrink-0 inline-flex items-center gap-1">
                          {selected ? (
                            <span className="material-symbols-outlined text-[18px] leading-none text-emerald-500">
                              check_circle
                            </span>
                          ) : null}
                          {optionLockable && !optionUnlocked ? (
                            <span
                              className={`material-symbols-outlined text-[16px] leading-none text-amber-500 ${
                                justUnlocked ? "theme-unlock-pop" : ""
                              }`}
                            >
                              lock
                            </span>
                          ) : null}
                          {optionLockable && !optionUnlocked ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleThemeOptionBuy(themePickerCategory, option.id);
                              }}
                              disabled={themeApplying || !optionCanAfford}
                              className={`h-7 px-2 rounded-lg border text-[11px] font-semibold ${
                                darkMode
                                  ? "bg-amber-600/90 border-amber-300/50 text-slate-950"
                                  : "bg-amber-500 border-amber-300 text-slate-900"
                              } disabled:opacity-50`}
                            >
                              Acheter{optionBuyCost > 0 ? ` (${optionBuyCost}G)` : ""}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {themePurchaseConfirm ? (
          <div className="absolute inset-0 z-[3] flex items-center justify-center p-3">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              onClick={() => setThemePurchaseConfirm(null)}
              aria-label="Fermer confirmation achat thème"
            />
            <div
              className="relative w-full max-w-sm rounded-2xl border-2 border-amber-300/70 bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] p-4 shadow-2xl text-amber-50"
            >
              <div className="text-sm font-extrabold">Confirmation d'achat</div>
              <div className="mt-2 text-[13px] leading-5 opacity-90">
                {themePurchaseConfirm.mode === "single"
                  ? `Déverrouiller ${themeLastCategoryLabel} pour ${themePurchaseConfirm.totalCost} Gobblars ?`
                  : `Déverrouiller ce thème pour ${themePurchaseConfirm.totalCost} Gobblars ?`}
              </div>
              <div className="mt-2 text-[11px] leading-4 opacity-80 break-words">
                Modifiés: {((themePurchaseConfirm.changedCategories || []).map((key) => themeCategoryLabel(key)).join(" · ")) || "Aucun"}
              </div>
              <div className="mt-2 text-[11px] opacity-80">
                Solde: {gobblarsBalance} G
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setThemePurchaseConfirm(null)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${settingsPanelButtonClass}`}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmThemePurchase}
                  disabled={themeApplying || gobblarsBalance < themePurchaseConfirm.totalCost}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${settingsGoldButtonClass}`}
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsMenuFrame>
  );

}

export default React.memo(SettingsMenu);
