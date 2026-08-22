import React from "react";
import { getTileColorTextureStyle } from "../../theme/themeConfig.js";
import { clampValue, formatNumber } from "../../utils/numbers.js";
import { tileScore } from "../gameLogic.js";
import AutoScaleInline from "../AutoScaleInline.jsx";
import GridTileLetter from "../GridTileLetter.jsx";
import {
  DAILY_SPECIAL_BONUSES,
  DAILY_SPECIAL_WORD_TARGET,
  createDailyWordSlots,
  normalizeBonusLabel,
} from "../daily/dailySpecialModel.js";
import MobileSpecial3Playing from "./MobileSpecial3Playing.jsx";

export default function MobileSpecial3Scene({ state, refs, actions, content, config }) {
  const {
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
  } = state;
  const {
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
  } = refs;
  const {
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
  } = actions;
  const {
    chatOverlays,
    globalChatLayer,
    praiseOverlay,
    trainingSessionControls,
  } = content;
  const {
    BONUS_CLASSES,
    MOBILE_GRID_MAX_WIDTH,
    defaultTileBaseClass,
    lightGridSurfaceStyle,
    roundTilePointsVisible,
    specialIndicatorPreset,
  } = config;

    const lockedGameViewportWidth =
      Number(mobileGameViewportLockRef.current?.width) || 0;
    const lockedGameViewportHeight =
      Number(mobileGameViewportLockRef.current?.height) || 0;
    const fallbackViewportWidth =
      lockedGameViewportWidth ||
      mobileLayoutSizing.viewportWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 360);
    const mobileGridSide = Math.round(
      Math.max(
        180,
        (
          mobileLayoutSizing.gridSide ||
          Math.max(200, Math.min(fallbackViewportWidth - 24, MOBILE_GRID_MAX_WIDTH))
        ) * 0.9
      )
    );
    const special3BodyHeight = Math.max(
      mobileGridSide,
      Math.round(
        mobileLayoutSizing.bodyHeight ||
          (mobileGridSide > 0 ? mobileGridSide * 1.7 : 0)
      )
    );
    const special3BodyRatio =
      mobileGridSide > 0 ? special3BodyHeight / Math.max(1, mobileGridSide) : 1.7;
    const special3Roominess = clampValue((special3BodyRatio - 1.46) / 0.42, 0, 1);
    const mixSpecial3Size = (compactValue, roomyValue) =>
      compactValue + (roomyValue - compactValue) * special3Roominess;
    const special3SidePadPx = Math.round(mixSpecial3Size(10, 12));
    const special3TopPadPx = Math.round(mixSpecial3Size(4, 6));
    const special3BottomPadPx = Math.round(mixSpecial3Size(6, 8));
    const special3SectionGapPx = Math.round(mixSpecial3Size(6, 8));
    const special3SlotGapPx = Math.round(mixSpecial3Size(4, 6));
    const special3MetaFontPx = Math.round(mixSpecial3Size(10, 11));
    const special3SettingsButtonSide = Math.round(mixSpecial3Size(28, 32));
    const special3SettingsIconPx = Math.round(mixSpecial3Size(18, 20));
    const special3TimerFontPx = Math.round(
      clampValue(mobileGridSide * mixSpecial3Size(0.082, 0.104), 28, 44)
    );
    const special3TimerTopMarginPx = Math.round(mixSpecial3Size(2, 4));
    const special3ChatButtonSide = Math.round(
      clampValue(mobileGridSide * mixSpecial3Size(0.102, 0.124), 38, 50)
    );
    const special3ChatBadgeSide = Math.round(mixSpecial3Size(16, 18));
    const special3SecondsFontPx = Math.round(mixSpecial3Size(10, 11));
    const special3ProgressHeightPx = Math.round(mixSpecial3Size(5, 8));
    const special3ProgressTopMarginPx = Math.round(mixSpecial3Size(6, 8));
    const special3SlotPadY = Math.round(mixSpecial3Size(4, 6));
    const special3SlotPadX = Math.round(mixSpecial3Size(8, 10));
    const special3SlotDeleteSide = Math.round(mixSpecial3Size(22, 24));
    const special3SlotPlaceholderFontPx = Math.round(mixSpecial3Size(11, 12));
    const special3SlotScoreFontPx = Math.round(mixSpecial3Size(11, 12));
    const special3SlotScoreMinWidthPx = Math.round(mixSpecial3Size(60, 72));
    const special3SlotTotalFontPx = Math.round(mixSpecial3Size(13, 14));
    const special3ActionFontPx = Math.round(mixSpecial3Size(12, 13));
    const special3ActionPadYPx = Math.round(mixSpecial3Size(6, 8));
    const special3BonusTrayPadY = Math.round(mixSpecial3Size(3, 5));
    const special3BonusTrayPadX = Math.round(mixSpecial3Size(8, 10));
    const special3BonusChipSide = Math.round(
      clampValue(mobileGridSide * mixSpecial3Size(0.108, 0.138), 42, 58)
    );
    const special3BonusChipFontPx = Math.round(
      clampValue(special3BonusChipSide * 0.28, 12, 16)
    );
    const special3BonusChipRadiusPx = Math.round(mixSpecial3Size(12, 16));
    const special3BonusCheckSide = Math.round(mixSpecial3Size(16, 20));
    const special3BonusCheckFontPx = Math.round(mixSpecial3Size(9, 10));
    const special3PreviewTileBaseHeightPx = Math.round(mixSpecial3Size(20, 24));
    const special3PreviewTileBaseFontPx = Math.round(mixSpecial3Size(11, 13));
    const special3PreviewBadgeFontPx = Math.round(mixSpecial3Size(7, 8));
    const special3BonusTrayBaseHeightPx = Math.round(
      special3BonusChipSide + Math.max(2, special3BonusTrayPadY)
    );
    const special3BonusTrayMaxHeightPx = Math.round(special3BonusTrayBaseHeightPx * 2.1);
    const special3HeaderRowHeightPx = Math.max(
      special3SettingsButtonSide,
      special3ChatButtonSide,
      special3TimerFontPx,
      Math.round(special3MetaFontPx * 2.2)
    );
    const special3HeaderBlockHeightPx =
      special3TopPadPx +
      special3HeaderRowHeightPx +
      special3ProgressTopMarginPx +
      special3ProgressHeightPx +
      Math.max(4, special3TopPadPx - 1);
    const special3ActionHeightPx = isDailyPlay
      ? Math.round(special3ActionPadYPx * 2 + special3ActionFontPx * 1.25)
      : 0;
    const special3DesiredSlotsMinHeightPx = Math.round(
      clampValue(mobileGridSide * 0.34, 112, 156)
    );
    const special3HostEstimatedHeightPx = Math.max(
      0,
      special3BodyHeight - special3HeaderBlockHeightPx
    );
    const special3BottomFixedMinHeightPx =
      mobileGridSide +
      special3BonusTrayBaseHeightPx +
      special3ActionHeightPx +
      special3SectionGapPx * (isDailyPlay ? 2 : 1);
    const special3BonusExtraPx = Math.max(
      0,
      special3HostEstimatedHeightPx -
        special3BottomFixedMinHeightPx -
        special3DesiredSlotsMinHeightPx
    );
    const special3BonusTrayHeightPx = Math.round(
      clampValue(
        special3BonusTrayBaseHeightPx + special3BonusExtraPx * 0.44,
        special3BonusTrayBaseHeightPx,
        special3BonusTrayMaxHeightPx
      )
    );
    const special3BonusChipExtraPx = Math.max(
      0,
      special3BonusTrayHeightPx - special3BonusTrayBaseHeightPx
    );
    const special3BonusChipMaxByTrayPx = Math.max(
      special3BonusChipSide,
      special3BonusTrayHeightPx - special3BonusTrayPadY * 2
    );
    const special3BonusChipMaxByWidthPx = Math.floor(
      (mobileGridSide -
        special3BonusTrayPadX * 2 -
        special3SlotGapPx * Math.max(DAILY_SPECIAL_BONUSES.length - 1, 0)) /
        Math.max(DAILY_SPECIAL_BONUSES.length, 1)
    );
    const special3BonusChipRenderSidePx = Math.round(
      clampValue(
        special3BonusChipSide + special3BonusChipExtraPx * 0.18,
        special3BonusChipSide,
        Math.min(
          special3BonusChipMaxByTrayPx,
          special3BonusChipMaxByWidthPx,
          Math.round(special3BonusChipSide * 1.22)
        )
      )
    );
    const special3BonusChipRenderFontPx = Math.round(
      clampValue(special3BonusChipRenderSidePx * 0.28, 12, 20)
    );
    const special3BonusChipRenderRadiusPx = Math.round(
      clampValue(special3BonusChipRenderSidePx * 0.28, 12, 18)
    );
    const special3BonusCheckRenderSidePx = Math.round(
      clampValue(special3BonusChipRenderSidePx * 0.34, 16, 24)
    );
    const special3BonusCheckRenderFontPx = Math.round(
      clampValue(special3BonusCheckRenderSidePx * 0.52, 9, 12)
    );
    const special3ValidationBlockMinHeightPx = Math.max(
      special3DesiredSlotsMinHeightPx,
      special3PreviewTileBaseHeightPx * 3 + special3SlotGapPx * 3 + special3SlotPadY * 8
    );
    const special3EstimatedValidationHeightPx = Math.max(
      special3ValidationBlockMinHeightPx,
      special3HostEstimatedHeightPx -
        mobileGridSide -
        special3BonusTrayHeightPx -
        special3ActionHeightPx -
        special3SectionGapPx * (isDailyPlay ? 2 : 1)
    );
    const special3PreviewTileHeightPx = Math.round(
      clampValue(
        ((special3EstimatedValidationHeightPx -
          special3SlotGapPx * 2 -
          special3SlotPadY * 6 -
          special3SlotTotalFontPx * 1.4) /
          3) *
          0.56,
        special3PreviewTileBaseHeightPx,
        30
      )
    );
    const special3PreviewTileFontPx = Math.round(
      clampValue(
        special3PreviewTileBaseFontPx + (special3PreviewTileHeightPx - special3PreviewTileBaseHeightPx) * 0.24,
        special3PreviewTileBaseFontPx,
        15
      )
    );
    const special3SlotRowMinHeightPx = Math.round(
      clampValue(
        (special3ValidationBlockMinHeightPx -
          special3SlotGapPx * 2 -
          special3SlotPadY * 2 -
          special3SlotTotalFontPx * 1.4) /
          3,
        special3PreviewTileBaseHeightPx + special3SlotPadY * 2,
        54
      )
    );
    const mobileGapPx = "clamp(6px, 2.4vw, 14px)";
    const mobileTileFontPx = Math.max(
      18,
      Math.min(
        32,
        Math.round((mobileGridSide / Math.max(gridSize, 1)) * 0.35)
      )
    );
    const useVisualViewport = !(isChatOpenMobile || isChatClosing);
    const lockedChatHeight = chatBodyLockHeightRef.current || null;
    const mobileViewportHeightCandidates =
      typeof window !== "undefined"
        ? (useVisualViewport
            ? [
                lockedGameViewportHeight,
                mobileLayoutSizing.viewportHeight,
                window.innerHeight,
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
            : lockedChatHeight
            ? [lockedChatHeight]
            : [
                lockedGameViewportHeight,
                window.innerHeight,
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
          ).filter((v) => Number.isFinite(v) && v > 0)
        : [];
    const mobileViewportHeight = mobileViewportHeightCandidates.length
      ? Math.min(...mobileViewportHeightCandidates)
      : 0;
    // Do not feed the measured header bottom back into the fullscreen container padding:
    // on some mobile browsers this creates a self-referential layout loop.
    const fullscreenTopPadding = "env(safe-area-inset-top)";
    const mobileViewportContainerStyle =
      mobileViewportHeight > 0
        ? {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: `${Math.round(mobileViewportHeight)}px`,
            height: `${Math.round(mobileViewportHeight)}px`,
            maxHeight: `${Math.round(mobileViewportHeight)}px`,
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: fullscreenTopPadding,
            paddingBottom: "env(safe-area-inset-bottom)",
          }
        : {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: "100vh",
            height: "100dvh",
            maxHeight: "100dvh",
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: fullscreenTopPadding,
            paddingBottom: "env(safe-area-inset-bottom)",
          };
    const maxDurationSec = Number.isFinite(serverRoundDurationMs)
      ? Math.max(1, Math.round(serverRoundDurationMs / 1000))
      : 90;
    const slots = dailyWordSlotsScored.length
      ? dailyWordSlotsScored
      : createDailyWordSlots();
    const filledCount = slots.filter((slot) => String(slot?.word || "").trim()).length;
    const activeSlotResolved = getDailyActiveSlotIndex(slots, safeDailySlotIndex);
    const previewIsSquareMaterial = String(tileMaterialClass || "").includes("theme-material-square");
    const renderWordPreviewTiles = (wordValue, keyPrefix, pathValue = []) => {
      const value = String(wordValue || "");
      if (!value) return null;
      const safePath = Array.isArray(pathValue) ? pathValue : [];
      const canUsePath =
        safePath.length > 0 &&
        Array.isArray(boardForRender) &&
        safePath.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < boardForRender.length);
      const tiles = canUsePath
        ? safePath.map((boardIndex, idx) => {
            const cell = boardForRender[boardIndex] || {};
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
      return (
        <div
          className="flex items-center overflow-hidden"
          style={{ minHeight: 0, maxHeight: "100%" }}
        >
          <AutoScaleInline
            minScale={0.42}
            estimatedContentWidth={
              tiles.length * special3PreviewTileHeightPx +
              Math.max(0, tiles.length - 1) * 4
            }
            className="gap-1"
          >
            {tiles.map((tile, idx) => {
              const angle = ((idx * 17 + tiles.length * 13) % 11) - 5;
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
                    "tile-cell relative inline-flex items-center justify-center rounded-md px-1.5 font-black select-none",
                    tileMaterialClass,
                    tileBaseClass,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    height: `${special3PreviewTileHeightPx}px`,
                    minWidth: `${special3PreviewTileHeightPx}px`,
                    maxHeight: "100%",
                    fontSize: `${special3PreviewTileFontPx}px`,
                    transform: `rotate(${angle}deg)`,
                    pointerEvents: "none",
                    ...textureStyle,
                  }}
                >
                  <GridTileLetter cell={tile} className={letterRingClass} />
                  {displayBonus && useBadgeIndicator ? (
                    <span
                      className={`absolute top-0 right-0 rounded-full shadow ${getBonusBadgeClass(
                        displayBonus
                      )}`}
                      aria-hidden="true"
                      style={{
                        width: `${Math.max(8, Math.round(special3PreviewTileHeightPx * 0.28))}px`,
                        height: `${Math.max(8, Math.round(special3PreviewTileHeightPx * 0.28))}px`,
                        transform: previewIsSquareMaterial
                          ? "translate(-25%, 25%)"
                          : "translate(25%, -25%)",
                      }}
                    />
                  ) : null}
                </span>
              );
            })}
          </AutoScaleInline>
        </div>
      );
    };
    const renderSpecialChip = (bonusKey) => {
      const placedIndex = Number.isInteger(dailySpecialPlacements?.[bonusKey])
        ? dailySpecialPlacements[bonusKey]
        : null;
      const useFillIndicator = specialIndicatorPreset === "fill";
      const useRingIndicator = specialIndicatorPreset === "ring";
      const useBadgeIndicator = specialIndicatorPreset === "badge";
      const baseClass = useFillIndicator
        ? BONUS_CLASSES[bonusKey]
        : defaultTileBaseClass;
      const ringClass = useRingIndicator
        ? getBonusLetterRingClass(bonusKey)
        : "";
      return (
        <button
          key={`daily-special-${bonusKey}-${dailyLockPulseKey}`}
          type="button"
          className={[
            "relative border shadow-sm select-none touch-none",
            "flex items-center justify-center font-black",
            tileMaterialClass,
            baseClass,
            placedIndex != null ? "ring-2 ring-emerald-400/80" : "",
            special3TutorialStep === 0 ? "special3-tutorial-pulse" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onPointerDown={(e) => beginDailySpecialDrag(e, bonusKey)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label={`Tuile ${bonusKey}`}
          style={{
            height: `${special3BonusChipRenderSidePx}px`,
            width: `${special3BonusChipRenderSidePx}px`,
            minWidth: `${special3BonusChipRenderSidePx}px`,
            borderRadius: `${special3BonusChipRenderRadiusPx}px`,
            fontSize: `${special3BonusChipRenderFontPx}px`,
          }}
        >
          <span className={`tile-letter ${ringClass}`.trim()}>{bonusKey}</span>
          {useFillIndicator || useBadgeIndicator ? (
            <span
              className={`absolute top-0 right-0 text-[0.6rem] px-1 py-0.5 rounded-full font-black shadow ${getBonusBadgeClass(
                bonusKey
              )}`}
              style={{
                fontSize: `${special3PreviewBadgeFontPx}px`,
                transform: "translate(10%, -10%)",
              }}
            >
              {bonusKey}
            </span>
          ) : null}
          {placedIndex != null ? (
            <span
              className="absolute -top-1 -right-1 px-1 rounded-full bg-emerald-500 text-white font-black flex items-center justify-center"
              style={{
                height: `${special3BonusCheckRenderSidePx}px`,
                minWidth: `${special3BonusCheckRenderSidePx}px`,
                fontSize: `${special3BonusCheckRenderFontPx}px`,
              }}
            >
              ✓
            </span>
          ) : null}
        </button>
      );
    };

    return (
      <>
        <MobileSpecial3Playing
          DAILY_SPECIAL_BONUSES={DAILY_SPECIAL_BONUSES}
          DAILY_SPECIAL_WORD_TARGET={DAILY_SPECIAL_WORD_TARGET}
          activeSlotResolved={activeSlotResolved}
          allSoundOn={allSoundOn}
          chatOverlays={chatOverlays}
          clearDailyWordSlot={clearDailyWordSlot}
          dailyInvalidPulseKey={dailyInvalidPulseKey}
          dailyInvalidSlot={dailyInvalidSlot}
          dailyLiveWordBlockedReason={dailyLiveWordBlockedReason}
          dailyLiveWordNorm={dailyLiveWordNorm}
          dailyLiveWordScore={dailyLiveWordScore}
          dailyLiveWordValid={dailyLiveWordValid}
          dailyTotalScore={dailyTotalScore}
          darkMode={darkMode}
          filledCount={filledCount}
          formatNumber={formatNumber}
          highlightPath={highlightPath}
          isDailyPlay={isDailyPlay}
          isLoggedIn={isLoggedIn}
          isStandaloneTraining={!!standaloneTrainingSession}
          liveWord={liveWord}
          mobileChatUnreadIsBotOnly={mobileChatUnreadIsBotOnly}
          mobileChatUnreadCount={mobileChatUnreadCount}
          mobileGridProps={{
          board: boardForRender,
          BONUS_CLASSES,
          bonusLetterKey,
          bonusLetterScore,
          bonusEffectMultiplier,
          darkMode,
          gridRef,
          gridSize,
          implodeActive,
          gridRotationTurns,
          inputControllerRef: gridInputControllerRef,
          handleMouseDown,
          handleMouseMove,
          handleMouseUp,
          handleTouchEnd,
          handleTouchMove,
          handleTouchStart,
          hintCellSet,
          hintOutlineCellSet,
          isMobileLayout,
          lightGridSurfaceStyle,
          MOBILE_LAYOUT_MAX_WIDTH: MOBILE_GRID_MAX_WIDTH,
          mobileGapPx,
          mobileGridSide,
          mobileTileFontPx,
          normalizeBonusLabel,
          normalizeLetterKey,
          phase,
          specialIndicatorPreset,
          specialSolvedOverlay,
          introHideTiles: mobileRoundIntroHideTiles,
          defaultTileBaseClass,
          tilePointsVisible: roundTilePointsVisible,
          tileRefs,
          tileMaterialClass,
          tileColorPreset,
          tileScore,
          usedSet,
          specialStartTileSet: special3LockedStartTileSet,
        }}
          mobileResultsPhaseFadeOverlay={
            suppressLiveChatMotion ? null : mobileResultsPhaseFadeOverlay
          }
          mobileRoundIntroOverlay={suppressLiveChatMotion ? null : mobileRoundIntroOverlay}
          mobileSpecial3BonusTrayRef={mobileSpecial3BonusTrayRef}
          mobileSpecial3FirstSlotRef={mobileSpecial3FirstSlotRef}
          mobileSpecial3GridWrapRef={mobileSpecial3GridWrapRef}
          mobileSpecial3SecondSlotRef={mobileSpecial3SecondSlotRef}
          mobileSpecial3TutorialHostRef={mobileSpecial3TutorialHostRef}
          mobileViewportContainerStyle={mobileViewportContainerStyle}
          onOpenSettings={openSettingsPanel}
          praiseOverlay={praiseOverlay}
          maxDurationSec={maxDurationSec}
          trainingControls={trainingSessionControls}
          getNickClassName={getLiveNickClassName}
          renderSpecial3LengthGobbleBadge={renderSpecial3LengthGobbleBadge}
          renderSpecialChip={renderSpecialChip}
          renderWordPreviewTiles={renderWordPreviewTiles}
          resolveLiveTrace={resolveSpecial3LiveTrace}
          requestOpenChat={requestOpenChat}
          setDailyActiveSlot={setDailyActiveSlot}          slots={slots}
          special3ActionFontPx={special3ActionFontPx}
          special3ActionPadYPx={special3ActionPadYPx}
          special3BonusTrayBaseHeightPx={special3BonusTrayBaseHeightPx}
          special3BonusTrayHeightPx={special3BonusTrayHeightPx}
          special3BonusTrayMaxHeightPx={special3BonusTrayMaxHeightPx}
          special3BonusTrayPadX={special3BonusTrayPadX}
          special3BonusTrayPadY={special3BonusTrayPadY}
          special3BottomPadPx={special3BottomPadPx}
          special3ChatBadgeSide={special3ChatBadgeSide}
          special3ChatButtonSide={special3ChatButtonSide}
          special3DragGhost={special3DragGhost}
          special3InGameTutorialCard={special3InGameTutorialCard}
          special3MetaFontPx={special3MetaFontPx}
          special3MobileStep1Ghost={special3MobileStep1Ghost}
          special3MobileStep2TutorialOverlay={special3MobileStep2TutorialOverlay}
          special3PreviewTileHeightPx={special3PreviewTileHeightPx}
          special3ProgressHeightPx={special3ProgressHeightPx}
          special3ProgressTopMarginPx={special3ProgressTopMarginPx}
          special3SectionGapPx={special3SectionGapPx}
          special3SettingsButtonSide={special3SettingsButtonSide}
          special3SettingsIconPx={special3SettingsIconPx}
          special3SidePadPx={special3SidePadPx}
          special3SlotDeleteSide={special3SlotDeleteSide}
          special3SlotGapPx={special3SlotGapPx}
          special3SlotPadX={special3SlotPadX}
          special3SlotPadY={special3SlotPadY}
          special3SlotPlaceholderFontPx={special3SlotPlaceholderFontPx}
          special3SlotRowMinHeightPx={special3SlotRowMinHeightPx}
          special3SlotScoreFontPx={special3SlotScoreFontPx}
          special3SlotScoreMinWidthPx={special3SlotScoreMinWidthPx}
          special3SlotTotalFontPx={special3SlotTotalFontPx}
          special3TimerFontPx={special3TimerFontPx}
          special3TimerTopMarginPx={special3TimerTopMarginPx}
          special3TopPadPx={special3TopPadPx}
          special3TutorialStep={special3TutorialStep}
          special3ValidationBlockMinHeightPx={special3ValidationBlockMinHeightPx}
          submitDailyScore={submitDailyScore}
          toggleDarkModeQuick={toggleDarkModeQuick}
          toggleSoundQuick={toggleSoundQuick}
          visualScreenShakeEnabled={visualScreenShakeEnabled}
        />
        {globalChatLayer}
      </>
    );
  }
