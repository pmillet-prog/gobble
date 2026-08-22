import React from "react";
import { getViewportSize } from "../../app/adapters/deviceCapabilities.js";
import { tileScore } from "../gameLogic.js";
import { normalizeBonusLabel } from "../daily/dailySpecialModel.js";
import MobileUltraCompactPlaying from "./MobileUltraCompactPlaying.jsx";
import { UltraCompactRankingLabel } from "../../features/live/LiveRosterSatellites.jsx";

export default function MobileUltraCompactScene({ state, refs, actions, content, config }) {
  const {
    board,
    bonusEffectMultiplier,
    bonusLetterKey,
    bonusLetterScore,
    chatViewportHeight,
    darkMode,
    gridRotationTurns,
    gridShake,
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
    roundTilePointsVisible,
    score,
    selfNick,
    special3LockedStartTileSet,
    specialSolvedOverlay,
    suppressLiveChatMotion,
    tileColorPreset,
    tileMaterialClass,
    usedSet,
    rosterConfig,
  } = state;
  const {
    chatBodyLockHeightRef,
    gameViewportFreezeHeightRef,
    gridInputControllerRef,
    gridRef,
    mobileGameViewportLockRef,
    tileRefs,
  } = refs;
  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    normalizeLetterKey,
    openSettingsPanel,
  } = actions;
  const { chatOverlays, globalChatLayer, praiseOverlay } = content;
  const {
    BONUS_CLASSES,
    MOBILE_GRID_MAX_WIDTH,
    defaultTileBaseClass,
    lightGridSurfaceStyle,
    specialIndicatorPreset,
  } = config;

    const { width: viewportWidthRaw, height: viewportHeightRaw } = getViewportSize();
    const lockedGameViewportWidth =
      Number(mobileGameViewportLockRef.current?.width) || 0;
    const lockedGameViewportHeight =
      Number(mobileGameViewportLockRef.current?.height) || 0;
    const viewportWidth = lockedGameViewportWidth || viewportWidthRaw;
    const viewportHeight = lockedGameViewportHeight || viewportHeightRaw;
    const minViewportDim = Math.max(0, Math.min(viewportWidth, viewportHeight));
    const gridMaxFromViewport = Math.max(
      200,
      Math.min(minViewportDim - 8, MOBILE_GRID_MAX_WIDTH)
    );
    const mobileGridSide = Math.round(gridMaxFromViewport);
    const mobileGapPx = "clamp(4px, 1.8vw, 10px)";
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
                ((isChatOpenMobile || isChatClosing) &&
                gameViewportFreezeHeightRef.current > 0
                  ? gameViewportFreezeHeightRef.current
                  : window.innerHeight),
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
            : lockedChatHeight
            ? [lockedChatHeight]
            : [
                lockedGameViewportHeight,
                ((isChatOpenMobile || isChatClosing) &&
                gameViewportFreezeHeightRef.current > 0
                  ? gameViewportFreezeHeightRef.current
                  : window.innerHeight),
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
          ).filter((v) => Number.isFinite(v) && v > 0)
        : [];
    const mobileViewportHeight = mobileViewportHeightCandidates.length
      ? Math.min(...mobileViewportHeightCandidates)
      : 0;
    const chatViewportHeightEffective =
      chatBodyLockHeightRef.current || chatViewportHeight || mobileViewportHeight;
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
            paddingTop: "env(safe-area-inset-top)",
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
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          };

    return (
      <>
        <MobileUltraCompactPlaying
          chatOverlays={chatOverlays}
          compactRankingLabel={
            <UltraCompactRankingLabel
              rosterConfig={rosterConfig}
              score={score}
              selfNick={selfNick}
            />
          }
          darkMode={darkMode}
          mobileGridProps={{
          board,
          BONUS_CLASSES,
          bonusLetterKey,
          bonusLetterScore,
          bonusEffectMultiplier,
          darkMode,
          gridRef,
          gridShake,
          gridSize,
          gridRotationTurns,
          inputControllerRef: gridInputControllerRef,
          implodeActive,
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
          mobileViewportContainerStyle={mobileViewportContainerStyle}
          onOpenSettings={openSettingsPanel}
          praiseOverlay={praiseOverlay}        />
        {globalChatLayer}
      </>
    );
  }
