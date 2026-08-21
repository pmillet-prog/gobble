import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "./createApplicationKernel.js";

test("application kernel owns boot lifecycle without React", () => {
  const initialTracks = [{ id: "initial" }];
  const resolvedTracks = [{ id: "resolved" }];
  const kernel = createApplicationKernel({ ambientTracks: initialTracks });
  let notifications = 0;
  const unsubscribe = kernel.subscribe(() => {
    notifications += 1;
  });

  assert.deepEqual(kernel.getState().boot, {
    ambientTracks: initialTracks,
    overlayVisible: true,
    ready: false,
  });

  kernel.commands.boot.resolveAmbientTracks(resolvedTracks);
  kernel.commands.boot.setReady();
  kernel.commands.boot.setOverlayVisible(false);

  assert.deepEqual(kernel.getState().boot, {
    ambientTracks: resolvedTracks,
    overlayVisible: false,
    ready: true,
  });
  assert.equal(notifications, 3);
  unsubscribe();
});

test("application navigation rejects unknown views and keeps history", () => {
  const kernel = createApplicationKernel();

  kernel.commands.navigation.go("daily");
  kernel.commands.navigation.go("not-a-view");

  assert.deepEqual(kernel.getState().navigation, {
    previousView: "home",
    view: "daily",
  });
});

test("game state is owned by the kernel and supports functional transitions", () => {
  const kernel = createApplicationKernel();

  kernel.commands.game.setScore(12);
  kernel.commands.game.setScore((score) => score + 8);
  kernel.commands.game.patch({ phase: "playing", unknown: "ignored" });

  assert.equal(kernel.getState().game.score, 20);
  assert.equal(kernel.getState().game.phase, "playing");
  assert.equal(kernel.getState().game.unknown, undefined);
});

test("session transitions are centralized and reject fields outside the contract", () => {
  const kernel = createApplicationKernel({ session: { nickname: "Tigre" } });

  kernel.commands.session.patch({
    isConnecting: true,
    nickname: "Test",
    password: "must-not-enter-state",
  });
  kernel.commands.session.setConnectionError("hors ligne");

  assert.equal(kernel.getState().session.nickname, "Test");
  assert.equal(kernel.getState().session.isConnecting, true);
  assert.equal(kernel.getState().session.connectionError, "hors ligne");
  assert.equal(kernel.getState().session.password, undefined);
});

test("realtime snapshots accept authoritative server fields as one transition", () => {
  const kernel = createApplicationKernel();
  const players = [{ nick: "Tigre", score: 42 }];

  kernel.commands.realtime.patch({
    players,
    roundId: "round-7",
    serverEndsAt: 123456,
  });

  assert.equal(kernel.getState().realtime.roundId, "round-7");
  assert.equal(kernel.getState().realtime.serverEndsAt, 123456);
  assert.equal(kernel.getState().realtime.players, players);
});

test("cross-domain transitions are atomic and keep slice contracts", () => {
  const kernel = createApplicationKernel();
  let notifications = 0;
  kernel.subscribe(() => {
    notifications += 1;
  });

  kernel.commands.transition.apply({
    game: { phase: "playing", score: 7, forbidden: true },
    navigation: { view: "live" },
    realtime: { roundId: "round-atomic" },
    session: { isLoggedIn: true },
  });

  const state = kernel.getState();
  assert.equal(state.game.phase, "playing");
  assert.equal(state.game.score, 7);
  assert.equal(state.game.forbidden, undefined);
  assert.equal(state.navigation.view, "live");
  assert.equal(state.realtime.roundId, "round-atomic");
  assert.equal(state.session.isLoggedIn, true);
  assert.equal(notifications, 1);
});
