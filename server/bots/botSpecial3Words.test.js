import assert from "node:assert/strict";
import test from "node:test";
import { computeScore, MOVABLE_BONUS_KEYS, scoreWordOnGridWithPath } from "../../shared/gameLogic.js";
import { createBotManager } from "./botManager.js";
import { planBotSpecial3Words } from "./botSpecial3Words.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fixture(size = 4) {
  const grid = Array.from({ length: size * size }, () => ({ letter: "E", bonus: null }));
  const index = cell => Math.floor(cell / 4) * size + cell % 4;
  [..."CHATRENSOUIEZAPS"].forEach((letter, cell) => { grid[index(cell)].letter = letter; });
  // Existing board bonuses must be replaced by the player's movable bonuses.
  grid[0].bonus = "L2";
  grid[1].bonus = "M3";
  const solutions = new Map([
    ["chat", { path: [0, 1, 2, 3].map(index) }],
    ["chats", { path: [0, 1, 2, 3, 7].map(index) }],
    ["rue", { path: [4, 9, 5].map(index) }],
    ["sein", { path: [7, 11, 10, 6].map(index) }],
    ["pain", { path: [14, 13, 10, 6].map(index) }],
    ["en", { path: [5, 6].map(index) }],
  ]);
  return { grid, solutions, words: ["chat", "chats", "rue", "sein"], timeBudget: 119500 };
}

function scoringBoard(grid, placements = {}) {
  const board = grid.map(cell => ({ ...cell, bonus: null }));
  for (const [bonus, index] of Object.entries(placements)) board[index].bonus = bonus;
  return board;
}

function score(grid, state) {
  const board = scoringBoard(grid, state.specialPlacements);
  return state.wordSlots.reduce((sum, slot) => {
    const scored = scoreWordOnGridWithPath(slot.word, board, slot.path);
    assert.ok(scored, `invalid path for ${slot.word}`);
    return sum + scored.pts;
  }, 0);
}

for (const size of [4, 5]) {
  test(`${size}x${size}: every skill uses four legal bonuses and submits valid distinct starts progressively`, () => {
    const input = fixture(size);
    const before = structuredClone(input);
    for (const skill of [0.05, 0.4, 0.9]) for (let seed = 1; seed <= 64; seed++) {
      const plan = planBotSpecial3Words({ ...input, bot: { skill }, rand: seededRandom(seed) });
      assert.ok(plan.length >= 1 && plan.length <= 3);
      let lastDelay = 0;
      let lastScore = 0;
      for (const [step, state] of plan.entries()) {
        assert.equal(state.wordSlots.length, step + 1);
        assert.ok(state.delay > lastDelay && state.delay < input.timeBudget);
        assert.deepEqual(Object.keys(state.specialPlacements).sort(), [...MOVABLE_BONUS_KEYS].sort());
        const indices = Object.values(state.specialPlacements);
        assert.equal(new Set(indices).size, 4);
        assert.ok(indices.every(index => Number.isInteger(index) && index >= 0 && index < size * size));
        assert.equal(new Set(state.wordSlots.map(slot => slot.path[0])).size, step + 1);
        assert.ok(state.wordSlots.every(slot => input.words.includes(slot.word)));
        assert.ok(!state.wordSlots.some(slot => slot.word === "chats"), "same start must be skipped");
        const total = score(input.grid, state);
        const plain = score(input.grid, { ...state, specialPlacements: {} });
        assert.ok(total > plain, "bonuses must actually help the submitted words");
        assert.ok(total >= lastScore, "adding a word or moving bonuses must not lower the score");
        lastScore = total;
        lastDelay = state.delay;
      }
    }
    assert.deepEqual(input, before, "planning must not mutate the board or shared solutions");
  });
}

test("short words still place all four bonuses; unusable words and empty rounds produce no submission", () => {
  const input = fixture();
  const short = planBotSpecial3Words({ ...input, words: ["en"], bot: { skill: 0.1 }, rand: seededRandom(3) });
  assert.equal(short.length, 1);
  assert.equal(Object.keys(short[0].specialPlacements).length, 4);
  assert.ok(score(input.grid, short[0]) > 2);
  const broken = new Map([["chat", { path: [99, 1, 2, 3] }], ["rue", { path: [4, 4, 5] }]]);
  for (const options of [{ words: [] }, { grid: [] }, { timeBudget: 0 }, { solutions: broken }]) {
    assert.deepEqual(planBotSpecial3Words({ ...input, ...options, rand: seededRandom(3) }), []);
  }
});

test("level still limits word count and score; strong bots do not routinely find optimal placements", t => {
  const input = fixture();
  const fixedSlots = ["chat", "rue", "sein"].map(word => ({ word, path: input.solutions.get(word).path }));
  const board = scoringBoard(input.grid);
  const cells = [...new Set(fixedSlots.flatMap(slot => slot.path))];
  let optimum = 0;
  function explore(depth) {
    if (depth === MOVABLE_BONUS_KEYS.length) {
      optimum = Math.max(optimum, fixedSlots.reduce((sum, slot) => sum + computeScore(slot.word, slot.path, board), 0));
      return;
    }
    for (const index of cells) {
      if (board[index].bonus) continue;
      board[index].bonus = MOVABLE_BONUS_KEYS[depth];
      explore(depth + 1);
      board[index].bonus = null;
    }
  }
  explore(0);
  const averages = [];
  for (const skill of [0.05, 0.4, 0.9]) {
    let points = 0, count = 0, optimal = 0;
    const layouts = new Set();
    for (let seed = 1; seed <= 256; seed++) {
      const plan = planBotSpecial3Words({ ...input, bot: { skill }, rand: seededRandom(seed * 907) });
      const final = plan.at(-1);
      const total = score(input.grid, final);
      points += total;
      count += final.wordSlots.length;
      optimal += Number(total === optimum);
      layouts.add(JSON.stringify(final.specialPlacements));
    }
    assert.ok(layouts.size > 12, "even a single four-letter word should allow varied placements");
    averages.push({ skill, points: points / 256, words: count / 256, optimal, layouts: layouts.size });
  }
  t.diagnostic(JSON.stringify({ averages, optimum }));
  assert.ok(averages[0].words < averages[1].words && averages[1].words < averages[2].words);
  assert.ok(averages[0].points < averages[1].points && averages[1].points < averages[2].points);
  assert.ok(averages[2].points < optimum * 0.9, "average score must retain headroom for better human placement");
  assert.ok(averages[2].optimal < 256 * 0.2, "optimal layouts must remain occasional");
});

function managerFixture(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const submissions = [];
  const manager = createBotManager({
    rooms: new Map(), dictionary: new Set(), ensurePlayerInRound() {},
    emitPlayers() {}, broadcastProvisionalRanking() {},
    submitSpecial3WordsState(room, payload) {
      submissions.push({ ...payload, score: score(room.currentRound.grid, payload), at: Date.now() });
      return { ok: true };
    },
  });
  const bot = { nick: "Test", skill: 0.9 };
  const input = fixture();
  const room = {
    id: "test", players: new Map([["bot-Test", bot]]),
    currentRound: { id: "round", status: "running", special: { type: "self_specials_3_words" },
      grid: input.grid, endsAt: Date.now() + 120000 },
  };
  clearInterval(manager.presenceInterval);
  t.after(() => manager.clearTimers(room.id));
  const schedule = () => manager.scheduleBotSpecial3Words(room, bot, input.words, input.timeBudget, input.solutions, seededRandom(9));
  return { manager, room, bot, submissions, schedule };
}

test("manager passes real bonus placements through the submission callback at separate times", t => {
  const { submissions, schedule } = managerFixture(t);
  schedule();
  for (let second = 0; second < 120; second++) t.mock.timers.tick(1000);
  assert.deepEqual(submissions.map(entry => entry.wordSlots.length), [1, 2, 3]);
  for (const entry of submissions) {
    assert.equal(entry.roundId, "round");
    assert.equal(Object.keys(entry.specialPlacements).length, 4);
    assert.ok(entry.at >= 10000 && entry.at < 120000);
  }
  assert.ok(submissions[1].at - submissions[0].at > 15000);
  assert.ok(submissions[2].at - submissions[1].at > 15000);
});

for (const reason of ["new round", "results", "expired", "bot left", "timers cleared"]) {
  test(`pending bot moves cannot leak after ${reason}`, t => {
    const { room, manager, submissions, schedule } = managerFixture(t);
    schedule();
    if (reason === "new round") room.currentRound = { ...room.currentRound, id: "next-round" };
    if (reason === "results") room.currentRound.status = "results";
    if (reason === "expired") room.currentRound.endsAt = Date.now();
    if (reason === "bot left") room.players.clear();
    if (reason === "timers cleared") manager.clearTimers(room.id);
    t.mock.timers.tick(119000);
    assert.deepEqual(submissions, []);
  });
}
