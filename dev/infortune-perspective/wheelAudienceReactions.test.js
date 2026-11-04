import test from "node:test";
import assert from "node:assert/strict";
import { audienceReactionFor, createWheelAudience } from "./wheelAudienceReactions.js";

test("the audience follows Paul's bands, with an even random choice only for 100 / 150", () => {
  for (const amount of [100, 150]) {
    assert.equal(audienceReactionFor({ kind: "amount", amount }, () => 0.49), "low1");
    assert.equal(audienceReactionFor({ kind: "amount", amount }, () => 0.5), "low2");
  }
  for (const amount of [200, 250, 300]) assert.equal(audienceReactionFor({ kind: "amount", amount }), "honorable");
  for (const amount of [400, 500]) assert.equal(audienceReactionFor({ kind: "amount", amount }), "fiveHundred");
  assert.equal(audienceReactionFor({ kind: "amount", amount: 1000 }), "top");
  assert.equal(audienceReactionFor({ kind: "bonus" }), "top");
  for (const kind of ["pass", "bankrupt", "exchange"]) assert.equal(audienceReactionFor({ kind, amount: 0 }), null);
});

test("a physical result chooses and starts one reaction once; a new throw can choose again", () => {
  const players = new Map(); let randomCalls = 0;
  const audience = createWheelAudience({ urls: { low1: "one", low2: "two", top: "top" },
    random: () => (++randomCalls === 1 ? 0.2 : 0.8),
    track(options) { const player = { options, calls: [], sync(value) { this.calls.push(value); } }; players.set(options.url, player); return player; },
  });
  audience.stopped({ kind: "amount", amount: 100 }, 1);
  audience.stopped({ kind: "amount", amount: 100 }, 1);
  assert.equal(randomCalls, 1);
  assert.equal(players.get("one").calls.filter(call => call.active).length, 1);
  assert.equal(players.get("one").options.resumeFromPlayback, true);
  audience.reset(); audience.stopped({ kind: "amount", amount: 150 }, 2);
  assert.equal(randomCalls, 2); assert.equal(players.get("two").calls.at(-1).active, true);
  audience.stopped({ kind: "pass", amount: 0 }, 3);
  assert.ok([...players.values()].every(player => player.calls.at(-1).active === false));
  audience.preview("top"); assert.equal(players.get("top").calls.at(-1).active, true);
  assert.equal(randomCalls, 2, "Auditioning a sound does not roll another random result.");
});
