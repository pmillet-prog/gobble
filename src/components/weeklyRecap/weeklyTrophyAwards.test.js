import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyTrophyRows } from "./weeklyTrophyAwards.js";
import { TROPHY_REWARDS } from "../../../shared/trophyCatalog.js";

test("weekly awards distinguish missing data from a week without acquisitions", () => {
  assert.equal(buildWeeklyTrophyRows(undefined), null);
  assert.equal(buildWeeklyTrophyRows(null), null);
  assert.deepEqual(buildWeeklyTrophyRows([]), []);
});

test("weekly awards keep tiers separate and show each account once with its weekly acquisitions", () => {
  const rows = buildWeeklyTrophyRows([
    { id: "words_100000", recipients: [{ userId: 2, nick: "Myrtille", count: 2 }, { userId: 1, nick: "Ancien pseudo", count: 15 }] },
    { id: "words_100000:bronze", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
    { id: "words_100000:silver", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
    { id: "words_100000", recipients: [{ userId: 1, nick: "Tigre", count: 1 }, { userId: 3, nick: "Tigre", count: 2 }] },
  ]);
  assert.deepEqual(rows.map(row => row.reward.metal), ["bronze", "silver", "gold"]);
  assert.equal(rows[2].recipients.length, 3, "accounts with the same nickname remain distinct");
  assert.deepEqual(rows[2].recipients.find(entry => entry.userId === 1), {
    userId: 1, nick: "Tigre", key: "user:1", count: 16,
  });
  assert.equal(rows[0].recipients[0].count, 1);
  assert.equal(rows[1].recipients[0].count, 1);
});

test("weekly awards retain all 41 rewards and all recipients in catalogue order", () => {
  const awards = [...TROPHY_REWARDS].reverse().map(reward => ({ id: reward.id,
    recipients: Array.from({ length: 66 }, (_, index) => ({ userId: index + 1, nick: `Joueur ${index + 1}`, count: 1 })),
  }));
  const rows = buildWeeklyTrophyRows(awards);
  assert.deepEqual(rows.map(row => row.reward.id), TROPHY_REWARDS.map(reward => reward.id));
  assert.equal(rows.length, 41);
  assert.ok(rows.every(row => row.recipients.length === 66));
});
