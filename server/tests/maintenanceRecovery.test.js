import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { extractPersistedDevControls } from "../devControlsPersistence.js";
import { emitMaintenanceStatus } from "../realtime/emitMaintenanceStatus.js";
import { createDailyFeature } from "../../src/features/daily/createDailyFeature.js";
import { createResourceScope } from "../../src/app/core/createResourceScope.js";
import { isHomeMaintenanceActive, resolveHomeTournamentLobby } from "../../src/features/home/homeViewModel.js";
import { selectAvatarMaintenanceMode } from "../../src/features/avatar/avatarAvailability.js";

test("an open client leaves maintenance after restart and can receive later manual changes", async t => {
  const connection = new EventEmitter();
  const scope = createResourceScope("maintenance-reconnect");
  t.after(() => scope.dispose());
  let resolveHttp;
  const daily = createDailyFeature({ ports: { realtime: connection }, scope }, {
    fetchImpl: () => new Promise(resolve => { resolveHttp = resolve; }),
  });
  daily.start();
  const boards = [];
  connection.on("chalkboardAvailability", payload => boards.push(payload.maintenanceMode));

  emitMaintenanceStatus(connection, true);
  const pendingRequest = daily.fetchDailyStatus({ installId: "user:7" });
  assert.equal(daily.store.getState().status.maintenanceMode, true);

  const restartedControls = extractPersistedDevControls({ controls: { maintenanceMode: true } });
  emitMaintenanceStatus(connection, restartedControls.maintenanceMode);
  assert.equal(daily.store.getState().status.maintenanceMode, false);

  // A response from before the restart must not put the still-open page back into maintenance.
  resolveHttp({ ok: true, text: async () => JSON.stringify({ ready: true, maintenanceMode: true, maintenanceMessage: "Ancienne maintenance" }) });
  await pendingRequest;
  assert.equal(daily.store.getState().status.maintenanceMode, false);
  assert.equal(daily.store.getState().status.maintenanceMessage, "");
  assert.equal(daily.store.getState().status.ready, true);

  const realtime = {
    tournamentLobby: { serverNow: 1, maintenanceMode: true },
    roomsStats: [{ roomId: "room-4x4", tournamentLobby: { serverNow: 2, maintenanceMode: false } }],
  };
  assert.equal(isHomeMaintenanceActive({
    dailyStatus: daily.store.getState().status,
    tournamentLobby: resolveHomeTournamentLobby({ ...realtime, roomId: "room-4x4" }),
  }), false);
  assert.equal(selectAvatarMaintenanceMode({ realtime, session: { roomId: "room-4x4" } }), false);

  emitMaintenanceStatus(connection, true);
  assert.equal(daily.store.getState().status.maintenanceMode, true);
  emitMaintenanceStatus(connection, false);
  assert.equal(daily.store.getState().status.maintenanceMode, false);
  assert.deepEqual(boards, [true, false, true, false]);
  connection.emit("maintenanceStatus", {});
  assert.equal(daily.store.getState().status.maintenanceMode, false);

  scope.dispose();
  assert.equal(connection.listenerCount("maintenanceStatus"), 0);
});

test("a late daily response cannot cancel maintenance enabled while it was loading", async t => {
  const connection = new EventEmitter();
  const scope = createResourceScope("maintenance-enable-during-request");
  t.after(() => scope.dispose());
  let resolveHttp;
  const daily = createDailyFeature({ ports: { realtime: connection }, scope }, {
    fetchImpl: () => new Promise(resolve => { resolveHttp = resolve; }),
  });
  daily.start();
  const request = daily.fetchDailyStatus();
  emitMaintenanceStatus(connection, true);
  resolveHttp({ ok: true, text: async () => JSON.stringify({ maintenanceMode: false }) });
  await request;
  assert.equal(daily.store.getState().status.maintenanceMode, true);
  assert.equal(daily.store.getState().status.maintenanceMessage, "Maintenance en cours");
});
