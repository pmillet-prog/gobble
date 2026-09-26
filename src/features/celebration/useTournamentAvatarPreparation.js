import React from "react";
import { useTournamentAvatarResources } from "../avatar/TournamentAvatarsProvider.jsx";
import { getTournamentPodiumEntries } from "./tournamentPodiumModel.js";
import { preloadTournamentFinale } from "./loadTournamentFinale.js";

export default function useTournamentAvatarPreparation({ enabled, tournamentId, roomId, userId, nick,
  phase, breakKind, podiumKey, summary, knownPlayers }) {
  const resources = useTournamentAvatarResources();
  const key = enabled && tournamentId ? `${userId}:${roomId || ""}:${tournamentId}` : "";
  React.useLayoutEffect(() => { resources?.configure(key); }, [resources, key]);
  React.useEffect(() => {
    if (!key || phase !== "results" || breakKind !== "tournament_end" || !summary?.ranking?.length) return;
    preloadTournamentFinale();
    resources?.preparePodium(podiumKey, getTournamentPodiumEntries(summary.ranking, { userId, nick, knownPlayers }));
  }, [resources, key, phase, breakKind, podiumKey, summary, userId, nick, knownPlayers]);
}
