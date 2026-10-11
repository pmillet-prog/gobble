import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createTrophiesFeature } from "./createTrophiesFeature.js";
import { collectRoundTrophyAwards, getTrophyCollection } from "./trophyPresentation.js";

const award = (eventId, patch = {}) => ({ id: "word_17", eventId, count: 1, delta: 1, roundId: "round-1", earnedAt: 100, ...patch });

function fixture({ autoDevStatus = true } = {}) {
  const handlers = new Map();
  const requests = [];
  const shown = [];
  const removed = [];
  const timers = new Map();
  let timerSequence = 0;
  let requestSequence = 0;
  const kernel = createApplicationKernel({ ports: { realtime: {
    connected: true,
    bind: events => { Object.entries(events).forEach(([key, value]) => handlers.set(key, value)); return () => handlers.clear(); },
    emit: (event, data, callback) => {
      requests.push({ event, data, callback });
      if (event === "dev:achievement:status" && autoDevStatus) callback({ ok: true, allowed: true });
    },
  } } });
  kernel.features.define("notifications", () => ({
    show: (message, duration, options) => { const toast = { id: shown.length + 1, message, duration, options }; shown.push(toast); return toast; },
    remove: id => removed.push(id),
  }));
  kernel.features.define("achievements", context => createTrophiesFeature(context, {
    setTimeoutFn: callback => { const id = ++timerSequence; timers.set(id, callback); return id; },
    clearTimeoutFn: id => timers.delete(id),
    createRequestId: () => `00000000-0000-4000-8000-${String(++requestSequence).padStart(12, "0")}`,
  }));
  kernel.commands.session.setAuthState({ status: "authenticated", user: { id: 7 } });
  kernel.commands.session.setNickname("Tigre");
  kernel.commands.realtime.setRoundId("round-1");
  const lease = kernel.features.acquire("achievements");
  return { kernel, feature: lease.feature, handlers, requests, shown, removed, timers,
    tick() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
    receive: payload => handlers.get("achievement:earned")(payload),
    request: event => requests.findLast(request => request.event === event),
  };
}

test("achievements queue every reward once and acknowledge only after presentation", () => {
  const f = fixture();
  f.receive(award("a"));
  f.receive(award("a"));
  f.receive(award("b", { count: 2 }));
  assert.equal(f.shown.length, 1);
  assert.equal(f.feature.store.getState().counts.word_17, 2);
  assert.equal(f.requests.filter(request => request.event === "achievement:ack").length, 0);
  f.tick();
  assert.equal(f.shown.length, 2);
  assert.deepEqual(f.requests.at(-1).data.eventIds, ["a"]);
  f.tick();
  f.receive(award("b", { count: 2 }));
  assert.equal(f.shown.length, 2);
  assert.equal(f.timers.size, 0);
  f.kernel.dispose();
});

test("reconnection merges authoritative counts and pending awards without replaying a visible toast", () => {
  const f = fixture();
  f.receive(award("a"));
  f.handlers.get("connect")();
  f.request("achievement:sync").callback({ ok: true, achievements: { counts: { word_17: 8 } }, awards: [award("a"), award("b", { id: "word_16" })] });
  assert.equal(f.shown.length, 1);
  assert.equal(f.feature.store.getState().counts.word_17, 8);
  f.tick();
  assert.equal(f.shown.length, 2);
  assert.equal(f.shown[1].options.achievementReward.id, "word_16");
  f.kernel.dispose();
  assert.equal(f.timers.size, 0);
  assert.equal(f.handlers.size, 0);
});

test("a full pending page drains the next page only after all 64 presentations are acknowledged", () => {
  const f = fixture();
  const pending = Array.from({ length: 65 }, (_, index) => award(`pending-${index + 1}`, { count: index + 1 }));
  f.requests[0].callback({ ok: true, achievements: { counts: { word_17: 65 } }, awards: pending.slice(0, 64) });
  for (let index = 0; index < 64; index += 1) f.tick();
  assert.equal(f.shown.length, 64);
  assert.equal(f.requests.filter(request => request.event === "achievement:sync").length, 1);
  const firstPageAcks = f.requests.filter(request => request.event === "achievement:ack");
  assert.equal(firstPageAcks.length, 64);
  for (const request of firstPageAcks.slice(0, -1)) request.callback({ ok: true });
  assert.equal(f.requests.filter(request => request.event === "achievement:sync").length, 1);
  firstPageAcks.at(-1).callback({ ok: true });
  const pages = f.requests.filter(request => request.event === "achievement:sync");
  assert.equal(pages.length, 2);
  pages[1].callback({ ok: true, achievements: { counts: { word_17: 65 } }, awards: pending.slice(64) });
  assert.equal(f.shown.length, 65);
  f.tick();
  f.requests.at(-1).callback({ ok: true });
  assert.equal(f.timers.size, 0);
  assert.equal(f.requests.filter(request => request.event === "achievement:sync").length, 2, "a partial page must not start polling");
  assert.deepEqual(f.requests.filter(request => request.event === "achievement:ack").flatMap(request => request.data.eventIds), pending.map(item => item.eventId));
  assert.equal(new Set(f.shown.map(toast => toast.options.achievementReward.eventId)).size, 65);
  f.kernel.dispose();
});

test("account changes cancel pending presentation and reject late account snapshots", () => {
  const f = fixture();
  const staleResponse = f.requests[0].callback;
  f.receive(award("a"));
  f.kernel.commands.session.setAuthState({ status: "authenticated", user: { id: 8 } });
  staleResponse({ ok: true, achievements: { counts: { word_17: 99 } }, awards: [award("old")] });
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.removed, [1]);
  assert.equal(f.feature.store.getState().userId, 8);
  assert.deepEqual(f.feature.store.getState().counts, {});
  f.receive(award("wrong-account", { userId: 7 }));
  assert.equal(f.shown.length, 1);
  f.kernel.dispose();
});

test("round awards merge live and result delivery and expire at the next round", () => {
  const f = fixture();
  f.receive(award("a"));
  f.kernel.commands.realtime.setFinalResults([
    { nick: "Tigre", achievementAwards: [award("a")] },
    { nick: "Test", achievementAwards: [award("b", { id: "word_17" })] },
  ]);
  assert.equal(f.feature.store.getState().roundAwards.length, 2);
  assert.deepEqual(f.feature.store.getState().roundAwards.map(entry => entry.nick), ["Tigre", "Test"]);
  assert.equal(f.shown.length, 1, "another player's result must not trigger a personal toast");
  f.kernel.commands.realtime.setRoundId("round-2");
  assert.deepEqual(f.feature.store.getState().roundAwards, []);
  f.kernel.dispose();
});

test("collection caps the unique volume trophy and scores it with the confirmed scale", () => {
  const collection = getTrophyCollection({ counts: { volume_100: 2, unknown: 100, word_16: -1 } }, { volume_100: 3 });
  assert.equal(collection.counts.volume_100, 1);
  assert.equal(collection.counts.word_16, 0);
  assert.equal(collection.totalCount, 1);
  assert.equal(collection.points, 20);
  assert.deepEqual(collectRoundTrophyAwards([{ achievementAwards: [award("bad", { id: "unknown" })] }], [], "round-1"), []);
});

test("tier receipts preserve bronze, silver and repeatable gold through sync and notifications", () => {
  const f = fixture();
  f.receive(award("bronze", { id: "words_100000:bronze", count: 4, delta: 4 }));
  f.receive(award("silver", { id: "words_100000:silver" }));
  f.receive(award("gold", { id: "words_100000", count: 16 }));
  assert.equal(f.feature.store.getState().counts["words_100000:bronze"], 1);
  assert.equal(f.feature.store.getState().counts["words_100000:silver"], 1);
  assert.equal(f.feature.store.getState().counts.words_100000, 16);
  assert.match(f.shown[0].message, /Bronze/);
  f.tick(); assert.match(f.shown[1].message, /Argent/);
  f.tick(); assert.match(f.shown[2].message, /Or/);
  assert.equal(f.shown[2].options.achievementReward.count, 16);
  assert.equal(f.feature.store.getState().roundAwards.length, 3);
  f.request("achievement:sync").callback({ ok: true, achievements: { counts: { "words_100000:bronze": 9, volume_100: 9 } }, awards: [] });
  assert.equal(f.feature.store.getState().counts["words_100000:bronze"], 1);
  assert.equal(f.feature.store.getState().counts.volume_100, 1);
  f.kernel.dispose();
});

const devAward = (eventId, patch = {}) => award(`achievement-dev:${eventId}`, { dev: true, userId: 7, ...patch });
async function grant(f, receipt = devAward("one")) {
  const result = f.feature.grantDevTrophy(receipt.id);
  f.request("dev:achievement:grant").callback({ ok: true, award: receipt });
  return result;
}

test("a repeated unique dev grant with no delta confirms the trial without a second success", async () => {
  const f = fixture();
  assert.equal((await grant(f, devAward("unique", { id: "words_100000:bronze" }))).ok, true);
  assert.equal((await grant(f, devAward("same-unique", { id: "words_100000:bronze", delta: 0 }))).ok, true);
  assert.equal(f.shown.length, 1);
  assert.equal(f.feature.store.getState().devCounts["words_100000:bronze"], 1);
  assert.equal(f.feature.store.getState().roundAwards.length, 1);
  f.kernel.dispose();
});

test("dev grants use server receipts and a separate collection, toast queue and round recap without durable acknowledgments", async () => {
  const f = fixture();
  assert.equal(f.feature.store.getState().devAllowed, true);
  f.receive(award("real", { count: 4 }));
  const receipt = devAward("one");
  assert.equal((await grant(f, receipt)).ok, true);
  const request = f.request("dev:achievement:grant");
  assert.deepEqual(request.data, { id: "word_17", requestId: "00000000-0000-4000-8000-000000000001" });
  f.receive(receipt);
  request.callback({ ok: true, award: receipt });
  assert.deepEqual(f.feature.store.getState().counts, { word_17: 4 });
  assert.deepEqual(f.feature.store.getState().devCounts, { word_17: 1 });
  assert.equal(f.feature.store.getState().roundAwards.length, 2);
  assert.equal(f.shown.length, 1, "test success waits for the real success already visible");
  f.tick();
  assert.equal(f.shown[1].options.achievementReward.count, 5);
  assert.equal(f.shown[1].options.achievementReward.dev, true);
  f.tick();
  await grant(f, devAward("two", { count: 2 }));
  assert.equal(f.shown[2].options.achievementReward.count, 6);
  f.tick();
  assert.deepEqual(f.requests.filter(request => request.event === "achievement:ack").flatMap(request => request.data.eventIds), ["real"]);
  assert.equal(f.feature.store.getState().counts.word_17, 4);
  assert.equal(f.feature.store.getState().devCounts.word_17, 2);
  f.receive(devAward("old", { count: 1 }));
  assert.equal(f.shown.length, 3, "an older server counter cannot replay a test success");
  f.kernel.dispose();
});

test("reset removes only temporary successes and resumes a queued real toast", async () => {
  const f = fixture();
  await grant(f);
  f.receive(award("real", { count: 8 }));
  await grant(f, devAward("two", { count: 2 }));
  const reset = f.feature.resetDevTrophies();
  assert.equal(f.feature.store.getState().devBusy, true);
  assert.deepEqual(f.feature.store.getState().devCounts, { word_17: 2 }, "wait for the server before removing tests");
  assert.deepEqual(f.removed, []);
  f.request("dev:achievement:reset").callback({ ok: true });
  assert.deepEqual(await reset, { ok: true });
  assert.deepEqual(f.feature.store.getState().devCounts, {});
  assert.deepEqual(f.feature.store.getState().counts, { word_17: 8 });
  assert.deepEqual(f.feature.store.getState().roundAwards.map(item => item.eventId), ["real"]);
  assert.deepEqual(f.removed, [1]);
  assert.deepEqual(f.shown.map(item => item.options.achievementReward.eventId), ["achievement-dev:one", "real"]);
  f.tick();
  f.receive(award("real", { count: 8 }));
  assert.equal(f.shown.length, 2, "reset preserves already displayed real receipt bookkeeping");
  assert.equal(f.timers.size, 0);
  f.kernel.dispose();
});

test("a refused reset preserves test counts and delivery; overlapping commands cannot reset a pending grant", async () => {
  const f = fixture();
  await grant(f);
  const failedReset = f.feature.resetDevTrophies();
  f.request("dev:achievement:reset").callback({ ok: false, error: "request_failed" });
  assert.deepEqual(await failedReset, { ok: false, error: "request_failed" });
  assert.deepEqual(f.feature.store.getState().devCounts, { word_17: 1 });
  assert.deepEqual(f.removed, []);
  assert.equal(f.feature.store.getState().roundAwards.length, 1);
  const pending = f.feature.grantDevTrophy("word_17");
  assert.deepEqual(await f.feature.resetDevTrophies(), { ok: false, error: "dev_busy" });
  assert.equal(f.requests.filter(request => request.event === "dev:achievement:reset").length, 1);
  f.request("dev:achievement:grant").callback({ ok: true, award: devAward("two", { count: 2 }) });
  assert.equal((await pending).ok, true);
  assert.deepEqual(f.feature.store.getState().devCounts, { word_17: 2 });
  assert.equal(f.feature.store.getState().devAllowed, true);
  f.kernel.dispose();
  assert.equal(f.timers.size, 0);
});

test("disconnect and reconnect discard tests and stale requests while preserving real delivery", async () => {
  const f = fixture();
  f.receive(award("real", { count: 3 }));
  await grant(f);
  const pending = f.feature.grantDevTrophy("word_16");
  const stale = f.request("dev:achievement:grant").callback;
  f.handlers.get("disconnect")();
  assert.deepEqual(await pending, { ok: false, error: "disconnected" });
  assert.equal(f.feature.store.getState().devAllowed, false);
  assert.deepEqual(f.feature.store.getState().devCounts, {});
  assert.deepEqual(f.removed, [], "the real toast remains visible");
  assert.equal((await f.feature.grantDevTrophy("word_16")).error, "disconnected");
  f.handlers.get("connect")();
  stale({ ok: true, award: devAward("late", { id: "word_16" }) });
  assert.equal(f.feature.store.getState().devAllowed, true);
  assert.deepEqual(f.feature.store.getState().counts, { word_17: 3 });
  assert.deepEqual(f.feature.store.getState().devCounts, {});
  f.tick();
  assert.equal(f.shown.length, 1);
  assert.deepEqual(f.request("achievement:ack").data.eventIds, ["real"]);
  f.kernel.dispose();
});

test("dev requests have bounded timeouts, reject overlap and cannot apply delayed or wrong-account receipts", async () => {
  const f = fixture();
  const pending = f.feature.grantDevTrophy("word_17");
  const stale = f.request("dev:achievement:grant").callback;
  assert.equal((await f.feature.grantDevTrophy("word_16")).error, "dev_busy");
  assert.equal(f.requests.filter(request => request.event === "dev:achievement:grant").length, 1);
  f.tick();
  assert.deepEqual(await pending, { ok: false, error: "dev_timeout" });
  stale({ ok: true, award: devAward("late") });
  assert.equal(f.feature.store.getState().devBusy, false);
  assert.equal(f.feature.store.getState().devError, "dev_timeout");
  assert.deepEqual(f.feature.store.getState().devCounts, {});
  const wrong = await grant(f, devAward("wrong", { userId: 8 }));
  assert.equal(wrong.error, "invalid_achievement");
  f.receive(award("achievement-dev:unmarked"));
  assert.deepEqual(f.feature.store.getState().counts, {});
  assert.equal(f.shown.length, 0);
  f.kernel.dispose();
  assert.equal(f.timers.size, 0);
});

test("server access refusal clears dev state and stale access checks cannot reopen controls", async () => {
  const f = fixture({ autoDevStatus: false });
  const staleStatus = f.request("dev:achievement:status").callback;
  const grantPromise = f.feature.grantDevTrophy("word_17");
  f.request("dev:achievement:grant").callback({ ok: false, error: "dev_tools_unavailable" });
  assert.equal((await grantPromise).error, "dev_tools_unavailable");
  staleStatus({ ok: true, allowed: true });
  assert.equal(f.feature.store.getState().devAllowed, false);
  assert.equal(f.feature.store.getState().devError, "dev_tools_unavailable");
  assert.equal(f.timers.size, 0);
  f.handlers.get("connect")();
  f.request("dev:achievement:status").callback({ ok: true, allowed: true });
  assert.equal(f.feature.store.getState().devAllowed, true);
  const denied = f.feature.grantDevTrophy("word_17");
  f.request("dev:achievement:grant").callback({ ok: false, error: "rate_limited", retryAfterMs: 500 });
  assert.deepEqual(await denied, { ok: false, error: "rate_limited", retryAfterMs: 500 });
  assert.equal(f.feature.store.getState().devAllowed, true, "rate limiting does not revoke authorization");
  f.kernel.dispose();
});

test("account changes and disposal resolve pending dev operations and release their timers", async () => {
  const f = fixture();
  await grant(f);
  const first = f.feature.grantDevTrophy("word_16");
  const stale = f.request("dev:achievement:grant").callback;
  f.kernel.commands.session.setAuthState({ status: "authenticated", user: { id: 8 } });
  assert.equal((await first).error, "dev_cancelled");
  stale({ ok: true, award: devAward("late", { id: "word_16" }) });
  assert.deepEqual(f.feature.store.getState().devCounts, {});
  assert.deepEqual(f.removed, [1]);
  const second = f.feature.grantDevTrophy("word_16");
  f.kernel.dispose();
  assert.equal((await second).error, "dev_cancelled");
  assert.equal(f.timers.size, 0);
  assert.equal(f.handlers.size, 0);
  assert.equal(f.feature.store.getState().devAllowed, false);
});
