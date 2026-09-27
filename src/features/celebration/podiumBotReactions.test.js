import assert from "node:assert/strict";
import test from "node:test";
import { createPodiumBotReactions } from "./podiumBotReactions.js";
import { PRESENTER_HIT_IDLE_MS } from "../../components/botInterventions/spriteInterventionAnimation.js";

function clock() {
  const pending = new Map(); let id = 0;
  return { pending, schedule: (callback, delay) => { pending.set(++id, { callback, delay }); return id; },
    cancel: id => pending.delete(id), fire() { const tasks = [...pending.values()]; pending.clear(); tasks.forEach(task => task.callback()); } };
}

test("podium hits alternate until inactivity, then keep the bot visible with stars", () => {
  const timers = clock(), bot = createPodiumBotReactions(timers), changes = [];
  const unsubscribe = bot.subscribe(() => changes.push(bot.getSnapshot().reaction));
  for (const [index, reaction] of ["hit1", "hit2", "hit1", "hit2"].entries()) {
    assert.equal(bot.hit(), true);
    assert.deepEqual(bot.getSnapshot(), { reaction, hits: index + 1 });
    assert.equal(timers.pending.size, 1, "new hits replace the old inactivity timer");
    assert.equal([...timers.pending.values()][0].delay, PRESENTER_HIT_IDLE_MS);
  }
  timers.fire();
  assert.equal(bot.getSnapshot().reaction, "stars");
  assert.equal(bot.hit(), false);
  assert.equal(timers.pending.size, 0, "no permanent animation or timer while stunned");
  assert.deepEqual(changes, ["hit1", "hit2", "hit1", "hit2", "stars"]);
  unsubscribe(); bot.stop();
});

test("each bot and each new podium own independent hits", () => {
  const firstTimers = clock(), secondTimers = clock();
  const first = createPodiumBotReactions(firstTimers), second = createPodiumBotReactions(secondTimers);
  first.hit(); first.hit(); firstTimers.fire();
  assert.deepEqual(second.getSnapshot(), { reaction: null, hits: 0 });
  second.hit(); assert.equal(second.getSnapshot().reaction, "hit1");
  assert.deepEqual(createPodiumBotReactions().getSnapshot(), { reaction: null, hits: 0 });
  first.stop(); second.stop();
});

test("leaving the podium cancels reactions, including development mount cleanup", () => {
  const timers = clock(), bot = createPodiumBotReactions(timers);
  bot.stop(); bot.start(); // React StrictMode effect replay.
  assert.equal(bot.hit(), true);
  bot.stop();
  assert.equal(timers.pending.size, 0);
  assert.equal(bot.hit(), false);
  timers.fire();
  assert.deepEqual(bot.getSnapshot(), { reaction: "hit1", hits: 1 });
});
