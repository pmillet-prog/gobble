import { shouldProcessLiveRoomEvent } from "../../utils/liveEventScope.js";

export function createRoundBreakHandler(runtime) {
  return function processBreakStarted({
    roomId: incomingRoomId,
    roundId: incomingRoundId,
    nextStartAt: nextTs,
    breakKind: bk = null,
    tournament: tournamentPayload = null,
    nextSpecial = null,
    tournamentSummary: summary = null,
    tournamentSummaryAt: summaryAt = null,
    targetSummary: targetSummaryPayload = null,
  }) {
    if (
      !shouldProcessLiveRoomEvent({
        appView: runtime.appViewRef.current,
        isLoggedIn: runtime.isLoggedInRef.current,
        activeRoomId: runtime.currentRoomIdRef.current,
        incomingRoomId,
      })
    ) {
      return;
    }
    runtime.setNextStartAt(nextTs || null);
    runtime.setTournamentLobby(null);
    runtime.setRoundPreparing(null);
    runtime.setBreakKind(bk);
    const isTournamentEndBreak = bk === "tournament_end";
    if (tournamentPayload && !isTournamentEndBreak) {
      runtime.ensureTournamentBaseline(tournamentPayload);
    }
    if (bk !== "tournament_end") {
      runtime.setTournamentFinaleHoldUntil(null);
    }
    if (bk) {
      runtime.phaseRef.current = "results";
      runtime.setPhase("results");
      runtime.gameplaySession?.transitionPhase?.("intermission", {
        roomId: incomingRoomId,
      });
      runtime.setServerStatus("break");
      runtime.setServerEndsAt(null);
      runtime.setServerRoundDurationMs(null);
      // Les résultats et leurs présentateurs appartiennent encore à cette manche.
      // Les anciennes snapshots sans roundId conservent celui des résultats reçus.
      if (incomingRoundId) runtime.setRoundId(incomingRoundId);
    }
    // Pendant l'écran final, conserver l'état du tournoi qui vient de se terminer.
    if (tournamentPayload && !isTournamentEndBreak) {
      runtime.setTournament(tournamentPayload);
    }
    runtime.setUpcomingSpecial(nextSpecial && nextSpecial.isSpecial ? nextSpecial : null);
    if (summary) runtime.setTournamentSummary(summary);
    runtime.setTournamentSummaryAt(summaryAt || null);
    runtime.setTargetSummary(targetSummaryPayload || null);
  };
}
