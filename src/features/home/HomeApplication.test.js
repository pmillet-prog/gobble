import test from "node:test";
import assert from "node:assert/strict";

import { buildBroadcastSeenMarker } from "../../utils/accountSeenMarkers.js";
import {
  countHomeLobbyPlayers,
  getBroadcastMessageKey,
  getHomeDailyRemainingCount,
  isHomeMaintenanceActive,
  shouldShowHomeBroadcastPopup,
} from "./homeViewModel.js";

test("home view model prefers authoritative room human counts", () => {
  assert.equal(
    countHomeLobbyPlayers({
      lobbyPlayersList: [{ nick: "Fallback" }],
      players: [{ nick: "Fallback 2" }],
      roomId: "room-5x5",
      roomsStats: [{ roomId: "room-5x5", humanPlayers: 7 }],
    }),
    7
  );
});

test("home view model falls back to lobby then deduplicated live players", () => {
  assert.equal(
    countHomeLobbyPlayers({
      lobbyPlayersList: [
        { nick: "Tigre" },
        { nick: "Bot", isBot: true },
      ],
    }),
    1
  );
  assert.equal(
    countHomeLobbyPlayers({
      players: [
        { nick: "Tigre" },
        { nick: "Tigre" },
        { nick: "Test" },
        { nick: "Bot", isBot: true },
      ],
    }),
    2
  );
});

test("home view model derives daily availability and maintenance", () => {
  assert.equal(
    getHomeDailyRemainingCount({
      ready: true,
      hasPlayedFakeTwins: false,
      hasPlayedMonstrous: true,
      hasPlayedSpecial: false,
    }),
    2
  );
  assert.equal(getHomeDailyRemainingCount({ ready: false }), 0);
  assert.equal(
    isHomeMaintenanceActive({
      dailyStatus: { maintenanceMode: false },
      tournamentLobby: { maintenanceMode: true },
    }),
    true
  );
});

test("home broadcast popup requires an active eligible unseen audience", () => {
  const message = { id: "notice-7", updatedAt: "2026-09-01T08:00:00Z" };
  assert.equal(
    getBroadcastMessageKey(message),
    "notice-7:2026-09-01T08:00:00Z"
  );
  const eligible = {
    accountSeenMarkers: new Set(),
    accountSeenReady: true,
    active: true,
    isAccountAuthenticated: true,
    message,
  };
  assert.equal(shouldShowHomeBroadcastPopup(eligible), true);
  assert.equal(
    shouldShowHomeBroadcastPopup({ ...eligible, active: false }),
    false
  );
  assert.equal(
    shouldShowHomeBroadcastPopup({
      ...eligible,
      accountSeenMarkers: new Set([
        buildBroadcastSeenMarker(getBroadcastMessageKey(message)),
      ]),
    }),
    false
  );
  assert.equal(
    shouldShowHomeBroadcastPopup({ ...eligible, duelPopupMode: "team" }),
    false
  );
});
