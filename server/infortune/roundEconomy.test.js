import test from "node:test";
import assert from "node:assert/strict";
import { createInfortuneLedger, creditInfortuneGobbles, createInfortuneRoundEconomy } from "./roundEconomy.js";
import { registerInfortuneHandlers } from "./registerInfortuneHandlers.js";
import { infortuneRoundPolicy } from "../../shared/infortuneIntermission.js";
import { WHEEL_SECTORS, EXCHANGE_SECTOR_INDICES } from "../../shared/infortuneWheel.js";

const human = id => ({ id: `user:${id}`, userId: id, nick: `J${id}`, isBot: false });
const trio = { id: "g1", members: [human(1), human(2), human(3)] };
const fiveHundred = WHEEL_SECTORS.findIndex(sector => sector.amount === 500);
const twoHundred = WHEEL_SECTORS.findIndex(sector => sector.amount === 200);
const pass = WHEEL_SECTORS.findIndex(sector => sector.kind === "pass");
function game({ round = 4, groups = [trio], ledger = createInfortuneLedger(), random = () => 0.4 } = {}) {
  let clock = 1000, changes = [], timerId = 0;
  const jobs = new Map();
  function at(target) {
    for (;;) {
      const next = [...jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at; jobs.delete(next[0]); next[1].fn();
    }
    clock = target;
  }
  const policy = { ...infortuneRoundPolicy({ enabled: true, round, totalRounds: 5 }), openedAt: clock };
  const instance = createInfortuneRoundEconomy({ ledger, policy, groups, random, now: () => clock,
    timers: { setTimeout(fn, delay) { const id = ++timerId; jobs.set(id, { fn, at: clock + delay }); return id; }, clearTimeout(id) { jobs.delete(id); } },
    onChange(value) { changes.push(value); } });
  return { ...instance, ledger, changes, at, expire() { at(1000 + policy.windowMs); },
    spin(id, index, quality) {
      const reply = instance.submit(`user:${id}`, { type: "spin", index, quality });
      instance.submit(`user:${id}`, { type: "presented" }); return reply;
    },
    choose(id, target) { return instance.submit(`user:${id}`, { type: "exchange", target }); } };
}

test("gobbles and wheel gains accumulate once per account and round; Bonus, Passe and Banqueroute use the agreed rules", () => {
  const ledger = createInfortuneLedger();
  creditInfortuneGobbles(ledger, "r1", [human(1), human(1), human(2)], new Map([["J1", 2]]));
  creditInfortuneGobbles(ledger, "r1", [human(1)], new Map([["J1", 99]]));
  const first = game({ round: 1, ledger });
  assert.equal(first.spin(1, fiveHundred, "good").ok, true); // 200 + 500 + 50
  first.spin(1, 18, "perfect"); // repeated spin cannot replace the first
  assert.equal(ledger.banks.get("user:1"), 750);
  assert.equal(first.snapshot().members["user:1"].bank, 750);
  first.close();
  const second = game({ round: 2, ledger });
  second.spin(1, 6, "perfect"); assert.equal(ledger.banks.get("user:1"), 1850);
  second.close();
  const third = game({ round: 3, ledger });
  third.spin(1, pass, "good"); assert.equal(ledger.banks.get("user:1"), 1900);
  third.close();
  const fourth = game({ ledger });
  fourth.spin(1, 12, "perfect"); assert.equal(ledger.banks.get("user:1"), 0);
  assert.equal(createInfortuneLedger().banks.size, 0); fourth.close();
});

test("round four keeps only the viewer's bank visible before settlement", () => {
  const instance = game(); instance.ledger.banks.set("user:1", 123456);
  const reply = instance.spin(1, EXCHANGE_SECTOR_INDICES[0], "perfect");
  assert.equal(reply.economy.members["user:1"].bank, 123556);
  assert.ok(!("bank" in reply.economy.members["user:2"]));
  for (const snapshot of [instance.snapshot(), ...instance.changes]) {
    assert.equal(snapshot.hidden, true);
    assert.ok(Object.values(snapshot.members).every(member => !("bank" in member)));
    assert.ok(!JSON.stringify(snapshot).includes("123456"));
  }
  instance.close();
});

test("settlement publishes every step of three swaps without disclosing another trio's banks", () => {
  const instance = game({ groups: [trio, { id: "g2", members: [human(4), human(5), human(6)] }] });
  [100, 500, 900, 123456].forEach((value, i) => instance.ledger.banks.set(`user:${i + 1}`, value));
  for (const id of [1,2,3]) instance.spin(id, EXCHANGE_SECTOR_INDICES[0]);
  for (const id of [4,5,6]) instance.spin(id, EXCHANGE_SECTOR_INDICES[0]);
  instance.choose(1, "user:2"); instance.choose(2, "user:3");
  assert.deepEqual(instance.snapshot().exchangeReplays, {});
  instance.choose(3, "user:1");
  const snapshot = instance.snapshot(), banks = { "user:1": 100, "user:2": 500, "user:3": 900 };
  assert.equal(snapshot.exchangeReplays.g1.length, 3);
  for (const step of snapshot.exchangeReplays.g1) {
    assert.equal(banks[step.from], step.sourceBank); assert.equal(banks[step.to], step.targetBank);
    [banks[step.from], banks[step.to]] = [banks[step.to], banks[step.from]];
  }
  for (const [id, value] of Object.entries(banks)) assert.equal(snapshot.members[id].bank, value);
  assert.ok(snapshot.members["user:1"].revealed);
  assert.ok(!Object.hasOwn(snapshot.members["user:4"], "bank"));
  assert.ok(!JSON.stringify(snapshot).includes("123456"));
  snapshot.exchangeReplays.g1[0].sourceBank = 999;
  assert.notEqual(instance.snapshot().exchangeReplays.g1[0].sourceBank, 999);
  instance.close();
});

test("simultaneous swaps follow the frozen order, conserve the pot and ignore network arrival order and duplicate commands", () => {
  function play(sequence) {
    const instance = game(); const ledger = instance.ledger;
    [100, 500, 900].forEach((bank, i) => ledger.banks.set(`user:${i + 1}`, bank));
    instance.spin(1, EXCHANGE_SECTOR_INDICES[0]); instance.spin(2, EXCHANGE_SECTOR_INDICES[1]); instance.spin(3, twoHundred);
    for (const id of sequence) instance.choose(id, `user:${id + 1}`);
    const result = [...ledger.banks];
    assert.deepEqual(instance.snapshot().resolvedGroups, ["g1"]);
    assert.equal([...ledger.banks.values()].reduce((a, b) => a + b), 1700);
    instance.choose(1, "user:3"); instance.spin(3, 18);
    assert.deepEqual([...ledger.banks], result); instance.close(); return result;
  }
  assert.deepEqual(play([1, 2]), play([2, 1]));
});

test("only an exchange tile authorizes a choice, and targets stay inside the trio", () => {
  const instance = game({ groups: [trio, { id: "g2", members: [human(4), human(5), human(6)] }] });
  assert.equal(instance.choose(1, "user:2").ok, false);
  instance.spin(1, fiveHundred); assert.equal(instance.choose(1, "user:2").ok, false);
  instance.spin(2, EXCHANGE_SECTOR_INDICES[0]);
  assert.equal(instance.snapshot('user:2').members['user:2'].choiceUntil, null, 'the timer waits until every player in this trio can choose');
  for (const id of [3,4,5,6]) instance.spin(id, pass);
  assert.equal(instance.choose(2, undefined).ok, false);
  assert.equal(instance.choose(2, "user:2").ok, false);
  assert.equal(instance.choose(2, "user:4").ok, false);
  assert.equal(instance.choose(2, "missing").ok, false);
  assert.equal(instance.choose(2, "user:1").ok, true);
  instance.close();
});

test("a presenter has an exchangeable balance, isolated from another appearance of the same presenter", () => {
  const bot = id => ({ id, isBot: true, presenterKey: "pivot", nick: "Bernard Pinot" });
  const groups = [{ id: "g1", members: [human(1), human(2), bot("b1")] },
    { id: "g2", members: [human(3), human(4), bot("b2")] }];
  const instance = game({ groups, random: () => (fiveHundred + 0.1) / WHEEL_SECTORS.length }); // presenter earns four 500s
  instance.ledger.banks.set("user:1", 100);
  instance.spin(1, EXCHANGE_SECTOR_INDICES[0]); instance.spin(2, pass);
  instance.spin(3, EXCHANGE_SECTOR_INDICES[0]); instance.spin(4, pass);
  instance.choose(1, "b1");
  assert.equal(instance.ledger.banks.get("user:1"), 2000);
  instance.choose(3, "b2");
  assert.equal(instance.ledger.banks.get("user:3"), 2000);
  assert.equal(instance.ledger.presenters.get("pivot"), 2000); instance.close();
});

test("a disconnected player is spun automatically and declines an unanswered exchange", () => {
  const instance = game({ random: () => (pass + 0.1) / WHEEL_SECTORS.length }); instance.ledger.banks.set("user:2", 700);
  instance.spin(1, EXCHANGE_SECTOR_INDICES[0]);
  assert.deepEqual(instance.snapshot().resolvedGroups, []);
  instance.expire(); instance.close();
  const snapshot = instance.snapshot();
  assert.equal(snapshot.members["user:1"].target, null);
  assert.equal(snapshot.members["user:1"].choiceMade, true);
  assert.equal(instance.ledger.banks.get('user:2'),700);
  assert.equal(snapshot.members["user:2"].spin, "done");
  const before = [...instance.ledger.banks];
  instance.spin(2, 18); assert.deepEqual([...instance.ledger.banks], before);
});

test("presenters never initiate fourth-round exchanges, but humans can still choose them", () => {
  const groups = [{ id: "g1", members: [human(1), human(2), { id: "b1", isBot: true, presenterKey: "pivot" }] }];
  const instance = game({ groups, random: () => (EXCHANGE_SECTOR_INDICES[0] + 0.1) / WHEEL_SECTORS.length });
  const bot = instance.snapshot().members.b1;
  assert.equal(bot.needsExchange, false); assert.equal(bot.choiceMade, true);
  assert.equal(bot.target, null);
  assert.equal(instance.submit('b1', { type: 'exchange', target: 'user:1' }).ok, false);
  instance.ledger.banks.set('user:1', 1234);
  instance.spin(1, EXCHANGE_SECTOR_INDICES[0]); instance.spin(2, pass);
  assert.equal(instance.choose(1, 'b1').ok, true);
  assert.equal(instance.snapshot().members.b1.bank, 1234);
  assert.equal(instance.snapshot().exchangeReplays.g1.length, 1);
  assert.equal(instance.snapshot().exchangeReplays.g1[0].from, 'user:1'); instance.close();
});

test("socket handlers use the connected account and current room, never the submitted identity", () => {
  const handlers = new Map(), calls = [], socket = { id: "s1", roomId: "room", on(name, handler) { handlers.set(name, handler); } };
  const room = { id: "room", players: new Map([["s1", human(1)]]), currentRound: { id: "r1", infortuneGame: {
    submit(id, value) { calls.push({ id, value }); return { ok: true }; },
  } } };
  registerInfortuneHandlers(socket, { getRoom: () => room });
  const handle = handlers.get("infortune:action"); let reply;
  handle({ roomId: "room", roundId: "old", type: "spin" }, value => { reply = value; });
  assert.equal(reply.ok, false); assert.equal(calls.length, 0);
  handle({ roomId: "room", roundId: "r1", userId: 2, type: "snapshot" }, value => { reply = value; });
  assert.equal(reply.ok, true); assert.equal(calls[0].id, "user:1");
});

test("round four allows fifty seconds and reserves ten seconds for choices after the cameras return", () => {
  const instance = game();
  assert.equal(instance.snapshot().deadlineAt, 51_000);
  assert.equal(instance.snapshot().spinDeadlineAt, 41_000);
  const ready = instance.submit("user:1", { type: "ready" });
  assert.equal(ready.economy.members["user:1"].launchUntil, 11_000);
  assert.equal(instance.submit("user:1", { type: "ready" }).economy.members["user:1"].launchUntil, 11_000);
  instance.submit("user:1", { type: "spin", index: EXCHANGE_SECTOR_INDICES[0] });
  instance.spin(2, pass); instance.spin(3, pass);
  assert.equal(instance.snapshot().choiceUntil, null, "a return-to-plateau animation must not eat into the choice time");
  instance.submit("user:1", { type: "presented" });
  assert.equal(instance.snapshot().choiceUntil, 11_000);
  instance.close();
  assert.equal(instance.snapshot().members["user:1"].choiceMade, true);
  assert.equal(instance.snapshot().members["user:1"].target, null);
});

test('launch progress changes at launch rather than at the final result and remains public when banks are hidden', () => {
  const instance = game();
  assert.equal(instance.snapshot().pendingLaunches, 3);
  instance.submit('user:1', { type: 'launch', quality: 'good' });
  assert.equal(instance.snapshot().pendingLaunches, 2);
  assert.equal(instance.snapshot().pendingResults, 3);
  instance.submit('user:1', { type: 'launch', quality: 'perfect' });
  assert.equal(instance.snapshot().pendingLaunches, 2);
  instance.spin(1, pass); instance.spin(2, pass);
  assert.equal(instance.snapshot().pendingLaunches, 1);
  assert.equal(instance.snapshot().pendingResults, 1);
  assert.ok(Object.values(instance.snapshot().members).every(member => !Object.hasOwn(member, 'bank')));
  instance.close();
  assert.equal(instance.snapshot().pendingLaunches, 0);
  assert.equal(instance.snapshot().pendingResults, 0);
});

test('declining an exchange is final, finishes the group early, and does not prevent another player from choosing you', () => {
  const instance = game();
  [100, 500, 900].forEach((bank, index) => instance.ledger.banks.set(`user:${index + 1}`, bank));
  assert.equal(instance.choose(1, null).ok, false);
  instance.spin(1, EXCHANGE_SECTOR_INDICES[0]);
  instance.spin(2, EXCHANGE_SECTOR_INDICES[0]); instance.spin(3, pass);
  assert.equal(instance.choose(3, null).ok, false);
  assert.equal(instance.choose(1, null).ok, true);
  assert.equal(instance.choose(1, 'user:3').ok, true);
  assert.equal(instance.snapshot().members['user:1'].target, null);
  assert.equal(instance.choose(2, 'user:1').ok, true);
  const state = instance.snapshot();
  assert.equal(state.complete, true);
  assert.equal(state.exchangeReplays.g1.length, 1);
  assert.equal(state.members['user:1'].bank, 500);
  assert.equal(state.members['user:2'].bank, 100);
  instance.close();
  assert.equal(instance.snapshot().exchangeReplays.g1.length, 1);
});

test('each trio gets ten seconds once everyone is ready; another trio can keep spinning independently', () => {
  const instance = game({ groups: [trio, { id: 'g2', members: [human(4), human(5), human(6)] }] });
  instance.spin(1, EXCHANGE_SECTOR_INDICES[0]);
  instance.spin(2, pass); instance.spin(3, pass);
  assert.equal(instance.snapshot('user:1').members['user:1'].choiceUntil, 11_000);
  instance.at(4000); instance.spin(4, EXCHANGE_SECTOR_INDICES[0]);
  assert.equal(instance.snapshot('user:4').members['user:4'].choiceUntil, null);
  instance.at(11_000);
  const first = instance.snapshot();
  assert.equal(first.members['user:1'].choiceMade, true);
  assert.equal(first.members['user:1'].target, null);
  instance.choose(1, 'user:2');
  assert.equal(instance.snapshot().members['user:1'].target, null, 'a late click cannot replace the timeout refusal');
  assert.equal(first.members['user:4'].choiceMade, false);
  assert.equal(first.members['user:5'].spin, 'pending');
  assert.equal(first.members['user:6'].spin, 'pending');
  assert.equal(instance.choose(4, null).ok, true);
  instance.spin(2, pass); instance.spin(3, pass);
  assert.deepEqual(instance.snapshot().resolvedGroups, ['g1']);
  assert.equal(instance.snapshot().complete, false);
  instance.at(41_000);
  assert.equal(instance.snapshot().complete, true);
  instance.dispose();
});
