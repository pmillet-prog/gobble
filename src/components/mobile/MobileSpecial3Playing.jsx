import React from "react";

import {
  RoundClockProgress,
  RoundClockSeconds,
} from "../../features/clock/RoundClockDisplay.jsx";
import { useChatUnreadState } from "../../features/chat/useChatUnreadState.js";
import LiveFeedSatellite from "../../features/live/LiveFeedSatellite.jsx";
import MobileGrid from "../MobileGrid.jsx";
import { UI_IMAGE_KEYS, getUiImageUrl } from "../../assets/uiAssetManifest.js";
import {
  getTraceStateSnapshot,
  subscribeTraceState,
} from "../traceStateStore.js";

function MobileSpecial3Playing(props) {
  const {
    DAILY_SPECIAL_BONUSES = [],
    DAILY_SPECIAL_WORD_TARGET = 3,
    activeSlotResolved = 0,
    allSoundOn = true,
    chatOverlays = null,
    clearDailyWordSlot = null,
    dailyInvalidPulseKey = 0,
    dailyInvalidSlot = -1,
    dailyLiveWordBlockedReason: fallbackBlockedReason = "",
    dailyLiveWordNorm: fallbackNormalizedWord = "",
    dailyLiveWordScore: fallbackScore = 0,
    dailyLiveWordValid: fallbackValid = false,
    dailyTotalScore = 0,
    darkMode = false,
    filledCount = 0,
    formatNumber = (value) => String(value ?? ""),
    highlightPath: fallbackHighlightPath = [],
    isDailyPlay = false,
    isLoggedIn = false,
    isStandaloneTraining = false,
    liveWord: fallbackLiveWord = "",
    mobileChatUnreadIsBotOnly: mobileChatUnreadIsBotOnlyProp = false,
    mobileChatUnreadCount: mobileChatUnreadCountProp = 0,
    mobileGridProps = {},
    mobileResultsPhaseFadeOverlay = null,
    mobileRoundIntroOverlay = null,
    mobileSpecial3BonusTrayRef = null,
    mobileSpecial3FirstSlotRef = null,
    mobileSpecial3GridWrapRef = null,
    mobileSpecial3SecondSlotRef = null,
    mobileSpecial3TutorialHostRef = null,
    mobileViewportContainerStyle = undefined,
    onOpenSettings = null,
    praiseOverlay = null,
    maxDurationSec = 90,
    trainingControls = null,
    trainingFeedBannerText = "",
    getNickClassName = null,
    renderSpecial3LengthGobbleBadge = null,
    renderSpecialChip = null,
    renderWordPreviewTiles = null,
    resolveLiveTrace = null,
    requestOpenChat = null,
    setDailyActiveSlot = null,
    slots = [],
    special3ActionFontPx = 12,
    special3ActionPadYPx = 6,
    special3BonusTrayBaseHeightPx = 40,
    special3BonusTrayHeightPx = 40,
    special3BonusTrayMaxHeightPx = 80,
    special3BonusTrayPadX = 8,
    special3BonusTrayPadY = 4,
    special3BottomPadPx = 6,
    special3ChatBadgeSide = 16,
    special3ChatButtonSide = 40,
    special3DragGhost = null,
    special3InGameTutorialCard = null,
    special3MetaFontPx = 10,
    special3MobileStep1Ghost = null,
    special3MobileStep2TutorialOverlay = null,
    special3PreviewTileHeightPx = 20,
    special3ProgressHeightPx = 6,
    special3ProgressTopMarginPx = 6,
    special3SectionGapPx = 6,
    special3SettingsButtonSide = 28,
    special3SettingsIconPx = 18,
    special3SidePadPx = 10,
    special3SlotDeleteSide = 22,
    special3SlotGapPx = 4,
    special3SlotPadX = 8,
    special3SlotPadY = 4,
    special3SlotPlaceholderFontPx = 11,
    special3SlotRowMinHeightPx = 44,
    special3SlotScoreFontPx = 11,
    special3SlotScoreMinWidthPx = 60,
    special3SlotTotalFontPx = 13,
    special3TimerFontPx = 28,
    special3TimerTopMarginPx = 2,
    special3TopPadPx = 4,
    special3TutorialStep = 0,
    special3ValidationBlockMinHeightPx = 120,
    submitDailyScore = null,
    toggleDarkModeQuick = null,
    toggleSoundQuick = null,
    visualScreenShakeEnabled = true,
  } = props;
  const { mobileChatUnreadCount, mobileChatUnreadIsBotOnly } =
    useChatUnreadState();

  const traceSnapshot = React.useSyncExternalStore(
    subscribeTraceState,
    getTraceStateSnapshot,
    getTraceStateSnapshot
  );
  const resolvedTrace =
    typeof resolveLiveTrace === "function" ? resolveLiveTrace(traceSnapshot) || {} : {};
  const highlightPath = Array.isArray(resolvedTrace.highlightPath)
    ? resolvedTrace.highlightPath
    : fallbackHighlightPath;
  const liveWord = String(resolvedTrace.liveWord ?? fallbackLiveWord ?? "");
  const dailyLiveWordNorm = String(
    resolvedTrace.normalizedWord ?? fallbackNormalizedWord ?? ""
  );
  const dailyLiveWordBlockedReason = String(
    resolvedTrace.blockedReason ?? fallbackBlockedReason ?? ""
  );
  const dailyLiveWordValid =
    resolvedTrace.valid == null ? Boolean(fallbackValid) : Boolean(resolvedTrace.valid);
  const dailyLiveWordScore = Number.isFinite(resolvedTrace.score)
    ? resolvedTrace.score
    : fallbackScore;

  return (
    <>
      <div
        className={`flex flex-col ${
          darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
        }`}
        style={mobileViewportContainerStyle}
      >
        <style>{`
          @keyframes dailyInvalidShake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-4px); }
            40% { transform: translateX(4px); }
            60% { transform: translateX(-3px); }
            80% { transform: translateX(3px); }
          }
          .daily-invalid-shake {
            animation: dailyInvalidShake 320ms ease-in-out;
          }
          .daily-special-lock {
            animation: specialHintTile 320ms ease-in-out;
          }
          .special3-tutorial-focus {
            box-shadow:
              0 0 0 3px rgba(251, 191, 36, 0.35),
              inset 0 0 0 2px rgba(251, 191, 36, 0.55);
          }
          .special3-tutorial-ghost {
            animation: special3TutorialGhostMove 1.8s ease-in-out infinite;
          }
          .special3-tutorial-pulse {
            animation: specialHintTile 1.8s ease-in-out infinite;
          }
          @keyframes special3TutorialGhostMove {
            0% { transform: translate(-42px, 84px) scale(0.92); opacity: 0; }
            18% { opacity: 0.95; }
            60% { transform: translate(0px, 0px) scale(1); opacity: 0.95; }
            100% { transform: translate(8px, -18px) scale(0.96); opacity: 0; }
          }
        `}</style>
        <div
          style={{
            paddingLeft: `${special3SidePadPx}px`,
            paddingRight: `${special3SidePadPx}px`,
            paddingTop: `${special3TopPadPx}px`,
            paddingBottom: `${Math.max(4, special3TopPadPx - 1)}px`,
          }}
        >
          <div
            className="grid items-center gap-2"
            style={{
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
              fontSize: `${special3MetaFontPx}px`,
            }}
          >
            <span className="min-w-0 truncate font-semibold opacity-80 justify-self-start">
              {`${filledCount}/${DAILY_SPECIAL_WORD_TARGET} mots validés`}
            </span>
            <div
              className="text-center font-black tabular-nums leading-none justify-self-center"
              style={{
                fontSize: `${special3TimerFontPx}px`,
                marginTop: `${special3TimerTopMarginPx}px`,
              }}
            >
              <RoundClockSeconds />
            </div>
            <div className="flex items-center justify-self-end justify-end gap-1.5">
              <button
                onClick={toggleSoundQuick}
                className="inline-flex items-center justify-center rounded-full border bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                type="button"
                title={allSoundOn ? "Couper le son" : "Activer le son"}
                aria-label={allSoundOn ? "Couper le son" : "Activer le son"}
                style={{
                  height: `${special3SettingsButtonSide}px`,
                  width: `${special3SettingsButtonSide}px`,
                }}
              >
                <span
                  className="material-symbols-outlined leading-none"
                  aria-hidden="true"
                  style={{ fontSize: `${special3SettingsIconPx}px` }}
                >
                  {allSoundOn ? "volume_up" : "volume_off"}
                </span>
              </button>
              <button
                onClick={toggleDarkModeQuick}
                className="inline-flex items-center justify-center rounded-full border bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                type="button"
                title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
                aria-label={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
                style={{
                  height: `${special3SettingsButtonSide}px`,
                  width: `${special3SettingsButtonSide}px`,
                }}
              >
                <span
                  className="material-symbols-outlined leading-none"
                  aria-hidden="true"
                  style={{ fontSize: `${special3SettingsIconPx}px` }}
                >
                  {darkMode ? "light_mode" : "dark_mode"}
                </span>
              </button>
              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => requestOpenChat?.()}
                  aria-label="Ouvrir le chat"
                  className="relative inline-flex items-center justify-center"
                  style={{
                    height: `${special3ChatButtonSide}px`,
                    width: `${special3ChatButtonSide}px`,
                  }}
                >
                  <img
                    src={getUiImageUrl(UI_IMAGE_KEYS.live.chat)}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-contain drop-shadow-md"
                    draggable="false"
                  />
                  {mobileChatUnreadCount > 0 ? (
                    <span
                      className={`absolute px-1 rounded-full font-extrabold flex items-center justify-center shadow-md ${
                        mobileChatUnreadIsBotOnly
                          ? "bg-amber-400 text-slate-950"
                          : "bg-red-600 text-white"
                      }`}
                      style={{
                        minWidth: `${special3ChatBadgeSide}px`,
                        height: `${special3ChatBadgeSide}px`,
                        fontSize: `${Math.max(9, special3ChatBadgeSide - 8)}px`,
                        top: "8%",
                        right: "4%",
                        transform: "translate(32%, -24%)",
                      }}
                    >
                      {mobileChatUnreadIsBotOnly
                        ? "?"
                        : mobileChatUnreadCount >= 10
                        ? "9+"
                        : String(mobileChatUnreadCount)}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <button
                onClick={() => onOpenSettings?.()}
                className="inline-flex items-center justify-center rounded-full border bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                type="button"
                aria-label="Paramètres"
                style={{
                  height: `${special3SettingsButtonSide}px`,
                  width: `${special3SettingsButtonSide}px`,
                }}
              >
                <span
                  className="material-symbols-outlined leading-none"
                  aria-hidden="true"
                  style={{ fontSize: `${special3SettingsIconPx}px` }}
                >
                  settings
                </span>
              </button>
            </div>
          </div>
          <div
            className={`rounded-full overflow-hidden ${
              darkMode ? "bg-slate-800" : "bg-slate-200"
            }`}
            style={{
              marginTop: `${special3ProgressTopMarginPx}px`,
              height: `${special3ProgressHeightPx}px`,
            }}
          >
            <RoundClockProgress
              className="h-full origin-right transition-transform duration-300 bg-amber-500"
              maxSeconds={maxDurationSec}
            />
          </div>
        </div>

        {isStandaloneTraining ? (
          <div className="shrink-0 space-y-1 px-2 pb-1">
            {trainingControls}
            <div className="h-[82px] overflow-hidden rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900/90">
              <LiveFeedSatellite
                limit={8}
                darkMode={darkMode}
                maxHeight="100%"
                bannerText={trainingFeedBannerText}
                getNickClassName={getNickClassName}
              />
            </div>
          </div>
        ) : null}

        <div
          ref={mobileSpecial3TutorialHostRef}
          className="relative flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{
            gap: `${special3SectionGapPx}px`,
            paddingLeft: `${special3SidePadPx}px`,
            paddingRight: `${special3SidePadPx}px`,
            paddingBottom: `${special3BottomPadPx}px`,
          }}
        >
          <div
            className="min-h-0 flex-1 overflow-hidden"
            style={{ minHeight: `${special3ValidationBlockMinHeightPx}px` }}
          >
            <div
              className={`h-full rounded-xl border flex flex-col overflow-hidden ${
                darkMode ? "border-slate-700 bg-slate-900/90" : "border-slate-200 bg-white/90"
              } ${special3TutorialStep === 1 ? "special3-tutorial-focus" : ""}`}
              style={{
                gap: `${special3SlotGapPx}px`,
                paddingLeft: `${special3SlotPadX}px`,
                paddingRight: `${special3SlotPadX}px`,
                paddingTop: `${special3SlotPadY}px`,
                paddingBottom: `${special3SlotPadY}px`,
              }}
            >
              {slots.map((slot, idx) => {
                const slotWord = String(slot?.word || "").trim();
                const isActiveSlot = idx === activeSlotResolved;
                const showLiveWord = isActiveSlot && !slotWord && !!liveWord;
                const displayWord = showLiveWord
                  ? String(liveWord || "").toUpperCase()
                  : String(slot?.display || slotWord || "").toUpperCase();
                const displayPath = showLiveWord
                  ? highlightPath
                  : Array.isArray(slot?.path)
                  ? slot.path
                  : [];
                const liveInvalid = showLiveWord && !dailyLiveWordValid;
                const scoreLabel = slotWord
                  ? Number.isFinite(slot?.pts)
                    ? `${formatNumber(slot.pts)} pts`
                    : "0 pt"
                  : showLiveWord
                  ? dailyLiveWordValid
                    ? `${formatNumber(dailyLiveWordScore || 0)} pts`
                    : dailyLiveWordBlockedReason || "INVALIDE"
                  : "—";
                const rowIsInvalid = dailyInvalidSlot === idx && dailyInvalidPulseKey > 0;
                return (
                  <div
                    key={`daily-slot-${idx}-${rowIsInvalid ? dailyInvalidPulseKey : 0}`}
                    ref={
                      idx === 0
                        ? mobileSpecial3FirstSlotRef
                        : idx === 1
                        ? mobileSpecial3SecondSlotRef
                        : undefined
                    }
                    className={[
                      "grid grid-cols-[1fr,auto] items-center rounded-lg border",
                      isActiveSlot
                        ? darkMode
                          ? "border-amber-400/70 bg-slate-800/60"
                          : "border-amber-400 bg-amber-50"
                        : darkMode
                        ? "border-slate-700 bg-slate-900/50"
                        : "border-slate-200 bg-white",
                      rowIsInvalid && visualScreenShakeEnabled ? "daily-invalid-shake" : "",
                    ].join(" ")}
                    style={{
                      flex: "1 1 0",
                      minHeight: `${special3SlotRowMinHeightPx}px`,
                      overflow: "hidden",
                      columnGap: `${special3SlotGapPx}px`,
                      paddingLeft: `${special3SlotPadX}px`,
                      paddingRight: `${special3SlotPadX}px`,
                      paddingTop: `${special3SlotPadY}px`,
                      paddingBottom: `${special3SlotPadY}px`,
                    }}
                    onClick={() => {
                      if (!slotWord) setDailyActiveSlot?.(idx);
                    }}
                  >
                    <div className="min-w-0 overflow-hidden flex items-center">
                      {displayWord ? (
                        renderWordPreviewTiles?.(displayWord, `daily-capsule-${idx}`, displayPath)
                      ) : (
                        <div
                          className="flex items-center font-semibold opacity-60"
                          style={{
                            minHeight: `${special3PreviewTileHeightPx}px`,
                            fontSize: `${special3SlotPlaceholderFontPx}px`,
                          }}
                        >
                          Mot {idx + 1}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {slotWord ? (
                        <button
                          type="button"
                          className={`px-1 rounded-full border font-black ${
                            darkMode
                              ? "bg-slate-800 border-slate-600 text-slate-200"
                              : "bg-white border-slate-300 text-slate-700"
                          }`}
                          style={{
                            height: `${special3SlotDeleteSide}px`,
                            minWidth: `${special3SlotDeleteSide}px`,
                            fontSize: `${special3SlotScoreFontPx}px`,
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            clearDailyWordSlot?.(idx);
                          }}
                        >
                          x
                        </button>
                      ) : null}
                      <span
                        className={`text-right font-black ${liveInvalid ? "text-red-500" : ""}`}
                        style={{
                          minWidth: `${special3SlotScoreMinWidthPx}px`,
                          fontSize: `${special3SlotScoreFontPx}px`,
                        }}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          <span>{scoreLabel}</span>
                          {slotWord
                            ? renderSpecial3LengthGobbleBadge?.(slotWord)
                            : showLiveWord && dailyLiveWordValid
                            ? renderSpecial3LengthGobbleBadge?.(dailyLiveWordNorm)
                            : null}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
              <div
                className={`grid items-center ${
                  isDailyPlay ? "grid-cols-[minmax(0,1fr),auto]" : "grid-cols-[1fr]"
                }`}
                style={{
                  flexShrink: 0,
                  columnGap: `${special3SlotGapPx}px`,
                  paddingTop: `${Math.max(2, Math.round(special3SlotGapPx / 2))}px`,
                  fontSize: `${special3SlotTotalFontPx}px`,
                }}
              >
                {isDailyPlay ? (
                  <button
                    type="button"
                    className={`justify-self-start rounded-xl px-3 font-black shadow-sm transition ${
                      darkMode
                        ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        : "bg-emerald-500 text-white hover:bg-emerald-600"
                    }`}
                    style={{
                      width: "48%",
                      minWidth: 0,
                      paddingTop: `${special3ActionPadYPx}px`,
                      paddingBottom: `${special3ActionPadYPx}px`,
                      fontSize: `${special3ActionFontPx}px`,
                    }}
                    onClick={() => {
                      void submitDailyScore?.();
                    }}
                  >
                    Valider
                  </button>
                ) : null}
                <div className={isDailyPlay ? "text-right font-black min-w-0" : "text-right font-black"}>
                  Total : {formatNumber(dailyTotalScore)} pts
                </div>
              </div>
            </div>
          </div>

          <div
            className="shrink-0 flex flex-col"
            style={{ gap: `${special3SectionGapPx}px` }}
          >
            <div className="shrink-0 flex items-center justify-center">
              <div
                ref={mobileSpecial3GridWrapRef}
                className={`relative w-full ${
                  special3TutorialStep === 0 ? "special3-tutorial-focus rounded-2xl" : ""
                }`}
              >
                <MobileGrid {...mobileGridProps} celebrationOverlay={praiseOverlay} />
              </div>
            </div>
            <div
              ref={mobileSpecial3BonusTrayRef}
              className={`shrink-0 rounded-xl border shadow-sm ${
                darkMode ? "border-slate-700 bg-slate-900/90" : "border-slate-200 bg-white/90"
              } ${
                special3TutorialStep === 0 || special3TutorialStep === 1
                  ? "special3-tutorial-focus"
                  : ""
              }`}
              style={{
                minHeight: `${special3BonusTrayBaseHeightPx}px`,
                height: `${special3BonusTrayHeightPx}px`,
                maxHeight: `${special3BonusTrayMaxHeightPx}px`,
                paddingLeft: `${special3BonusTrayPadX}px`,
                paddingRight: `${special3BonusTrayPadX}px`,
                paddingTop: `${special3BonusTrayPadY}px`,
                paddingBottom: `${special3BonusTrayPadY}px`,
              }}
            >
              <div
                className="h-full flex items-center justify-center"
                style={{ gap: `${special3SlotGapPx}px` }}
              >
                {DAILY_SPECIAL_BONUSES.map((bonusKey) => renderSpecialChip?.(bonusKey))}
              </div>
            </div>
          </div>
          {special3MobileStep1Ghost}
          {special3MobileStep2TutorialOverlay}
        </div>
        {special3DragGhost}
        {special3InGameTutorialCard}
      </div>
      {mobileResultsPhaseFadeOverlay}
      {mobileRoundIntroOverlay}
      {chatOverlays}
    </>
  );
}

export default React.memo(MobileSpecial3Playing);
