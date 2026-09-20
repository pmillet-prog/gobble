import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarRewardNotifier } from "./createAvatarRewardNotifier.js";

test("socket and refresh deliveries show each reward once and share one acknowledgment", async () => {
  const shown = [], acknowledgments = [], jobs = new Map(); let id = 0;
  const notifier = createAvatarRewardNotifier({ userId: 1, nickname: () => "Tigre", show: (...args) => shown.push(args), acknowledge: async keys => acknowledgments.push(keys),
    setTimer: callback => { jobs.set(++id, callback); return id; }, clearTimer: key => jobs.delete(key) });
  const tag = { key: "accessories:participant_tag", family: "accessories", id: "participant_tag", label: "Étiquette" };
  const crown = { key: "headwear:crown", family: "headwear", id: "crown", label: "Couronne" };
  notifier.receive({ userId: 2, rewards: [tag] });
  assert.equal(shown.length, 0);
  notifier.receive({ userId: 1, rewards: [tag] });
  notifier.receive({ userId: 1, rewards: [tag, crown] });
  assert.equal(shown.length, 2); assert.equal(jobs.size, 1);
  assert.equal(shown[0][2].avatarReward.nickname, "Tigre");
  await [...jobs.values()][0](); jobs.clear();
  assert.deepEqual(acknowledgments, [[tag.key, crown.key]]);
  notifier.dispose(); notifier.receive({ userId: 1, rewards: [tag] });
  assert.equal(jobs.size, 0); assert.equal(shown.length, 2);
});

test("failed acknowledgment retries on delivery without repeating the toast or polling", async () => {
  let pending, fail = true, attempts = 0, shown = 0;
  const notifier = createAvatarRewardNotifier({ userId: 1, nickname: () => "Test", show: () => shown++, acknowledge: async () => { attempts++; if (fail) throw Error("offline"); },
    setTimer: callback => { pending = callback; return 1; }, clearTimer: () => { pending = null; } });
  const payload = { userId: 1, rewards: [{ key: "accessories:participant_tag", family: "accessories", id: "participant_tag", label: "Étiquette" }] };
  notifier.receive(payload); const first = pending; pending = null; await first();
  assert.equal(pending, null); assert.equal(attempts, 1);
  fail = false; notifier.receive(payload); await pending();
  assert.equal(attempts, 2); assert.equal(shown, 1);
  notifier.dispose();
});

test("weekly receipts can unlock the same aura again but expired deliveries stay silent", () => {
  const shown = [];
  const notifier = createAvatarRewardNotifier({ userId: 1, nickname: () => "Tigre", show: (...args) => shown.push(args), acknowledge: async () => {},
    setTimer: () => 1, clearTimer: () => {} });
  const reward = { family: "auras", id: "weekly_gold", label: "Aura Or", expiresAt: Date.now() + 60000 };
  notifier.receive({ userId: 1, rewards: [{ ...reward, key: "auras:weekly_gold@1" }] });
  notifier.receive({ userId: 1, rewards: [{ ...reward, key: "auras:weekly_gold@1" }] });
  notifier.receive({ userId: 1, rewards: [{ ...reward, key: "auras:weekly_gold@2" }] });
  notifier.receive({ userId: 1, rewards: [{ ...reward, key: "auras:weekly_gold@expired", expiresAt: Date.now() - 1 }] });
  assert.equal(shown.length, 2);
  notifier.dispose();
});
