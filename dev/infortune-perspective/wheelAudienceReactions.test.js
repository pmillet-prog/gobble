import test from "node:test";
import assert from "node:assert/strict";
import { audienceReactionFor, exchangeAudienceReaction, createWheelAudience, nearSpecialSector } from "./wheelAudienceReactions.js";
import { WHEEL_SECTORS } from '../../shared/infortuneWheel.js';

test("the audience varies low and 400 / 500 gains and reacts to special losses", () => {
  for (const amount of [100, 150]) {
    assert.equal(audienceReactionFor({ kind: "amount", amount }, () => 0.49), "low1");
    assert.equal(audienceReactionFor({ kind: "amount", amount }, () => 0.5), "low2");
  }
  for (const amount of [200, 250, 300]) assert.equal(audienceReactionFor({ kind: "amount", amount }), "honorable");
  for (const amount of [400, 500]) {
    assert.equal(audienceReactionFor({ kind: "amount", amount }, () => .49), 'fiveHundred');
    assert.equal(audienceReactionFor({ kind: "amount", amount }, () => .5), 'fiveHundred2');
  }
  assert.equal(audienceReactionFor({ kind: "amount", amount: 1000 }), "top");
  assert.equal(audienceReactionFor({ kind: "bonus" }), "top");
  assert.equal(audienceReactionFor({ kind: 'pass' }), 'disappointedPass');
  assert.equal(audienceReactionFor({ kind: 'bankrupt' }), 'disappointedBankrupt');
  assert.equal(audienceReactionFor({ kind: 'exchange' }), null);
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

test("exchange applause follows the local player's gain, loss or unchanged amount", () => {
  assert.equal(exchangeAudienceReaction({ before: 100, after: 900 }), 'top');
  assert.equal(exchangeAudienceReaction({ before: 900, after: 100 }), 'laughter');
  assert.equal(exchangeAudienceReaction({ before: 900, after: 1000 }), 'honorable');
  assert.equal(exchangeAudienceReaction({ before: 2000, after: 1100 }), 'laughter');
  assert.equal(exchangeAudienceReaction({ before: 1000, after: 900 }), 'honorable');
  assert.equal(exchangeAudienceReaction({ before: 2000, after: 1600 }), 'disappointedPass');
  assert.equal(exchangeAudienceReaction({ before: 100, after: 0 }), 'disappointedPass');
  assert.equal(exchangeAudienceReaction({ before: 0, after: 0 }), 'honorable');
  const calls = [];
  const audience = createWheelAudience({ urls: { top: "top" }, track: () => ({ sync: value => calls.push(value) }) });
  audience.exchange({ before: 0, after: 500 }, "round4:1"); audience.exchange({ before: 0, after: 500 }, "round4:1");
  assert.equal(calls.filter(call => call.active).length, 1);
});

test('suspense precedes the result only near a special wedge, once per spin, in either direction', () => {
  const progress = { id: 1, phase: 'spinning', elapsed: 6, velocity: .08 * Math.PI * 2, sectorIndex: 7, sectors: WHEEL_SECTORS };
  assert.equal(nearSpecialSector(progress), true);
  assert.equal(nearSpecialSector({ ...progress, sectorIndex: 6 }), true);
  assert.equal(nearSpecialSector({ ...progress, velocity: -progress.velocity, sectorIndex: 5 }), true);
  assert.equal(nearSpecialSector({ ...progress, velocity: -progress.velocity, sectorIndex: 23 }), true);
  for (const change of [{ velocity: 0 }, { velocity: .2 * Math.PI * 2 }, { velocity: 4 }, { phase: 'finished' },
    { sectorIndex: 8 }, { sectorIndex: 4 }, { velocity: -progress.velocity, sectorIndex: 4 }])
    assert.equal(nearSpecialSector({ ...progress, ...change }), false);
  for (const [random, expected] of [[.2, 'gasp'], [.8, 'surprised']]) {
    const calls = [];
    const audience = createWheelAudience({ urls: { gasp: 'gasp', surprised: 'surprised', top: 'top' }, random: () => random,
      track: ({ url }) => ({ sync: value => { if (value.active) calls.push(url); } }) });
    audience.spinning(progress); audience.spinning(progress); audience.stopped({ kind: 'bonus' }, 1);
    assert.deepEqual(calls, [expected, 'top']);
  }
});
