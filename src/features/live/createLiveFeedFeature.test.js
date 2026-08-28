import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLiveFeedFeature } from "./createLiveFeedFeature.js";

test("live feed owns its bounded content without notifying the application kernel", () => {
  const kernel = createApplicationKernel();
  const scope = createResourceScope("test:live-feed");
  const feature = createLiveFeedFeature({ scope });
  let kernelNotifications = 0;
  const unsubscribeKernel = kernel.subscribe(() => {
    kernelNotifications += 1;
  });

  feature.start();
  feature.setAnnouncements((current) => [
    ...current,
    { id: "announcement-1", text: "Record" },
  ]);
  feature.setLastWords([{ nick: "Tigre", word: "TEST" }]);

  assert.equal(kernelNotifications, 0);
  assert.equal(kernel.getState().realtime.announcements, undefined);
  assert.equal(kernel.getState().game.lastWords, undefined);
  assert.equal(feature.store.getState().announcements.length, 1);
  assert.equal(feature.store.getState().lastWords.length, 1);

  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    announcements: [],
    lastWords: [],
  });
  unsubscribeKernel();
});

test("live feed owns scoped announcements, effects and socket cleanup", () => {
  const handlers = new Map();
  const sounds = [];
  const praise = [];
  const confetti = [];
  const toasts = [];
  const socket = {
    bind(nextHandlers) {
      for (const [eventName, handler] of Object.entries(nextHandlers)) {
        handlers.set(eventName, handler);
      }
      return () => {
        for (const [eventName, handler] of Object.entries(nextHandlers)) {
          if (handlers.get(eventName) === handler) handlers.delete(eventName);
        }
      };
    },
    fire(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
  };
  const scope = createResourceScope("test:live-feed-realtime");
  const feature = createLiveFeedFeature({
    ports: { realtime: socket },
    scope,
  });
  const phaseLoopTestEnabledRef = { current: false };
  feature.configureRealtime({
    appViewRef: { current: "live" },
    buildObjectiveToastMessage: (entry) => `objectif:${entry.objectiveId}`,
    currentRoomIdRef: { current: "room-1" },
    isLoggedInRef: { current: true },
    lastGobbleAtRef: { current: 0 },
    maybePlayAnnouncementSound: (entry) => sounds.push(entry.type),
    nicknameRef: { current: "Tigre" },
    phaseLoopTestEnabledRef,
    phaseRef: { current: "playing" },
    showToast: (...args) => toasts.push(args),
    socket,
    standaloneTrainingSessionRef: { current: null },
    triggerConfettiBurst: (...args) => confetti.push(args),
    triggerPraiseFlash: (...args) => praise.push(args),
  });
  feature.start();

  assert.deepEqual([...handlers.keys()].sort(), [
    "announcement",
    "announcements",
  ]);

  socket.fire("announcement", {
    nick: "Tigre",
    roomId: "room-1",
    type: "best_possible_score",
  });
  assert.equal(feature.store.getState().announcements.length, 1);
  assert.equal(praise.length, 1);
  assert.deepEqual(confetti, [["gobble"]]);

  socket.fire("announcement", {
    nick: "Tigre",
    objectiveId: "objective-1",
    roomId: "room-1",
    type: "objective_validated",
  });
  assert.deepEqual(toasts[0], ["objectif:objective-1", 2800]);

  socket.fire("announcements", [
    {
      bonus: 20,
      nick: "Test",
      roomId: "room-1",
      type: "fake_twins_completed",
    },
    {
      bonus: 30,
      nick: "Tigre",
      roomId: "room-1",
      theme: "Nature",
      type: "culture_theme_completed",
    },
    { roomId: "room-1", type: "big_word" },
    { roomId: "room-2", type: "objective_validated" },
  ]);
  assert.equal(feature.store.getState().announcements.length, 4);
  assert.equal(sounds.length, 4);
  assert.deepEqual(toasts.slice(1), [
    ["Test complète les faux jumeaux : +20 pts", 3200],
    ["Tigre complète WikiMama Nature : +30 pts", 3200],
  ]);

  phaseLoopTestEnabledRef.current = true;
  socket.fire("announcement", {
    roomId: "room-1",
    type: "objective_validated",
  });
  assert.equal(feature.store.getState().announcements.length, 4);

  scope.dispose();
  assert.equal(handlers.size, 0);
});
