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
  let clock = 1000, changes = [], closeTimer;
  const policy = { ...infortuneRoundPolicy({ enabled: true, round, totalRounds: 5 }), openedAt: clock };
  const instance = createInfortuneRoundEconomy({ ledger, policy, groups, random, now: () => clock,
    timers: { setTimeout(fn) { closeTimer = fn; return 1; }, clearTimeout() { closeTimer = null; } },
    onChange(value) { changes.push(value); } });
  return { ...instance, ledger, changes, expire() { clock = 1000 + policy.windowMs; closeTimer?.(); },
    spin(id, index, quality) { return instance.submit(`user:${id}`, { type: "spin", index, quality }); },
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

test("the fourth round never serializes balances, including snapshots and acknowledgements", () => {
  const instance = game(); instance.ledger.banks.set("user:1", 123456);
  const reply = instance.spin(1, EXCHANGE_SECTOR_INDICES[0], "perfect");
  for (const snapshot of [reply.economy, instance.snapshot(), ...instance.changes]) {
    assert.equal(snapshot.hidden, true);
    assert.ok(Object.values(snapshot.members).every(member => !("bank" in member)));
    assert.ok(!JSON.stringify(snapshot).includes("123456"));
  }
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
  assert.equal(instance.choose(2, null).ok, false);
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
  instance.spin(1, EXCHANGE_SECTOR_INDICES[0]); instance.choose(1, "b1"); instance.spin(2, pass);
  assert.equal(instance.ledger.banks.get("user:1"), 2000);
  instance.spin(3, EXCHANGE_SECTOR_INDICES[0]); instance.choose(3, "b2"); instance.spin(4, pass);
  assert.equal(instance.ledger.banks.get("user:3"), 2000);
  assert.equal(instance.ledger.presenters.get("pivot"), 2000); instance.close();
});

test("a disconnected player cannot block settlement; chosen swaps still apply at the deadline", () => {
  const instance = game(); instance.ledger.banks.set("user:2", 700);
  instance.spin(1, EXCHANGE_SECTOR_INDICES[0]); instance.choose(1, "user:2");
  assert.deepEqual(instance.snapshot().resolvedGroups, []);
  instance.expire();
  assert.equal(instance.ledger.banks.get("user:1"), 700);
  assert.equal(instance.snapshot().members["user:2"].spin, "skipped");
  instance.spin(2, 18); assert.equal(instance.ledger.banks.get("user:2"), 0);
});

test("presenters also draw their fourth-round overlay and choose inside their own group", () => {
  const groups = [{ id: "g1", members: [human(1), human(2), { id: "b1", isBot: true, presenterKey: "pivot" }] }];
  const instance = game({ groups, random: () => (EXCHANGE_SECTOR_INDICES[0] + 0.1) / WHEEL_SECTORS.length });
  const bot = instance.snapshot().members.b1;
  assert.equal(bot.needsExchange, true); assert.equal(bot.choiceMade, true);
  assert.ok(["user:1", "user:2"].includes(bot.target)); instance.close();
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
