import test from "node:test";
import assert from "node:assert/strict";

import { createDailyApplicationRuntime } from "./createDailyApplicationRuntime.js";

test("daily application runtime loads hub resources only while enabled", () => {
  const calls = { board: 0, duel: 0, history: [], status: 0 };
  const runtime = createDailyApplicationRuntime();
  const configure = ({ enabled = true, installId = "user:4" } = {}) =>
    runtime.configure({
      enabled,
      fetchDailyBoard: () => {
        calls.board += 1;
      },
      fetchDailyHistory: (days) => calls.history.push(days),
      fetchDailyStatus: () => {
        calls.status += 1;
      },
      fetchDuelStatus: () => {
        calls.duel += 1;
      },
      installId,
    });

  configure({ enabled: false });
  runtime.start();
  assert.deepEqual(calls, { board: 0, duel: 0, history: [], status: 0 });

  configure();
  assert.deepEqual(calls, { board: 1, duel: 1, history: [10], status: 1 });

  configure();
  assert.deepEqual(calls, { board: 1, duel: 1, history: [10], status: 1 });

  configure({ installId: "user:5" });
  assert.deepEqual(calls, { board: 2, duel: 2, history: [10, 10], status: 2 });

  configure({ enabled: false, installId: "user:5" });
  configure({ enabled: true, installId: "user:5" });
  assert.deepEqual(calls, { board: 3, duel: 3, history: [10, 10, 10], status: 3 });
  runtime.stop();
});
