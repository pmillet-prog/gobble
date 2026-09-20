import test from "node:test";
import assert from "node:assert/strict";
import { selectAvatarMaintenanceMode } from "./avatarAvailability.js";
import { avatarApiError } from "./avatarApi.js";

test("avatar access follows the newest maintenance state across home and live", () => {
  const state = { session: { roomId: "room-4x4" }, realtime: {
    tournamentLobby: { maintenanceMode: false, serverNow: 10 },
    roomsStats: [{ roomId: "room-4x4", tournamentLobby: { maintenanceMode: true, serverNow: 20 } }],
  } };
  assert.equal(selectAvatarMaintenanceMode(state), true);
  state.realtime.tournamentLobby = { maintenanceMode: false, serverNow: 30 };
  assert.equal(selectAvatarMaintenanceMode(state), false);
  state.realtime.roomsStats = [];
  state.realtime.tournamentLobby.maintenanceMode = true;
  assert.equal(selectAvatarMaintenanceMode(state), true);
  assert.match(avatarApiError("maintenance_mode").message, /fermé pendant la mise à jour/);
});
