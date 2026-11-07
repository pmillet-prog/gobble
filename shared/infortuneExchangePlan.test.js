import test from "node:test";
import assert from "node:assert/strict";
import { planInfortuneExchanges, exchangeImpact } from "./infortuneExchangePlan.js";

test("two candidates targeting the same player swap that player's current funds in the announced order", () => {
  const original = { a: 100, b: 500, c: 1000 };
  const result = planInfortuneExchanges(original, { b: "c", a: "c" }, ["a", "b", "c"]);
  assert.deepEqual(result.banks, { a: 1000, b: 100, c: 500 });
  assert.deepEqual(original, { a: 100, b: 500, c: 1000 });
  assert.equal(result.exchanges[1].targetBank, 100);
  assert.deepEqual(exchangeImpact(result.exchanges[1], "c"), { before: 100, after: 500, delta: 400 });
});

test("mutual choices both take effect and restore the original balances", () => {
  const original = { a: 100, b: 500, c: 1000 };
  const result = planInfortuneExchanges(original, { a: "b", b: "a" }, ["a", "b", "c"]);
  assert.equal(result.exchanges.length, 2);
  assert.deepEqual(result.banks, original);
  assert.equal(exchangeImpact(result.exchanges[0], "a").delta, 400);
  assert.equal(exchangeImpact(result.exchanges[1], "a").delta, -400);
  assert.equal(exchangeImpact(result.exchanges[1], "c"), null);
});

test("a three-way chain is reproducible, conserves money, and cannot target self or an outsider", () => {
  const original = { a: 100, b: 500, c: 1000 };
  const choices = { a: "b", b: "c", c: "a" }, order = ["b", "c", "a"];
  const result = planInfortuneExchanges(original, choices, order);
  assert.deepEqual(result, planInfortuneExchanges(original, { c: "a", a: "b", b: "c" }, order));
  assert.equal(Object.values(result.banks).reduce((sum, bank) => sum + bank), 1600);
  assert.equal(result.exchanges.length, 3);
  assert.equal(planInfortuneExchanges(original, { a: "a", b: "stranger" }, order).exchanges.length, 0);
});
