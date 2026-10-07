import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESENTER_HINT_KEYS,
  createPresenterHintsController,
} from "./createPresenterHintsController.js";
import { getResultsPresenterDisabledReason } from "./resultsPresenterAvailability.js";

test("results presenters reject every activation until vocabulary has settled", () => {
  const controller = createPresenterHintsController({ storage: null });
  const activations = [];
  const interruptions = [];
  controller.setScope("round-8", "results");
  for (const key of Object.values(PRESENTER_HINT_KEYS)) {
    controller.markAvailable(key, "round-8");
    controller.subscribeRequests(key, () => activations.push(key));
    controller.subscribeInterruptions(key, () => interruptions.push(key));
    assert.equal(controller.request(key), false, `${key} is locked before any vocabulary decision`);
  }
  assert.deepEqual(activations, []);
  assert.deepEqual(interruptions, []);
  assert.equal(controller.getSnapshot().entries.pivot.pending, true);
  controller.setResultsAvailability({ roundId: "round-8", vocabReady: false });
  assert.equal(controller.request("pivot"), false);
  assert.match(getResultsPresenterDisabledReason(controller.getSnapshot(), "pivot"), /vocabulaire/);
  controller.setResultsAvailability({ roundId: "round-8", vocabReady: true });
  assert.equal(controller.request("pivot"), true);
  assert.equal(getResultsPresenterDisabledReason(controller.getSnapshot(), "pivot"), "");
  controller.setScope("round-9", "results");
  controller.markAvailable("pivot", "round-9");
  assert.equal(controller.request("pivot"), false, "previous round readiness cannot unlock the next round");
});

test("QPUC lets Julien answer after vocabulary and unlocks the other presenter only on answer reveal", () => {
  const controller = createPresenterHintsController({ storage: null });
  controller.setScope("round-8", "results");
  controller.markAvailable("lepers", "round-8");
  controller.markAvailable("pivot", "round-8");
  controller.setResultsAvailability({ roundId: "round-8", vocabReady: true, lepersAnswerExpected: true });
  assert.equal(controller.request("lepers"), true);
  assert.equal(controller.request("pivot"), false);
  assert.match(getResultsPresenterDisabledReason(controller.getSnapshot(), "pivot"), /Julien/);
  for (const event of [
    { kind: "challenge", roundId: "round-8", text: "Question" },
    { kind: "solved", roundId: "round-8", text: "Bravo" },
    { kind: "answer", roundId: "round-7", text: "Ancienne réponse" },
    { roundId: "round-8", text: "Bilan du tournoi" },
  ]) {
    assert.equal(controller.markLepersAnswerRevealed(event), false);
    assert.equal(controller.request("pivot"), false);
  }
  const answer = { kind: "answer", roundId: "round-8", text: "Il fallait trouver CHIEN." };
  assert.equal(controller.markLepersAnswerRevealed(answer), true);
  assert.equal(controller.request("pivot"), true);
  assert.equal(controller.markLepersAnswerRevealed(answer), false);
  controller.setScope("round-8", "results");
  assert.equal(controller.request("pivot"), true, "re-registering the results surface preserves the answer");
  controller.setRound("round-9");
  controller.setResultsAvailability({ roundId: "round-9", vocabReady: true, lepersAnswerExpected: true });
  controller.markAvailable("pivot", "round-9");
  assert.equal(controller.request("pivot"), false);
});

test("presenter hints stay replayable after their unread dot is cleared", () => {
  const controller = createPresenterHintsController();
  const requests = [];
  controller.setRound("round-3");
  controller.subscribeRequests(PRESENTER_HINT_KEYS.romejko, (request) => {
    requests.push(request);
  });

  assert.equal(
    controller.markAvailable(PRESENTER_HINT_KEYS.romejko, "round-3"),
    true,
  );
  assert.deepEqual(controller.getSnapshot().entries.romejko, {
    hasHint: true,
    pending: true,
    stunned: false,
  });

  const request = { originRect: { height: 64, left: 24, top: 700, width: 64 } };
  assert.equal(controller.request(PRESENTER_HINT_KEYS.romejko, request), true);
  assert.equal(controller.request(PRESENTER_HINT_KEYS.romejko), true);
  assert.deepEqual(requests, [request, null]);
  assert.deepEqual(controller.getSnapshot().entries.romejko, {
    hasHint: true,
    pending: false,
    stunned: false,
  });
});

test("the presenter channel retains Pivot independently from chat", () => {
  let realtimeHandlers = {};
  const controller = createPresenterHintsController({
    realtime: {
      bind(handlers) {
        realtimeHandlers = handlers;
        return () => {
          realtimeHandlers = {};
        };
      },
    },
  });
  const events = [];
  controller.start();
  controller.setScope("round-2", "playing");
  controller.subscribeInterventions(PRESENTER_HINT_KEYS.pivot, (event) => {
    events.push(event);
  });

  realtimeHandlers.presenterIntervention({
    id: "round-2:pivot",
    roundId: "round-2",
    text: "Une étymologie.",
    meta: { category: "linguist" },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].id, "round-2:pivot");
  assert.equal(controller.getSnapshot().entries.pivot.hasHint, true);
  controller.setScope("round-2", "results");
  assert.equal(controller.getSnapshot().entries.pivot.hasHint, true);
});

test("the tournament culture summary is routed to Lepers", () => {
  const controller = createPresenterHintsController();
  const events = [];
  controller.setScope("tournament:42:celebration", "tournament_celebration");
  controller.subscribeInterventions(PRESENTER_HINT_KEYS.lepers, (event) => {
    events.push(event);
  });

  controller.hydrateInterventions([
    {
      id: "tournament:42:lepers",
      roundId: "tournament:42:celebration",
      text: "Nous avons une championne cette semaine : Alice !",
      meta: { category: "culture" },
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].id, "tournament:42:lepers");
  assert.equal(
    controller.getLatestIntervention(PRESENTER_HINT_KEYS.lepers)?.id,
    "tournament:42:lepers",
  );
  assert.equal(controller.getSnapshot().entries.lepers.hasHint, true);
});

test("Bafouille shares the results slot while identity survives activation, stun and reconnect", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const controller = createPresenterHintsController({ storage });
  const event = { id: "r2:bafouille", roundId: "r2", text: "On pouvait aussi trouver RARES, pluriel de RARE : Une surprise.", meta: { category: "humorist", formText: "RARES, pluriel de " } };
  controller.hydrateInterventions([event]);
  controller.setScope("r2", "results");
  assert.equal(controller.getSnapshot().entries.pivot.presenterKey, "bafouille");
  const presentations = [];
  controller.subscribeInterventions("pivot", event => presentations.push(event));
  controller.request("pivot");
  assert.equal(presentations.at(-1).formText, event.meta.formText);
  controller.markAvailable("pivot", "r2");
  controller.markStunned("pivot");
  assert.equal(controller.getSnapshot().entries.pivot.presenterKey, "bafouille");
  assert.equal(controller.request("pivot"), false);
  const restored = createPresenterHintsController({ storage });
  restored.hydrateInterventions([event]); restored.setScope("r2", "results");
  assert.equal(restored.getSnapshot().entries.pivot.presenterKey, "bafouille");
  assert.equal(restored.getSnapshot().entries.pivot.stunned, true);
  controller.setScope("r3", "results");
  assert.equal(controller.getSnapshot().entries.pivot.hasHint, false);
  controller.hydrateInterventions([{ id: "r3:pinot", roundId: "r3", text: "Étymologie.", meta: { category: "linguist" } }]);
  assert.equal(controller.getSnapshot().entries.pivot.presenterKey, "pivot");
  assert.equal(controller.getSnapshot().entries.pivot.stunned, false);
  let updates = 0; controller.subscribe(() => updates++);
  controller.hydrateInterventions([{ ...event, id: "r3:replacement", roundId: "r3" }]);
  assert.equal(controller.getSnapshot().entries.pivot.presenterKey, "bafouille");
  assert.equal(updates, 1, "an identity change must notify the button even when the hint flags are unchanged");
});

test("requesting a presenter interrupts the other active presenter", () => {
  const controller = createPresenterHintsController();
  const interruptions = [];
  controller.setScope("round-2", "playing");
  controller.markAvailable(PRESENTER_HINT_KEYS.romejko, "round-2");
  controller.markAvailable(PRESENTER_HINT_KEYS.capello, "round-2");
  controller.subscribeInterruptions(PRESENTER_HINT_KEYS.romejko, (event) => {
    interruptions.push(event.nextKey);
  });

  assert.equal(controller.request(PRESENTER_HINT_KEYS.capello), true);
  assert.deepEqual(interruptions, [PRESENTER_HINT_KEYS.capello]);
});

test("a stunned presenter stays unavailable until the presentation scope changes", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const controller = createPresenterHintsController({ storage });
  controller.setScope("round-2", "playing");
  controller.markAvailable(PRESENTER_HINT_KEYS.capello, "round-2");
  controller.markStunned(PRESENTER_HINT_KEYS.capello);

  assert.equal(controller.request(PRESENTER_HINT_KEYS.capello), false);
  assert.equal(controller.getSnapshot().entries.capello.stunned, true);

  const resumedController = createPresenterHintsController({ storage });
  resumedController.setScope("round-2", "playing");
  resumedController.markAvailable(PRESENTER_HINT_KEYS.capello, "round-2");
  assert.equal(resumedController.request(PRESENTER_HINT_KEYS.capello), false);

  controller.setScope("round-2", "results");
  assert.equal(controller.getSnapshot().entries.capello.stunned, false);
});

test("presenter hints are cleared between rounds", () => {
  const controller = createPresenterHintsController();
  controller.setRound("round-2");
  controller.markAvailable(PRESENTER_HINT_KEYS.capello, "round-2");
  controller.markAvailable(PRESENTER_HINT_KEYS.pivot, "round-2");
  controller.setRound("round-3");

  assert.equal(controller.getSnapshot().entries.capello.hasHint, false);
  assert.equal(controller.getSnapshot().entries.pivot.hasHint, false);
  assert.equal(
    controller.markAvailable(PRESENTER_HINT_KEYS.capello, "round-2"),
    false,
  );
});

test("the desktop intervention host is released without clearing a newer host", () => {
  const controller = createPresenterHintsController();
  const firstHost = {};
  const secondHost = {};
  const releaseFirst = controller.setInterventionHost(firstHost, "inside-top");
  const releaseSecond = controller.setInterventionHost(secondHost, "inside-top");

  releaseFirst();
  assert.equal(controller.getInterventionHost().element, secondHost);
  releaseSecond();
  assert.equal(controller.getInterventionHost(), null);
});
