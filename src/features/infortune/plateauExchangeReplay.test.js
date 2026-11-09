import test from "node:test";
import assert from "node:assert/strict";
import { createPlateauExchangeReplay, advancePlateauExchangeReplay, exchangeReplayEconomy } from "./plateauExchangeReplay.js";
import { planInfortuneExchanges } from "../../../shared/infortuneExchangePlan.js";

const plateau = { id: "g1", members: [{ id: "self" }, { id: "a" }, { id: "b" }] };
test("a spectator sees the swap of their two opponents and no foreign swap", () => {
  const economy = { hidden: true, resolvedGroups: ["g1"], members: { self: { bank: 100 }, a: { bank: 900 }, b: { bank: 500 } },
    exchangeReplays: { g1: [{ from: "a", to: "b", sourceBank: 500, targetBank: 900 }, { from: "a", to: "foreign", sourceBank: 900, targetBank: 99 }],
      g2: [{ from: "foreign", to: "other", sourceBank: 99, targetBank: 50 }] } };
  const replay = createPlateauExchangeReplay(economy, plateau);
  assert.equal(replay.exchanges.length, 1); assert.equal(replay.activeExchange.from, "a");
  assert.deepEqual(replay.banks, { self: 100, a: 500, b: 900 });
  assert.equal(exchangeReplayEconomy(economy, replay).members.a.bank, 500);
  assert.equal(economy.members.a.bank, 900);
  assert.equal(advancePlateauExchangeReplay(replay), null);
  assert.equal(createPlateauExchangeReplay({ ...economy, resolvedGroups: [] }, plateau), null);
});

test("three successive swaps and mutual choices replay the actual intermediate balances", () => {
  for (const choices of [{ self: "a", a: "self" }, { self: "a", a: "b", b: "self" }]) {
    const initial = { self: 100, a: 500, b: 900 }, plan = planInfortuneExchanges(initial, choices, ["self", "a", "b"]);
    const economy = { resolvedGroups: ["g1"], exchangeReplays: { g1: plan.exchanges },
      members: Object.fromEntries(Object.entries(plan.banks).map(([id, bank]) => [id, { bank }])) };
    let replay = createPlateauExchangeReplay(economy, plateau), banks = { ...initial }, count = 0;
    while (replay) {
      assert.deepEqual(replay.banks, banks);
      const { from, to, sourceBank, targetBank } = replay.activeExchange;
      if (!replay.activeExchange.cancelled) { banks[from] = targetBank; banks[to] = sourceBank; }
      count++;
      replay = advancePlateauExchangeReplay(replay);
    }
    assert.equal(count, plan.exchanges.length); assert.deepEqual(banks, plan.banks);
  }
});
