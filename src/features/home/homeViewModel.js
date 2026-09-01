import { getDefaultRoomId } from "../../app/adapters/deviceCapabilities.js";
import { buildBroadcastSeenMarker } from "../../utils/accountSeenMarkers.js";

export function getBroadcastMessageKey(message) {
  if (!message || typeof message !== "object") return "";
  const idPart = typeof message.id === "string" ? message.id.trim() : "";
  const updatedPart =
    typeof message.updatedAt === "string" ? message.updatedAt.trim() : "";
  if (idPart && updatedPart) return `${idPart}:${updatedPart}`.slice(0, 140);
  if (idPart) return idPart.slice(0, 140);
  if (updatedPart) return updatedPart.slice(0, 140);
  return "";
}

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

export function shouldShowHomeBroadcastPopup({
  accountSeenMarkers,
  accountSeenReady = false,
  active = false,
  duelPopupMode = null,
  isAccountAuthenticated = false,
  isNewPlayerPopupQuiet = false,
  isTutorialOpen = false,
  message = null,
  shouldShowTutorial = false,
} = {}) {
  const marker = buildBroadcastSeenMarker(getBroadcastMessageKey(message));
  const alreadySeen =
    !isAccountAuthenticated ||
    !accountSeenReady ||
    !marker ||
    accountSeenMarkers?.has?.(marker);
  return !!(
    active &&
    !shouldShowTutorial &&
    !isTutorialOpen &&
    !isNewPlayerPopupQuiet &&
    !duelPopupMode &&
    message &&
    !alreadySeen
  );
}
