import test from "node:test";
import assert from "node:assert/strict";
import { createWorkshopTournament } from "./workshopTournament.js";
import { WHEEL_SECTORS, EXCHANGE_SECTOR_INDICES } from "../../shared/infortuneWheel.js";

const contestants = [{ id: "alix", nick: "ALIX" }, { id: "sam", nick: "SAM" }];
const indexFor = predicate => WHEEL_SECTORS.findIndex(predicate);
const amount = value => indexFor(sector => sector.kind === "amount" && sector.amount === value);
const pass = indexFor(sector => sector.kind === "pass");
const bankrupt = indexFor(sector => sector.kind === "bankrupt");
const bonus = indexFor(sector => sector.kind === "bonus");
function fixture() {
  let randomValue = 0;
  const model = createWorkshopTournament({ contestants, random: () => randomValue });
  return { model, draw(index) { randomValue = (index + 0.1) / WHEEL_SECTORS.length; },
    finishOpponents(index = pass) { randomValue = (index + 0.1) / WHEEL_SECTORS.length; model.revealOpponent("alix"); model.revealOpponent("sam"); } };
}

test('the workshop credits the launch before the landing and never adds it twice', () => {
  const { model } = fixture();
  model.launched({ quality: { kind: 'good' } });
  assert.equal(model.getSnapshot().balance, 50);
  assert.equal(model.getSnapshot().self.launchBank, 50);
  model.launched({ quality: { kind: 'perfect' } });
  model.recordResult({ index: bonus, launchQuality: { kind: 'good' } });
  assert.equal(model.getSnapshot().balance, 1050);
});

test("four real wheel results accumulate and carry the earned bank into the finale", () => {
  const { model, finishOpponents } = fixture();
  const results = [
    { index: amount(500), launchQuality: { kind: "good" } },
    { index: bonus, launchQuality: { kind: "perfect" } },
    { index: pass, launchQuality: { kind: "good" } },
    { index: amount(200) },
  ];
  const expected = [550, 1650, 1700, 1900];
  results.forEach((result, index) => {
    assert.equal(model.getSnapshot().round, index + 1);
    assert.equal(model.nextRound(), false, "no advance before results");
    assert.equal(model.recordResult(result), true);
    assert.equal(model.recordResult({ index: amount(1000) }), false, "duplicate result cannot award twice");
    assert.equal(model.getSnapshot().canAdvance, false, "wait for the other two results");
    finishOpponents();
    if (index < 3) {
      assert.equal(model.getSnapshot().balance, expected[index]);
      assert.equal(model.nextRound(), true);
    } else {
      assert.equal(model.getSnapshot().phase, "finale-ready");
      assert.equal(model.getSnapshot().balance, expected[index]);
      assert.equal(model.beginFinale(), true);
      assert.equal(model.getSnapshot().finaleBank, expected[index]);
    }
  });
  assert.equal(model.getSnapshot().history.length, 4);
  assert.equal(model.nextRound(), false);
  assert.equal(model.beginFinale(), false);
});

test("opponent banks update on separate reveals and unknown or duplicate reveals are inert", () => {
  const { model, draw } = fixture();
  let updates = 0;
  const unsubscribe = model.subscribe(() => updates++);
  draw(amount(500));
  assert.equal(model.revealOpponent("alix"), true);
  const first = model.getSnapshot();
  assert.equal(first.economy.members.alix.bank, 500);
  assert.equal(first.economy.members.sam.bank, 0);
  assert.equal(first.economy.members.alix.result.amount, 500);
  assert.deepEqual(first.pendingOpponentIds, ["sam"]);
  assert.equal(model.revealOpponent("alix"), false);
  assert.equal(model.revealOpponent("stranger"), false);
  assert.strictEqual(model.getSnapshot(), first);
  draw(amount(200));
  model.revealOpponent("sam");
  assert.equal(model.getSnapshot().economy.members.sam.bank, 200);
  assert.equal(updates, 2);
  unsubscribe(); model.recordResult({ index: pass });
  assert.equal(updates, 2);
});

test("bankruptcy removes the whole bank and its perfect-launch bonus", () => {
  const { model, finishOpponents } = fixture();
  model.recordResult({ index: amount(1000) }); finishOpponents(); model.nextRound();
  model.recordResult({ index: bankrupt, launchQuality: { kind: "perfect" } });
  assert.equal(model.getSnapshot().balance, 0);
  assert.equal(model.getSnapshot().self.result.launchBonus, 0);
});

test("fourth-round exchanges stay hidden, wait for all results, then carry swapped funds to the finale", () => {
  const { model, draw, finishOpponents } = fixture();
  for (let round = 1; round <= 3; round++) {
    model.recordResult({ index: amount(500) }); finishOpponents(amount(200)); model.nextRound();
  }
  assert.equal(model.getSnapshot().round, 4);
  assert.equal(model.getSnapshot().exchangeEnabled, true);
  assert.equal(model.chooseExchange("alix"), false, "a choice requires the exchange tile");
  model.recordResult({ index: EXCHANGE_SECTOR_INDICES[0], launchQuality: { kind: "perfect" } });
  assert.equal(model.getSnapshot().choosing, false, "collect all wheel results before opening choices");
  assert.equal(model.chooseExchange("workshop:self"), false);
  assert.equal(model.chooseExchange("stranger"), false);
  assert.equal(model.chooseExchange("alix"), false);
  assert.equal(model.getSnapshot().canAdvance, false);
  draw(amount(500)); model.revealOpponent("alix");
  draw(pass); model.revealOpponent("sam");
  const hidden = model.getSnapshot();
  assert.equal(hidden.phase, "exchange-choice");
  assert.equal(hidden.balance, 1600);
  assert.equal(hidden.finaleBank, null);
  assert.equal(hidden.economy.members[hidden.selfId].bank, 1600);
  for (const id of hidden.opponentIds) {
    const member = hidden.economy.members[id];
    assert.ok(!Object.hasOwn(member, "bank"));
    assert.ok(!Object.hasOwn(member, "result"));
  }
  assert.ok(hidden.history.every(entry => entry.hidden && !entry.members));
  assert.equal(model.chooseExchange("alix"), true);
  assert.equal(model.getSnapshot().phase, "exchange-replay");
  assert.equal(model.beginFinale(), false, "the exchange must be shown first");
  assert.equal(model.getSnapshot().balance, 1600);
  assert.equal(model.advanceExchange(0), true);
  assert.equal(model.advanceExchange(0), false, "a repeated animation callback cannot swap again");
  assert.equal(model.chooseExchange("sam"), false, "settled exchange cannot be changed");
  assert.equal(model.beginFinale(), true);
  assert.equal(model.getSnapshot().finaleBank, 1100);
  assert.equal(model.getSnapshot().economy.members.alix.bank, 1600);
  assert.equal(model.getSnapshot().history[3].exchanges.length, 1);
});

test("opponents can initiate exchanges and settlement follows a fixed order", () => {
  const { model, draw, finishOpponents } = fixture();
  for (let round = 1; round <= 3; round++) {
    model.recordResult({ index: amount(500) }); finishOpponents(amount(200)); model.nextRound();
  }
  model.recordResult({ index: pass });
  draw(EXCHANGE_SECTOR_INDICES[0]);
  model.revealOpponent("alix"); // The same small draw chooses self as target.
  draw(pass); model.revealOpponent("sam");
  assert.equal(model.getSnapshot().economy.members.alix.target, "workshop:self");
  model.advanceExchange(0);
  model.beginFinale();
  assert.equal(model.getSnapshot().finaleBank, 600);
  assert.equal(model.getSnapshot().economy.members.alix.bank, 1500);
  assert.equal(Object.values(model.getSnapshot().economy.members).reduce((sum, member) => sum + member.bank, 0), 2700);
});

test("simultaneous self and opponent exchanges give the same outcome whichever result arrives first", () => {
  function play(opponentFirst) {
    const { model, draw, finishOpponents } = fixture();
    for (let round = 1; round <= 3; round++) {
      model.recordResult({ index: amount(500) }); finishOpponents(amount(200)); model.nextRound();
    }
    const self = () => {
      model.recordResult({ index: EXCHANGE_SECTOR_INDICES[0], launchQuality: { kind: "perfect" } });
    };
    const opponent = () => { draw(EXCHANGE_SECTOR_INDICES[0]); model.revealOpponent("alix"); };
    if (opponentFirst) { opponent(); self(); } else { self(); opponent(); }
    draw(amount(500)); model.revealOpponent("sam");
    model.chooseExchange("sam");
    while (model.getSnapshot().activeExchange) model.advanceExchange(model.getSnapshot().exchangeIndex);
    model.beginFinale();
    const state = model.getSnapshot();
    assert.equal(state.history[3].exchanges.length, 2);
    assert.equal(Object.values(state.economy.members).reduce((sum, member) => sum + member.bank, 0), 3300);
    return Object.fromEntries(Object.entries(state.economy.members).map(([id, member]) => [id, member.bank]));
  }
  assert.deepEqual(play(true), play(false));
});

test("the forced workshop scenario supports three exchanges and an expired choice always swaps", () => {
  const { model, finishOpponents } = fixture();
  model.setScenario("all-exchange");
  for (let round = 1; round <= 3; round++) {
    model.recordResult({ index: amount(500) }); finishOpponents(amount(200)); model.nextRound();
  }
  model.recordResult({ index: pass }); finishOpponents(pass);
  assert.equal(model.getSnapshot().self.result.kind, "exchange");
  assert.equal(model.getSnapshot().choosing, true);
  assert.equal(model.chooseAutomaticExchange(), true);
  assert.equal(model.chooseAutomaticExchange(), false);
  assert.equal(model.getSnapshot().exchanges.length, 2);
  for (let step = 0; step < 2; step++) {
    assert.equal(model.getSnapshot().canAdvance, false);
    model.advanceExchange(step);
  }
  assert.equal(model.getSnapshot().canAdvance, true);
  assert.equal(model.getSnapshot().self.choiceMade, true);
  assert.equal(model.getSnapshot().self.target, null);
  assert.equal(Object.values(model.getSnapshot().economy.members).reduce((sum, member) => sum + member.bank, 0), 2700);
});

test("invalid results cannot inject amounts or advance the tournament", () => {
  const { model } = fixture();
  const initial = model.getSnapshot();
  assert.equal(model.recordResult({ index: -1, amount: 999999 }), false);
  assert.equal(model.recordResult({ index: 100 }), false);
  assert.equal(model.beginFinale(), false);
  assert.strictEqual(model.getSnapshot(), initial);
  model.recordResult({ index: amount(200), amount: 999999, launchQuality: { kind: "invented" } });
  assert.equal(model.getSnapshot().balance, 200);
  assert.throws(() => createWorkshopTournament({ contestants: [contestants[0], contestants[0]] }));
});
