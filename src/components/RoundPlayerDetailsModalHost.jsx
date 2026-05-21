import React, { Suspense } from "react";

const RoundPlayerDetailsModal = React.lazy(() => import("./RoundPlayerDetailsModal.jsx"));

export default function RoundPlayerDetailsModalHost({
  open,
  darkMode,
  modal,
  finalRanking,
  canOpenRoundPlayerDetails,
  canOpenPlayerProfile,
  gobbleBadgeUrl,
  isSpeedRound,
  allowScoreGobble = true,
  isSpecial3Round,
  renderSpecial3PreviewTiles,
  showWordScores,
  onNavigate,
  onSwipeSound,
  onClose,
  onOpenPlayerProfile,
  onOpenDefinition,
}) {
  if (!open) return null;
  const navEntries = Array.isArray(finalRanking)
    ? finalRanking.filter((entry) => canOpenRoundPlayerDetails(entry))
    : [];
  const navIndex = navEntries.findIndex(
    (entry) => String(entry?.nick || "").trim() === String(modal?.nick || "").trim()
  );
  const playerRank = navIndex >= 0 ? navIndex + 1 : null;
  const playerRankTotal = navEntries.length;
  const canGoPrev = navIndex > 0;
  const canGoNext = navIndex >= 0 && navIndex < navEntries.length - 1;

  return (
    <Suspense fallback={null}>
      <RoundPlayerDetailsModal
        open={open}
        darkMode={darkMode}
        playerNick={modal?.nick}
        words={modal?.words}
        allWords={modal?.allWords}
        special3Board={modal?.special3?.board || []}
        special3Slots={modal?.special3?.slots || []}
        records={modal?.records}
        anchorRect={modal?.anchorRect}
        targetBoardKey={modal?.targetBoardKey}
        targetBoardLabel={modal?.targetBoardLabel}
        targetBoardEntries={modal?.targetBoardEntries}
        playerProfileTarget={modal?.profileTarget}
        canOpenPlayerProfile={canOpenPlayerProfile(modal?.profileTarget)}
        gobbleBadgeUrl={gobbleBadgeUrl}
        isSpeedRound={isSpeedRound}
        allowScoreGobble={allowScoreGobble}
        isSpecial3Round={isSpecial3Round}
        renderSpecial3PreviewTiles={renderSpecial3PreviewTiles}
        showWordScores={showWordScores}
        playerRank={playerRank}
        playerRankTotal={playerRankTotal}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrevPlayer={
          canGoPrev
            ? () => {
                onSwipeSound();
                onNavigate(-1);
              }
            : null
        }
        onNextPlayer={
          canGoNext
            ? () => {
                onSwipeSound();
                onNavigate(1);
              }
            : null
        }
        onToggleWordViewSound={onSwipeSound}
        onClose={onClose}
        onOpenPlayerProfile={onOpenPlayerProfile}
        onOpenDefinition={onOpenDefinition}
      />
    </Suspense>
  );
}
