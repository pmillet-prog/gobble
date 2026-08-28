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
