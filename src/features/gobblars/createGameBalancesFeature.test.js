import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createGameBalancesFeature } from "./createGameBalancesFeature.js";

function harness() {
  const handlers = {}, requests = [], jobs = new Map(); let id = 0;
  const timers = { setTimeout(fn, delay) { jobs.set(++id, { fn, delay }); return id; }, clearTimeout(key) { jobs.delete(key); } };
  const kernel = createApplicationKernel({ ports: { realtime: {
    bind(value) { Object.assign(handlers, value); return () => {}; },
    emit(event, value, ack) { requests.push({ event, value, ack }); },
  } } });
  kernel.features.define("gameBalances", context => createGameBalancesFeature(context, { timers, enabled: true }));
  kernel.commands.session.patch({ isLoggedIn: true, nickname: "Alice" });
  kernel.commands.game.setCurrentRoomId("room"); kernel.commands.navigation.go("live");
  const lease = kernel.features.acquire("gameBalances");
  return { kernel, feature: lease.feature, handlers, requests, jobs,
    run(delay) { for (const [key, job] of [...jobs]) if (job.delay === delay) { jobs.delete(key); job.fn(); } },
    reply(bank, index = requests.length - 1) { requests[index].ack({ ok: true, roomId: requests[index].value.roomId, tournamentId: "t1", bank }); } };
}
test("private bank persists between rounds, refreshes after exchanges and clears when leaving", () => {
  const h = harness(); h.reply(1200);
  h.handlers.roundStarted({ roomId: "room" }); h.run(0);
  assert.equal(h.feature.store.getState().bank, 1200);
  h.reply(1500); h.handlers.infortuneEconomy({ roomId: "room" }); h.run(0); h.reply(100);
  assert.equal(h.feature.store.getState().bank, 100);
  assert.deepEqual(h.requests[0].value, { roomId: "room" });
  h.kernel.commands.navigation.go("home");
  assert.equal(h.feature.store.getState().bank, null); h.kernel.dispose();
});
test("late replies cannot replace a newer request, another room or another account", () => {
  const h = harness(); h.run(4000); h.feature.refresh();
  h.reply(9000, 0); assert.equal(h.feature.store.getState().bank, null);
  h.reply(1500); h.kernel.commands.game.setCurrentRoomId("elsewhere"); h.reply(99);
  h.reply(8000, 1); assert.equal(h.feature.store.getState().bank, 99);
  h.kernel.commands.session.setAuthState({ user: { id: 2 }, status: "authenticated" });
  assert.equal(h.feature.store.getState().bank, null); h.kernel.dispose(); assert.equal(h.jobs.size, 0);
});
test("an economy event arriving during a snapshot forces a fresh read", () => {
  const h = harness(); h.handlers.infortuneEconomy({ roomId: "room" }); h.run(0); h.reply(100);
  h.run(0); assert.equal(h.requests.length, 2); h.reply(200);
  assert.equal(h.feature.store.getState().bank, 200); h.kernel.dispose();
});
