import { getDefaultRoomId } from "../../app/adapters/deviceCapabilities.js";

export function countHomeLobbyPlayers({
  lobbyPlayersList = [],
  players = [],
  roomId = "",
  roomsStats = [],
} = {}) {
  const safeRooms = Array.isArray(roomsStats) ? roomsStats : [];
  const lobbyRoomId = roomId || getDefaultRoomId();
  const roomEntry = safeRooms.find((entry) => entry?.roomId === lobbyRoomId);
  if (Number.isFinite(roomEntry?.humanPlayers)) return roomEntry.humanPlayers;
  if (Array.isArray(lobbyPlayersList) && lobbyPlayersList.length) {
    return lobbyPlayersList.filter((player) => !player?.isBot).length;
  }
  const seen = new Set();
  (Array.isArray(players) ? players : []).forEach((player) => {
    if (player?.isBot) return;
    const nick = player?.nick ? String(player.nick).trim() : "";
    if (nick) seen.add(nick);
  });
  return seen.size;
}

export function getHomeDailyRemainingCount(dailyStatus) {
  if (!dailyStatus?.ready) return 0;
  return [
    !dailyStatus.hasPlayedMonstrous,
    !dailyStatus.hasPlayedSpecial,
    !dailyStatus.hasPlayedFakeTwins,
  ].filter(Boolean).length;
}

export function isHomeMaintenanceActive({ dailyStatus, tournamentLobby } = {}) {
  return !!(tournamentLobby?.maintenanceMode || dailyStatus?.maintenanceMode);
}
