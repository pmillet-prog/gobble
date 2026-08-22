import React from "react";
import { createPortal } from "react-dom";
import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";
import FantasyPanelShell from "../home/FantasyPanelShell.jsx";
import TrainingPlayerBadge from "../training/TrainingPlayerBadge.jsx";
import {
  formatApproximateMinutes,
  getCompactLiveRoundLabel,
} from "../../utils/liveRoundStatus.js";

const EMPTY_PLAYERS = Object.freeze([]);

function buildRoundContext(round, tournament) {
  const lobbyStatusNow = round.lobbyRoomStatus?.serverNow || Date.now();
  const lobbyRoundRemainingSeconds =
    round.lobbyRoomStatus?.roundEndsAt && Number.isFinite(round.lobbyRoomStatus.roundEndsAt)
      ? Math.max(0, Math.round((round.lobbyRoomStatus.roundEndsAt - lobbyStatusNow) / 1000))
      : null;
  const lobbyBreakRemainingSeconds =
    round.lobbyRoomStatus?.breakEndsAt && Number.isFinite(round.lobbyRoomStatus.breakEndsAt)
      ? Math.max(0, Math.round((round.lobbyRoomStatus.breakEndsAt - lobbyStatusNow) / 1000))
      : null;
  const breakKind = round.isLoggedIn
    ? round.breakKind
    : round.lobbyRoomStatus?.breakKind || null;
  const phase = round.isLoggedIn
    ? round.phase
    : round.lobbyRoomStatus?.isRoundRunning
    ? "playing"
    : "break";
  const tick = round.isLoggedIn ? round.tick : lobbyRoundRemainingSeconds;
  const breakCountdown = round.isLoggedIn
    ? round.breakCountdown
    : lobbyBreakRemainingSeconds;
  const roundDurationSeconds = Number.isFinite(round.serverRoundDurationMs)
    ? Math.max(1, Math.round(round.serverRoundDurationMs / 1000))
    : Number.isFinite(round.lobbyRoomStatus?.roundDurationMs)
    ? Math.max(1, Math.round(round.lobbyRoomStatus.roundDurationMs / 1000))
    : round.roomMeta.duration ?? round.defaultDuration;
  const roundBreakSeconds = Number.isFinite(round.lobbyRoomStatus?.breakDurationMs)
    ? Math.max(0, Math.round(round.lobbyRoomStatus.breakDurationMs / 1000))
    : round.roomMeta.breakSeconds ?? 45;
  const totalRounds = Number.isFinite(tournament.state?.totalRounds)
    ? tournament.state.totalRounds
    : Number.isFinite(round.lobbyRoomStatus?.tournamentTotalRounds)
    ? round.lobbyRoomStatus.tournamentTotalRounds
    : tournament.defaultTotalRounds;
  const roundValue =
    typeof tournament.state?.round === "number" && tournament.state.round > 0
      ? tournament.state.round
      : typeof round.lobbyRoomStatus?.tournamentRound === "number" &&
        round.lobbyRoomStatus.tournamentRound > 0
      ? round.lobbyRoomStatus.tournamentRound
      : typeof tournament.state?.nextRound === "number" && tournament.state.nextRound > 0
      ? tournament.state.nextRound
      : null;
  const currentRound =
    typeof tournament.state?.round === "number"
      ? tournament.state.round
      : typeof round.lobbyRoomStatus?.tournamentRound === "number"
      ? round.lobbyRoomStatus.tournamentRound
      : roundValue || 0;
  const serverEtaSeconds =
    !round.isLoggedIn && Number.isFinite(round.lobbyRoomStatus?.nextTournamentEtaMs)
      ? Math.max(0, round.lobbyRoomStatus.nextTournamentEtaMs / 1000)
      : null;

  let etaSeconds = null;
  if (Number.isFinite(serverEtaSeconds)) {
    etaSeconds = serverEtaSeconds;
  } else if (roundValue && totalRounds) {
    if (breakKind === "tournament_end") {
      etaSeconds = Number.isFinite(breakCountdown)
        ? Math.max(0, Math.round(breakCountdown))
        : null;
    } else if (phase === "playing" && Number.isFinite(tick)) {
      const roundsAfter = Math.max(0, totalRounds - Math.max(0, currentRound));
      etaSeconds =
        Math.max(0, Math.round(tick)) +
        roundBreakSeconds +
        roundsAfter * (roundDurationSeconds + roundBreakSeconds);
    } else if (
      (phase === "results" || phase === "break") &&
      Number.isFinite(breakCountdown)
    ) {
      const roundsLeft = Math.max(0, totalRounds - Math.max(0, currentRound));
      etaSeconds =
        Math.max(0, Math.round(breakCountdown)) +
        roundsLeft * (roundDurationSeconds + roundBreakSeconds);
    }
  }

  const tournamentInfoLine =
    !(!round.isLoggedIn && round.lobbyRoomStatus?.isTrainingRound) &&
    roundValue &&
    totalRounds
      ? `Manche ${roundValue}/${totalRounds}`
      : null;
  const currentRoundTypeLabel =
    !round.isLoggedIn && round.lobbyRoomStatus?.isRoundRunning
      ? getCompactLiveRoundLabel(
          round.lobbyRoomStatus?.roundType,
          round.lobbyRoomStatus?.roundLabel
        )
      : "";
  const currentRoundInfoLine = currentRoundTypeLabel
    ? round.lobbyRoomStatus?.isTrainingRound
      ? `Entraînement - ${currentRoundTypeLabel}`
      : `Manche en cours : ${currentRoundTypeLabel}`
    : null;
  const etaLabel = formatApproximateMinutes(etaSeconds);

  return {
    currentRoundInfoLine,
    tournamentEtaLine: etaLabel ? `Nouveau mini-tournoi dans ${etaLabel}` : null,
    tournamentInfoLine,
  };
}

export default function PlayersOverlay({ actions, appearance, directory, renderers, round, tournament }) {
  const clock = useFeatureRuntime("clock");
  const roundTick = useFeatureSelector(clock, (state) =>
    directory.open && round.isLoggedIn ? state.remainingSeconds : null
  );
  const livePlayers = useApplicationSelector((state) =>
    directory.open && round.isLoggedIn
      ? state.realtime.players
      : EMPTY_PLAYERS
  );
  if (!directory.open || typeof document === "undefined") return null;

  const entries = (
    directory.mode === "snapshot"
      ? directory.snapshot
      : round.isLoggedIn
      ? [...livePlayers].sort((a, b) =>
          String(a?.nick || "").localeCompare(String(b?.nick || ""), "fr", {
            sensitivity: "base",
          })
        )
      : directory.lobbyPlayersList
  ).filter((entry) => !directory.hideBots || !entry?.isBot);
  const context = buildRoundContext(
    round.isLoggedIn ? { ...round, tick: roundTick } : round,
    tournament
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[20160] bg-black/60 backdrop-blur-sm flex items-center justify-center px-3 py-6"
      onClick={actions.onClose}
    >
      <FantasyPanelShell
        className="relative w-full max-w-md max-h-[86vh]"
        bodyClassName="overflow-hidden"
        eyebrow={directory.mode === "snapshot" ? "Classement en cours" : "Joueurs en jeu"}
        title={`Liste des joueurs${entries.length ? ` (${entries.length})` : ""}`}
        subtitle={[
          directory.mode === "snapshot"
            ? "Photo du classement en cours (figee)"
            : "Liste alphabetique (sans score)",
          context.currentRoundInfoLine,
          context.tournamentInfoLine,
          context.tournamentEtaLine,
        ]
          .filter(Boolean)
          .join(" · ")}
        onClose={() => {
          actions.playCloseSound();
          actions.onClose();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 pb-4">
          {entries.length ? (
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
              {entries.map((entry, index) => {
                const nick = entry?.nick ? String(entry.nick) : "";
                const isReady =
                  !!entry?.readyForTournament ||
                  (Array.isArray(tournament.lobby?.readyPlayers) &&
                    tournament.lobby.readyPlayers.includes(nick));
                const profileAvailable = actions.canOpenProfile(entry);
                const rank =
                  directory.mode === "snapshot"
                    ? Number.isFinite(entry?.rank)
                      ? entry.rank
                      : index + 1
                    : null;
                const score =
                  directory.mode === "snapshot" && typeof entry?.score === "number"
                    ? entry.score
                    : null;
                const gobbleAwards =
                  directory.mode === "snapshot"
                    ? renderers.gobbleAwards(
                        nick,
                        Number.isFinite(entry?.gobbleAwardCount)
                          ? entry.gobbleAwardCount
                          : 0
                      )
                    : renderers.gobbleAwards(nick);
                const rowClassName = `flex items-center justify-between gap-3 py-2 border-b border-slate-200/60 dark:border-white/10 last:border-0 ${
                  profileAvailable
                    ? "w-full text-left cursor-pointer rounded-md px-2 hover:bg-slate-100/70 dark:hover:bg-white/10"
                    : ""
                }`;
                const content = (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      {directory.mode === "snapshot" ? (
                        <span className="w-6 text-center text-xs font-bold text-amber-500">
                          {rank}
                        </span>
                      ) : null}
                      <div className="min-w-0 flex items-center gap-2">
                        <span className={`font-semibold truncate ${renderers.nickClassName(entry, nick)}`}>
                          {nick || "Joueur"}
                        </span>
                        {entry?.afk ? (
                          <span className="text-[10px] font-extrabold italic text-red-600 dark:text-red-300">
                            AFK
                          </span>
                        ) : null}
                        {entry?.inTraining ? <TrainingPlayerBadge /> : null}
                        {isReady ? (
                          <span className="rounded-full border border-emerald-500/55 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-emerald-700 dark:text-emerald-300">
                            PRÊT
                          </span>
                        ) : null}
                        {renderers.humanDot(nick)}
                        {gobbleAwards}
                      </div>
                    </div>
                    {directory.mode === "snapshot" ? (
                      <div className="text-right text-xs font-bold tabular-nums whitespace-nowrap">
                        {score != null ? `${score} pts` : "-"}
                      </div>
                    ) : null}
                  </>
                );
                return profileAvailable ? (
                  <button
                    key={`${directory.mode}-${nick || "joueur"}-${index}`}
                    type="button"
                    className={rowClassName}
                    onClick={() => actions.onOpenProfile(entry)}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={`${directory.mode}-${nick || "joueur"}-${index}`}
                    className={rowClassName}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm opacity-70 py-8 text-center">
              {!round.isLoggedIn && directory.mode === "alpha" && directory.lobbyPlayersLoading
                ? "Chargement..."
                : "Aucun joueur pour le moment."}
            </div>
          )}
        </div>
      </FantasyPanelShell>
    </div>,
    document.body
  );
}
