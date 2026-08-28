import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createOcidFeature } from "./createOcidFeature.js";

function createEventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(eventName, listener) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
    },
    emit(eventName) {
      for (const listener of listeners.get(eventName) || []) listener();
    },
    listenerCount(eventName) {
      return listeners.get(eventName)?.size || 0;
    },
    removeEventListener(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
  };
}

test("OCID satellite owns proposal debounce, suspension flush and cleanup", () => {
  const timers = new Map();
  const emissions = [];
  const documentTarget = createEventTarget({ visibilityState: "visible" });
  const windowTarget = createEventTarget();
  const scope = createResourceScope("ocid-test");
  let nextTimerId = 1;
  const socket = {
    connected: true,
    emit(eventName, payload, callback) {
      emissions.push({ eventName, payload });
      if (eventName === "ocid:propose") {
        callback?.({ ok: true, proposal: payload.word });
      } else if (eventName === "ocid:vote") {
        callback?.({ ok: true });
      } else {
        callback?.({ ok: true });
      }
    },
  };
  const feature = createOcidFeature(
    { scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      documentTarget,
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, { callback, delayMs });
        return id;
      },
      windowTarget,
    }
  );
  feature.start();
  feature.configureRound({
    isOcidRound: true,
    phase: "playing",
    roundId: "round-1",
    socket,
  });

  assert.equal(documentTarget.listenerCount("visibilitychange"), 1);
  assert.equal(windowTarget.listenerCount("pagehide"), 1);
  feature.updateProposal("CHAT");
  feature.set("proposalPath", [0, 1, 2, 3]);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delayMs, 350);
  const [timerId, timer] = [...timers.entries()][0];
  timers.delete(timerId);
  timer.callback();
  assert.deepEqual(emissions.at(-1), {
    eventName: "ocid:propose",
    payload: { roundId: "round-1", word: "CHAT", path: [0, 1, 2, 3] },
  });
  assert.equal(feature.store.getState().proposalSubmitted, "CHAT");
  assert.equal(timers.size, 0);

  documentTarget.visibilityState = "hidden";
  documentTarget.emit("visibilitychange");
  assert.equal(emissions.at(-1).eventName, "ocid:propose");
  feature.clearProposal();
  assert.equal(emissions.at(-1).eventName, "ocid:clearProposal");
  assert.equal(feature.store.getState().proposal, "");

  feature.set("vote", { options: [] });
  assert.equal(timers.size, 0);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(windowTarget.listenerCount("pagehide"), 0);
  feature.set("vote", null);
  feature.submitVote("option-1");
  assert.equal(feature.store.getState().selectedOptionId, "option-1");
  assert.equal(feature.store.getState().statusMessage, "Vote enregistre.");

  scope.dispose();
  assert.equal(timers.size, 0);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(windowTarget.listenerCount("pagehide"), 0);
  assert.deepEqual(feature.refs.latestProposal.current, {
    roundId: null,
    word: "",
    path: [],
  });
});

test("OCID satellite owns scoped vote events and clock commands", () => {
  const handlers = new Map();
  const clock = {
    durations: [],
    endsAt: [],
    ticks: [],
  };
  const stoppedSounds = [];
  const statusMessages = [];
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
  const scope = createResourceScope("ocid-realtime-test");
  const feature = createOcidFeature({
    ports: { realtime: socket },
    scope,
  });
  const phaseLoopTestEnabledRef = { current: false };
  feature.configureRound({
    isOcidRound: true,
    phase: "playing",
    roundId: "round-1",
    socket,
  });
  feature.configureRealtime({
    appViewRef: { current: "live" },
    currentRoomIdRef: { current: "room-1" },
    getNowServerMs: () => 1000,
    isLoggedInRef: { current: true },
    phaseLoopTestEnabledRef,
    setServerEndsAt: (value) => clock.endsAt.push(value),
    setServerRoundDurationMs: (value) => clock.durations.push(value),
    setStatusMessageWithHold: (...args) => statusMessages.push(args),
    setTick: (value) => clock.ticks.push(value),
    standaloneTrainingSessionRef: { current: null },
    stopRoundEndTickSound: (options) => stoppedSounds.push(options),
  });
  feature.start();

  assert.deepEqual([...handlers.keys()].sort(), [
    "ocidVoteStarted",
    "ocidVoteUpdated",
  ]);

  socket.fire("ocidVoteStarted", {
    definition: "Définition initiale",
    options: [{ id: "option-1" }],
    roomId: "room-1",
    roundId: "round-1",
    voteEndsAt: 5000,
  });
  assert.equal(feature.store.getState().vote.roundId, "round-1");
  assert.deepEqual(stoppedSounds, [{ fadeMs: 80 }]);
  assert.deepEqual(clock, {
    durations: [4000],
    endsAt: [5000],
    ticks: [4],
  });
  assert.deepEqual(statusMessages, [["Vote OCID", 1800]]);

  socket.fire("ocidVoteUpdated", {
    definition: "Définition remplacée",
    roomId: "room-1",
    roundId: "round-1",
    voteEndsAt: 6000,
    votes: { "option-1": 2 },
  });
  assert.equal(
    feature.store.getState().vote.definition,
    "Définition initiale"
  );
  assert.equal(feature.store.getState().vote.voteEndsAt, 5000);
  assert.deepEqual(feature.store.getState().vote.votes, { "option-1": 2 });

  socket.fire("ocidVoteUpdated", {
    roomId: "room-2",
    roundId: "round-1",
    votes: { "option-1": 9 },
  });
  assert.deepEqual(feature.store.getState().vote.votes, { "option-1": 2 });

  phaseLoopTestEnabledRef.current = true;
  socket.fire("ocidVoteStarted", {
    roomId: "room-1",
    roundId: "round-2",
  });
  assert.equal(feature.store.getState().vote.roundId, "round-1");

  scope.dispose();
  assert.equal(handlers.size, 0);
  assert.deepEqual(feature.store.getState(), {
    mobileResultDismissedKey: "",
    proposal: "",
    proposalPath: [],
    proposalSubmitted: "",
    selectedOptionId: "",
    statusMessage: "",
    vote: null,
  });
});
