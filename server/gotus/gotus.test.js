import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createGotusCatalog, loadGotusCatalog } from "./gotusCatalog.js";
import { createGotusService } from "./createGotusService.js";
import { createGotusSocketHandlers } from "./registerGotusHandlers.js";
import { getGotusResult, getTargetMiniGameMetadata } from "./gotusRoundResults.js";
import { resolveTargetQuizContext } from "../targetMiniGame/registerTargetQuizHandlers.js";
import { evaluateGotusGuess, normalizeGotusWord } from "../../shared/gotusRules.js";

const WORDS = ["BALLON", "BANANE", "BALLES", "TABLES", "CHAISE", "MAISON", "MANGES", "RACINE"];
const catalog = createGotusCatalog({ wordLength: 6, accepted: WORDS, targets: ["BALLON"] });
const profile = { totalWins: 9, words: 9, cycles: 0, target: 10, rewardAmount: 500 };

async function fixture(options = {}) {
  let at = 10000;
  const writes = [];
  const activity = [];
  const round = { id: 42, status: "running", endsAt: 150000, special: { type: "target_long" }, targetFoundAt: new Map() };
  const room = { id: "live", currentRound: round, players: new Map() };
  const service = createGotusService({
    loadCatalog: async () => catalog,
    loadProfile: async () => profile,
    recordWin: async payload => {
      writes.push(payload);
      return { ok: true, recorded: true, progression: { before: profile,
        after: { ...profile, totalWins: 10, words: 0, cycles: 1 },
        reward: { amount: 500, balance: 1234, receipt: "receipt-1" } } };
    },
    random: () => 0.75,
    now: () => at,
    ...options,
  });
  await service.prepareRound(room.id, round);
  const dependencies = {
    getRoom: id => id === room.id ? room : null,
    getSocketPlayerIdentity: socket => socket.identity,
    areDevToolsAllowedForSocket: socket => !!socket.dev,
    now: () => at,
  };
  const handlers = createGotusSocketHandlers({ service, ...dependencies, markActivity: (room, socket, kind) => activity.push(kind) });
  let socketSequence = 0;
  function attach(userId = 7) {
    const socket = new EventEmitter();
    socket.id = `socket-${++socketSequence}`;
    socket.roomId = room.id;
    socket.identity = { userId, installId: `account-${userId}` };
    const player = { ...socket.identity, nick: `User${userId}`, connected: true };
    room.players.set(socket.id, player);
    round.targetFoundAt.set(player.nick, 1000);
    const progress = [];
    socket.on("gotus:progress", value => progress.push(value));
    handlers.register(socket);
    const request = (event, payload = {}) => new Promise(resolve => socket.emit(event, { roundId: 42, ...payload }, resolve));
    return { socket, player, request, progress };
  }
  return { ...attach(), attach, room, round, service, handlers, dependencies, writes, activity, setNow: value => { at = value; } };
}

test("French normalization and repeated letters use exact matches before yellow occurrences", () => {
  assert.equal(normalizeGotusWord(" brûlée "), "BRULEE");
  assert.deepEqual(evaluateGotusGuess("BALLON", "BANANE"), ["correct", "correct", "present", "absent", "absent", "absent"]);
  assert.deepEqual(evaluateGotusGuess("BALLON", "BALLES"), ["correct", "correct", "correct", "correct", "absent", "absent"]);
});

test("production bank keeps accepted conjugations separate from drawn targets", async () => {
  const bank = await loadGotusCatalog();
  assert.ok(bank.acceptedCount > bank.targetCount);
  assert.ok(bank.targetCount > 10000);
  assert.equal(bank.has("MANGES"), true);
  assert.match(bank.choose(() => 0.5), /^[A-Z]{6}$/);
});

test("50/50 choice is made once even with concurrent preparation and publishes no secret", async () => {
  for (const roll of [0, 0.4999, 0.5, 0.9999]) {
    let calls = 0;
    const f = await fixture({ random: () => { calls += 1; return roll; } });
    const expected = roll < 0.5 ? "quiz" : "gotus";
    await Promise.all([f.service.prepareRound("live", f.round), f.service.prepareRound("live", f.round)]);
    assert.equal(getTargetMiniGameMetadata(f.round).kind, expected);
    assert.equal(calls, expected === "gotus" ? 2 : 1);
    assert.equal(JSON.stringify(f.round).includes("BALLON"), false);
    const second = { id: 43, special: { type: "target_score" } };
    await Promise.all([f.service.prepareRound("live", second), f.service.prepareRound("live", second)]);
    assert.equal(calls, expected === "gotus" ? 4 : 2);
  }
});

test("all players get the common word; guesses and progress are private and cannot supply rewards", async () => {
  const f = await fixture();
  const other = f.attach(8);
  const first = await f.request("gotus:start", { word: "TABLES", wins: 999, playerKey: "user:99" });
  const second = await other.request("gotus:start");
  assert.equal(first.firstLetter, second.firstLetter);
  assert.equal(first.firstLetter, "B");
  assert.equal(first.solution, undefined);
  assert.equal(first.summary.solution, undefined);
  assert.equal(first.wordsFound, 0);
  assert.deepEqual(first.progression.before, profile);
  const win = await f.request("gotus:guess", { requestId: "one", word: "BALLON", points: 999999, userId: 99 });
  assert.equal(win.wordsFound, 1);
  assert.equal(win.solution, "BALLON");
  assert.equal(win.score, undefined);
  assert.equal(f.writes[0].userId, 7);
  assert.equal(f.writes[0].training, false);
  assert.equal(f.writes[0].points, undefined);
  assert.equal((await other.request("gotus:start")).attempts.length, 0);
  const otherWin = await other.request("gotus:guess", { requestId: "other", word: "BALLON" });
  assert.equal(otherWin.solution, win.solution);
  assert.equal(f.writes.length, 2);
  assert.equal(getGotusResult(f.round, f.player).wordsFound, 1);
  assert.equal(getGotusResult(f.round, f.player).progression, undefined);
});

test("invalid, repeated and retried proposals never consume extra attempts or duplicate a win", async () => {
  const f = await fixture();
  await f.request("gotus:start");
  for (const [word, error] of [["FOO", "invalid_word"], ["ZZZZZZ", "unknown_word"]]) {
    const response = await f.request("gotus:guess", { requestId: "invalid", word });
    assert.equal(response.error, error);
    assert.equal(response.attempts.length, 0);
  }
  const request = { requestId: "guess-1", word: "BANANE" };
  const first = await f.request("gotus:guess", request);
  assert.deepEqual(await f.request("gotus:guess", request), first);
  assert.equal((await f.request("gotus:guess", { ...request, word: "TABLES" })).error, "request_conflict");
  const duplicate = await f.request("gotus:guess", { ...request, requestId: "guess-2" });
  assert.equal(duplicate.error, "duplicate_guess");
  assert.equal(duplicate.attempts.length, 1);
  const winningRequest = { requestId: "win", word: "BALLON" };
  const [win, replay] = await Promise.all([f.request("gotus:guess", winningRequest), f.request("gotus:guess", winningRequest)]);
  assert.deepEqual(win, replay);
  assert.equal(f.writes.length, 1);
  assert.equal(win.progression.reward.amount, 500);
  assert.equal((await f.request("gotus:guess", { requestId: "extra", word: "BALLES" })).error, "gotus_finished");
});

test("six different wrong proposals end the single game, reveal the solution and award nothing", async () => {
  const f = await fixture();
  await f.request("gotus:start");
  let result;
  for (const [index, word] of WORDS.slice(1, 7).entries()) result = await f.request("gotus:guess", { requestId: `guess-${index}`, word });
  assert.equal(result.phase, "lost");
  assert.equal(result.remainingAttempts, 0);
  assert.equal(result.solution, "BALLON");
  assert.equal(f.writes.length, 0);
  assert.equal((await f.request("gotus:start")).phase, "lost");
});

test("same user resumes the exact board after reconnect and cannot run it on two sockets", async () => {
  const f = await fixture();
  await f.request("gotus:start");
  const first = await f.request("gotus:guess", { requestId: "a", word: "BALLES" });
  const duplicateTab = f.attach(7);
  assert.equal((await duplicateTab.request("gotus:start")).error, "gotus_in_use");
  f.socket.emit("disconnect");
  f.room.players.delete(f.socket.id);
  const resumed = await duplicateTab.request("gotus:start");
  assert.deepEqual(resumed.attempts, first.attempts);
  assert.deepEqual(resumed.known, first.known);
  const won = await duplicateTab.request("gotus:guess", { requestId: "b", word: "BALLON" });
  assert.equal(won.summary.attemptsUsed, 2);
  assert.equal(f.writes.length, 1);
});

test("Gotus inherits the exact quiz five-second discovery cutoff and server deadline", async () => {
  for (const type of ["target_long", "target_score"]) for (const remaining of [4999, 5000, 5001]) {
    const f = await fixture();
    f.round.special.type = type;
    f.round.targetFoundAt.set(f.player.nick, f.round.endsAt - remaining);
    f.setNow(f.round.endsAt - 1);
    const result = await f.request("gotus:start");
    assert.equal(result.ok, remaining > 5000);
    if (remaining <= 5000) assert.equal(result.error, "target_found_too_late");
    else {
      f.setNow(f.round.endsAt);
      assert.equal((await f.request("gotus:guess", { requestId: "late", word: "BALLON", endsAt: 999999999 })).error, "round_finished");
      assert.equal(f.writes.length, 0);
    }
  }
});

test("training, spoofed identity, bots, wrong games and unsolved targets cannot acquire wins", async () => {
  const cases = [
    [f => { f.round.training = true; }, "training_disabled"],
    [f => { f.player.standaloneTraining = { sessionId: "solo", mode: "gotus" }; }, "training_disabled"],
    [f => { f.player.trainingPresenceOnly = true; }, "training_disabled"],
    [f => { f.player.token = "bot-fake"; }, "not_logged_in"],
    [f => { f.player.userId = 99; }, "not_logged_in"],
    [f => { f.socket.identity = null; }, "auth_required"],
    [f => { f.round.targetFoundAt.clear(); }, "target_not_found"],
    [f => { f.round.id = 43; }, "stale_round"],
    [f => { f.round.targetMiniGame = { kind: "quiz" }; }, "mini_game_unavailable"],
  ];
  for (const [change, error] of cases) {
    const f = await fixture(); change(f);
    assert.equal((await f.request("gotus:start", { training: false, won: true })).error, error);
    assert.equal(f.writes.length, 0);
  }
  const f = await fixture();
  assert.throws(() => resolveTargetQuizContext(f.socket, { roundId: 42 }, f.dependencies), /mini_game_unavailable/);
  f.player.standaloneTraining = { sessionId: "training" };
  f.socket.dev = true;
  assert.equal((await f.request("gotus:start", { devPreview: true })).error, "training_disabled");
});

test("training switch after loading and before answering is checked again", async () => {
  let release;
  const f = await fixture({ loadProfile: () => new Promise(resolve => { release = resolve; }) });
  const pending = f.request("gotus:start");
  await new Promise(resolve => setImmediate(resolve));
  f.player.standaloneTraining = { sessionId: "training" };
  release(profile);
  assert.equal((await pending).error, "training_disabled");
  assert.equal(f.writes.length, 0);
});

test("round closure waits for accepted win persistence and reveals unfinished solutions without extra reward", async () => {
  let release;
  const f = await fixture({ recordWin: () => new Promise(resolve => { release = resolve; }) });
  const other = f.attach(8);
  await f.request("gotus:start");
  await other.request("gotus:start");
  const pending = f.request("gotus:guess", { requestId: "win", word: "BALLON" });
  await new Promise(resolve => setImmediate(resolve));
  f.round.status = "finished";
  f.setNow(f.round.endsAt);
  const closing = f.handlers.closeRoomRound("live", 42);
  release({ ok: true, recorded: true, progression: { before: profile, after: { ...profile, totalWins: 10 }, reward: null } });
  assert.equal((await pending).phase, "won");
  await closing;
  assert.equal(getGotusResult(f.round, f.player).won, true);
  assert.equal(getGotusResult(f.round, other.player).phase, "expired");
  assert.equal(getGotusResult(f.round, other.player).solution, "BALLON");
  assert.equal((await f.request("gotus:start")).error, "round_finished");
});

test("failed durable win can be retried without consuming another attempt", async () => {
  let calls = 0;
  const f = await fixture({ recordWin: async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary_failure");
    return { ok: true, recorded: true, progression: { before: profile, after: { ...profile, totalWins: 10 }, reward: null } };
  } });
  await f.request("gotus:start");
  const request = { requestId: "win", word: "BALLON" };
  assert.equal((await f.request("gotus:guess", request)).error, "temporary_failure");
  const result = await f.request("gotus:guess", request);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.won, true);
  assert.equal(calls, 2);
});

test("dismissal and developer previews never record a live win", async () => {
  const f = await fixture();
  await f.request("gotus:start");
  const dismissed = await f.request("gotus:dismiss");
  assert.equal(dismissed.phase, "dismissed");
  assert.equal(dismissed.solution, undefined);
  assert.equal((await f.request("gotus:guess", { requestId: "a", word: "BALLON" })).error, "gotus_finished");
  assert.equal(f.writes.length, 0);
  const preview = await fixture();
  preview.socket.dev = true;
  preview.round.targetFoundAt.clear();
  await preview.request("gotus:start", { devPreview: true });
  // Every action must retain its explicitly authorized preview identity.
  const win = await preview.request("gotus:guess", { devPreview: true, requestId: "dev", word: "BALLON" });
  assert.equal(win.phase, "won");
  assert.equal(preview.writes.length, 0);
  assert.equal(preview.round.gotusResults, undefined);
});
