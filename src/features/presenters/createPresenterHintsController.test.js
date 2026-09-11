import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESENTER_HINT_KEYS,
  createPresenterHintsController,
} from "./createPresenterHintsController.js";

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
