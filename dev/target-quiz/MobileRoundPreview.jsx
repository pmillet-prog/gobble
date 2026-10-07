import React from "react";
import { TraceRuntimeProvider } from "../../src/features/trace/TraceRuntime.jsx";
import MobileStandardPlaying from "../../src/components/mobile/MobileStandardPlaying.jsx";
import GameCelebrationDomOverlay from "../../src/components/GameCelebrationDomOverlay.jsx";
import "../../src/styles/gameRuntime.css";

const board = "EXTRAORDINAIREAB".split("").map(letter => ({ letter }));
const used = new Set();
const special = { type: "target_long" };
const hint = { length: 14 };

export default function MobileRoundPreview({ quiz, solved, width, darkMode, onOpenDefinition, roundId, viewport = false }) {
  const gridRef = React.useRef(null);
  return <div className="fixture-mobile-round" style={{ width, maxWidth: "100%", height: viewport ? "100dvh" : 700 }}>
    <TraceRuntimeProvider><MobileStandardPlaying
      boardForRender={board} gridRef={gridRef} gridSize={4} phase="playing" roundId={roundId} clockOverrideSeconds={180}
      activeRoom={{ label: "Manche cible · aperçu local" }} countdownLines={[]} selfNick="Paul" darkMode={darkMode}
      mobileViewportContainerStyle={{ height: "100%", width: "100%", overflow: "hidden" }}
      mobileBodyHeightStyle={{ minHeight: 0 }} mobileGridSide={width - 24}
      mobileTileFontPx={30} mobileGapPx="8px" previewBlockHeight={44} previewGapPx={4}
      mobileLayoutSizing={{ targetHintHeight: 100, rankingHeight: 100, liveFeedMinHeight: 54, liveFeedHeight: 62, liveActionBarHeight: 0 }}
      defaultTileBaseClass="bg-amber-100 text-amber-950 border border-amber-600 rounded-xl"
      tileScore={() => 1} usedSet={used} presentersDisabled isTargetRound specialRound={special} specialHint={hint}
      solvedTargetWord={solved ? "EXTRAORDINAIRE" : ""} showSolvedTargetLoupe={solved}
      specialHintDisplay={solved ? "EXTRAORDINAIRE" : "E _ _ _ _ _ _ _ _ _ _ _ E"}
      onOpenDefinition={onOpenDefinition} nextHintLabel="Indice dans 10 s" showMobileLiveFeed
      targetWaitDevActive={quiz.active} onTargetWaitDevGridHostChange={quiz.setGridHost} onTargetWaitDevSideHostChange={quiz.setSideHost}
      praiseOverlay={<GameCelebrationDomOverlay hostRef={gridRef} isMobileLayout phase="playing" />}
    /></TraceRuntimeProvider>
  </div>;
}
