import test from "node:test";
import assert from "node:assert/strict";

import {
  countHomeLobbyPlayers,
  getHomeDailyRemainingCount,
  isHomeMaintenanceActive,
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
