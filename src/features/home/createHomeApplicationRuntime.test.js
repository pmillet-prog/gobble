import test from "node:test";
import assert from "node:assert/strict";

import { createHomeApplicationRuntime } from "./createHomeApplicationRuntime.js";

function createConnectionHarness() {
  const handlers = new Map();
  return {
    connection: {
      off(eventName, handler) {
        if (handlers.get(eventName) === handler) handlers.delete(eventName);
      },
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
    },
    fire(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
    handlers,
  };
}

function createRefreshHarness() {
  const tasks = new Map();
  const stops = [];
  return {
    refreshScheduler: {
      schedule(name, config) {
        const task = { config, disposed: false, name };
        tasks.set(name, task);
        config.run();
        return () => {
          if (task.disposed) return;
          task.disposed = true;
          if (tasks.get(name) === task) tasks.delete(name);
          stops.push(name);
        };
      },
    },
    stops,
    tasks,
  };
}

test("home runtime owns discovery resources only while started", () => {
  const connection = createConnectionHarness();
  const refresh = createRefreshHarness();
  const calls = {
    broadcast: 0,
    daily: 0,
    lobby: 0,
    rooms: [],
  };
  const runtime = createHomeApplicationRuntime({
    connection: connection.connection,
    refreshScheduler: refresh.refreshScheduler,
  });
  runtime.configure({
    fetchBroadcastNotice: () => {
      calls.broadcast += 1;
    },
    fetchDailyStatus: () => {
      calls.daily += 1;
    },
    fetchLobbyPlayers: () => {
      calls.lobby += 1;
    },
    installId: "user:7",
    isAccountAuthenticated: true,
    roomId: "room-4x4",
    setRoomsStats: (rooms) => calls.rooms.push(rooms),
  });

  const dispose = runtime.start();
  assert.equal(typeof dispose, "function");
  assert.deepEqual([...refresh.tasks.keys()].sort(), [
    "home:broadcast-notice",
    "home:lobby-players",
  ]);
  assert.equal(calls.broadcast, 1);
  assert.equal(calls.daily, 1);
  assert.equal(calls.lobby, 1);
  assert.deepEqual([...connection.handlers.keys()], ["roomsStats"]);

  connection.fire("roomsStats", [{ roomId: "room-4x4", players: 3 }]);
  connection.fire("roomsStats", null);
  assert.deepEqual(calls.rooms, [
    [{ roomId: "room-4x4", players: 3 }],
    [],
  ]);

  dispose();
  assert.equal(connection.handlers.size, 0);
  assert.equal(refresh.tasks.size, 0);
  assert.deepEqual(refresh.stops.sort(), [
    "home:broadcast-notice",
    "home:lobby-players",
  ]);
});

test("home runtime refreshes room-scoped data without duplicating other work", () => {
  const connection = createConnectionHarness();
  const refresh = createRefreshHarness();
  let dailyCalls = 0;
  let lobbyCalls = 0;
  const runtime = createHomeApplicationRuntime({
    connection: connection.connection,
    refreshScheduler: refresh.refreshScheduler,
  });
  const configure = ({ authenticated, installId, roomId }) =>
    runtime.configure({
      fetchBroadcastNotice: () => {},
      fetchDailyStatus: () => {
        dailyCalls += 1;
      },
      fetchLobbyPlayers: () => {
        lobbyCalls += 1;
      },
      installId,
      isAccountAuthenticated: authenticated,
      roomId,
      setRoomsStats: () => {},
    });

  configure({ authenticated: false, installId: "", roomId: "room-4x4" });
  runtime.start();
  assert.equal(dailyCalls, 0);
  assert.equal(lobbyCalls, 1);

  configure({ authenticated: true, installId: "user:8", roomId: "room-4x4" });
  assert.equal(dailyCalls, 1);
  assert.equal(lobbyCalls, 1);

  configure({ authenticated: true, installId: "user:8", roomId: "room-5x5" });
  assert.equal(dailyCalls, 1);
  assert.equal(lobbyCalls, 2);
  assert.deepEqual(refresh.stops, ["home:lobby-players"]);

  runtime.stop();
});

test("home runtime owns the desktop home chat lifecycle", () => {
  const connection = createConnectionHarness();
  const refresh = createRefreshHarness();
  const homeChatOpenRef = { current: false };
  const calls = {
    botUnread: [],
    close: 0,
    subscriptions: [],
    unread: [],
  };
  const runtime = createHomeApplicationRuntime({
    connection: connection.connection,
    refreshScheduler: refresh.refreshScheduler,
  });
  const configure = ({
    chatTab = "messages",
    mobileOpen = false,
    open = true,
    roomId = "room-4x4",
  } = {}) =>
    runtime.configure({
      chatTab,
      fetchBroadcastNotice: () => {},
      fetchLobbyPlayers: () => {},
      isChatOpenMobile: mobileOpen,
      isHomeChatOpen: open,
      isHomeChatOpenRef: homeChatOpenRef,
      isMobileLayout: mobileOpen,
      roomId,
      setHomeChatBotUnreadCount: (count) => calls.botUnread.push(count),
      setHomeChatUnreadCount: (count) => calls.unread.push(count),
      setIsHomeChatOpen: (nextOpen) => {
        if (!nextOpen) calls.close += 1;
      },
      setRoomsStats: () => {},
      subscribeLobbyChat: (options) => calls.subscriptions.push(options),
    });

  configure();
  runtime.start();
  assert.equal(homeChatOpenRef.current, true);
  assert.deepEqual(calls.unread, [0]);
  assert.deepEqual(calls.botUnread, [0]);
  assert.deepEqual(calls.subscriptions, [{ force: true }]);

  configure();
  assert.deepEqual(calls.subscriptions, [{ force: true }]);

  configure({ roomId: "room-5x5" });
  assert.deepEqual(calls.subscriptions, [{ force: true }, { force: true }]);

  configure({ chatTab: "system", roomId: "room-5x5" });
  assert.deepEqual(calls.unread, [0]);

  configure({ mobileOpen: true, open: false, roomId: "room-5x5" });
  assert.deepEqual(calls.unread, [0, 0]);
  assert.deepEqual(calls.subscriptions, [
    { force: true },
    { force: true },
    { force: true },
  ]);

  runtime.stop();
  assert.equal(homeChatOpenRef.current, false);
  assert.equal(calls.close, 0);
});
