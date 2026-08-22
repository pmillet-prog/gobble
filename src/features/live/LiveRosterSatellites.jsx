import React from "react";

import RankingWidgetMobile from "../../components/RankingWidgetMobile.jsx";
import InterTournamentLobby from "../../components/live/InterTournamentLobby.jsx";
import TrainingPlayerBadge from "../../components/training/TrainingPlayerBadge.jsx";
import {
  useLivePlayerCount,
  useLiveRankingPresentation,
  useSelfReadyForTournament,
  useVisibleLivePlayers,
} from "./useLiveRosterPresentation.js";

export function LivePlayersCount({ prefix = "(", suffix = ")" }) {
  const count = useLivePlayerCount();
  return count > 0 ? `${prefix}${count}${suffix}` : null;
}

export function DesktopLiveRankingSatellite({ rosterConfig, ...widgetProps }) {
  const { rankingSource } = useLiveRankingPresentation(rosterConfig);
  return <RankingWidgetMobile {...widgetProps} fullRanking={rankingSource || []} />;
}

export function MobileLiveRankingPanel({
  assetVersion,
  canOpenPlayerProfile,
  darkMode,
  getNickClassName,
  gobbleAwardsForLive,
  highlightedPlayers,
  isDailyPlay,
  isOcidRound,
  mobileLayoutSizing,
  mobileRankingRef,
  nickDecorationKey,
  onOpenPlayerProfile,
  onOpenPlayersOverlaySnapshot,
  renderNickSuffix,
  rosterConfig,
  selfNick,
}) {
  const { rankingSource } = useLiveRankingPresentation(rosterConfig);
  const fullRanking = rankingSource || [];
  return (
    <div
      ref={mobileRankingRef}
      className="relative rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border"
      style={
        mobileLayoutSizing.rankingHeight > 0
          ? {
              height: `${Math.round(mobileLayoutSizing.rankingHeight)}px`,
              maxHeight: `${Math.round(mobileLayoutSizing.rankingHeight)}px`,
              minHeight: 0,
            }
          : undefined
      }
    >
      {!isDailyPlay && !isOcidRound ? (
        <button
          type="button"
          className={`absolute top-2 right-2 z-10 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide backdrop-blur ${
            darkMode
              ? "bg-slate-900/70 text-white border border-white/10"
              : "bg-white/80 text-slate-900 border border-slate-200"
          }`}
          onClick={() => onOpenPlayersOverlaySnapshot?.(fullRanking)}
        >
          Liste des joueurs
        </button>
      ) : null}
      <RankingWidgetMobile
        fullRanking={fullRanking}
        selfNick={selfNick}
        darkMode={darkMode}
        expanded={false}
        flatStyle={true}
        highlightedPlayers={highlightedPlayers}
        fitHeight={false}
        animateRank={false}
        assetVersion={assetVersion}
        gobbleWordAwardsByNick={gobbleAwardsForLive}
        onPlayerNickClick={onOpenPlayerProfile}
        isPlayerNickClickable={canOpenPlayerProfile}
        getNickClassName={getNickClassName}
        nickDecorationKey={nickDecorationKey}
        renderNickSuffix={renderNickSuffix}
        showGobbleWordAwards={true}
        showScores={true}
        className="h-full"
      />
    </div>
  );
}

export function MobileLobbyPlayersControls({ darkMode, getLiveNickClassName }) {
  const visiblePlayerList = useVisibleLivePlayers();
  return (
    <div className={`rounded-xl border p-3 ${darkMode ? "border-white/10 bg-slate-950/70 text-slate-100" : "border-amber-200/70 bg-white/75 text-slate-900"}`}>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-70">
        Joueurs connectés
      </div>
      {visiblePlayerList.length > 0 ? (
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
          {visiblePlayerList.map((player) => (
            <span
              key={player.nick}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                darkMode ? "border-white/10 bg-slate-900/80" : "border-amber-200/80 bg-white/75"
              }`}
            >
              <span className={getLiveNickClassName(player, player.nick)}>{player.nick}</span>
              {player?.inTraining ? <span className="ml-1 inline-flex align-middle"><TrainingPlayerBadge compact /></span> : null}
              {player?.afk ? (
                <span className="ml-1 text-[10px] font-extrabold italic text-red-600 dark:text-red-300">AFK</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-sm font-semibold opacity-60">Aucun joueur connecté.</div>
      )}
    </div>
  );
}

export function TournamentLobbyReadySatellite({
  darkMode,
  duelTeam,
  installId,
  lobby,
  onReady,
  selfNick,
}) {
  const selfReady = useSelfReadyForTournament({ installId, selfNick });
  return (
    <InterTournamentLobby
      darkMode={darkMode}
      lobby={lobby}
      onReady={onReady}
      selfReady={selfReady}
      team={duelTeam}
    />
  );
}

export function UltraCompactRankingLabel({ rosterConfig, selfNick }) {
  const { livePosition, playerCount, rankingSource } =
    useLiveRankingPresentation(rosterConfig);
  const players = Array.isArray(rankingSource)
    ? rankingSource.filter((entry) => !entry?.isPalier)
    : [];
  const total = players.length || playerCount || null;
  const rankIndex = selfNick
    ? players.findIndex((entry) => entry?.nick === selfNick)
    : -1;
  const rank = rankIndex >= 0 ? rankIndex + 1 : livePosition;
  const selfScore = rankIndex >= 0 ? players[rankIndex]?.score : null;
  return (
    <>
      {rank ? `#${rank}` : "#?"}
      {total ? `/${total}` : ""}
      {typeof selfScore === "number" ? ` · ${selfScore}` : ""}
    </>
  );
}
