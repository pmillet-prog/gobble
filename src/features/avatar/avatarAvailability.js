import { resolveHomeTournamentLobby } from "../home/homeViewModel.js";

export function selectAvatarMaintenanceMode(state) {
  const realtime = state?.realtime || {};
  return !!resolveHomeTournamentLobby({
    roomId: state?.session?.roomId,
    roomsStats: realtime.roomsStats,
    tournamentLobby: realtime.tournamentLobby,
  })?.maintenanceMode;
}
