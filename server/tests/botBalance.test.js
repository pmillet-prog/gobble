import assert from "node:assert/strict";
import test from "node:test";
import {
  BOT_ANIMATOR_ROSTER,
  BOT_ROSTER_4X4,
  MAX_WORDS_PER_BOT_PER_ROUND,
  createBotManager,
  pickWordsForBot,
  tuneBotProfile,
} from "../bots/botManager.js";

const HOST_ORDER = ["Bernard Pinot", "Maître Gobbello", "Julien Lechéper", "Laurent Rhum&Co"];
const hosts = HOST_ORDER.map(nick => BOT_ANIMATOR_ROSTER.find(bot => bot.nick === nick));

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSolutions(count, { rare = false, speed = false } = {}) {
  return new Map(Array.from({ length: count }, (_, index) => {
    const length = 3 + index % 9;
    const word = String.fromCharCode(97 + index % 26, 97 + Math.floor(index / 26) % 26)
      + "a".repeat(length - 2);
    const rareBonusWord = rare && index % 7 === 0;
    return [word, {
      pts: speed ? 11 : 2 + length * 2 + (index * 17) % 63,
      path: [0, 1, 2],
      rareBonusWord,
      rareBonusPoints: rareBonusWord ? 10 : 0,
      rarityBucket: rareBonusWord ? "very_rare" : "",
      rarityScore: rareBonusWord ? 720 : 0,
    }];
  }));
}

function averageScore(solutions, bot, options) {
  let total = 0;
  for (let seed = 1; seed <= 128; seed++) {
    const words = pickWordsForBot(solutions, tuneBotProfile(bot), { ...options, rand: seededRandom(seed * 907) });
    assert.equal(new Set(words).size, words.length);
    assert.ok(words.length <= MAX_WORDS_PER_BOT_PER_ROUND);
    total += words.reduce((sum, word) => {
      const entry = solutions.get(word);
      assert.ok(entry, "a bot may only select solutions available on the grid");
      return sum + entry.pts + (entry.rareBonusPoints || 0);
    }, 0);
  }
  return total / 128;
}

for (const gridSize of [4, 5]) {
  for (const roundType of [null, "speed"]) {
    for (const count of [45, 160, 500]) {
      test(`presenter score milestones stay distinct: ${gridSize}x${gridSize}, ${roundType || "normal"}, ${count} solutions`, () => {
        const solutions = makeSolutions(count, { rare: !roundType, speed: roundType === "speed" });
        const scores = hosts.map(bot => averageScore(solutions, bot, { gridSize, roundType }));
        for (let index = 1; index < scores.length; index++) {
          assert.ok(scores[index - 1] >= scores[index] * 1.12,
            `${HOST_ORDER[index - 1]} (${scores[index - 1]}) must be a distinct milestone above ${HOST_ORDER[index]} (${scores[index]})`);
        }
      });
    }
  }
}

test("Bernard Pinot stays near Proutosaurus with variable scores", () => {
  const solutions = makeSolutions(240);
  const proutosaurus = BOT_ROSTER_4X4.find(bot => bot.nick === "Proutosaurus Rex");
  const pinot = averageScore(solutions, hosts[0], { gridSize: 4 });
  const prout = averageScore(solutions, proutosaurus, { gridSize: 4 });
  assert.ok(pinot >= prout * 0.85 && pinot <= prout * 1.03, `Pinot ${pinot}, Proutosaurus ${prout}`);
  const pinotScores = new Set(Array.from({ length: 32 }, (_, seed) =>
    pickWordsForBot(solutions, tuneBotProfile(hosts[0]), { rand: seededRandom(seed) })
      .reduce((sum, word) => sum + solutions.get(word).pts, 0)));
  assert.ok(pinotScores.size > 16, "scores should still vary from round to round");
});

test("a busy room applies calibrated profiles and retains its submission budget", () => {
  const plans = new Map();
  const manager = createBotManager({
    rooms: new Map(), dictionary: new Set(), ensurePlayerInRound() {},
    emitPlayers() {}, broadcastProvisionalRanking() {},
  });
  const room = {
    id: "balance-test", config: { gridSize: 4 },
    players: new Map([...BOT_ROSTER_4X4, ...BOT_ANIMATOR_ROSTER].map(bot => [`bot-${bot.nick}`, { nick: bot.nick }])),
    currentRound: {
      id: "balance-round", status: "running", endsAt: Date.now() + 120000,
      solutions: [...makeSolutions(500)].map(([word, entry]) => ({ word, ...entry })),
    },
  };
  const scores = new Map(hosts.map(bot => [bot.nick, 0]));
  const solutionScores = new Map(room.currentRound.solutions.map(entry => [entry.word, entry.pts]));
  // Capture plans synchronously: never schedule submissions or start a server.
  manager.scheduleBotWords = (_room, bot, words) => plans.set(bot.nick, { bot, words });
  try {
    for (const bot of [...BOT_ROSTER_4X4, ...BOT_ANIMATOR_ROSTER]) {
      manager.manualBotOverrides.set(manager.manualOverrideKey(room.id, bot.nick), { active: true });
    }
    for (let round = 0; round < 64; round++) {
      room.currentRound.id = `balance-round-${round}`;
      plans.clear();
      manager.onRoundStart(room);
      assert.equal(plans.size, room.players.size);
      assert.ok([...plans.values()].reduce((sum, plan) => sum + plan.words.length, 0) <= 900);
      for (const bot of hosts) {
        const plan = plans.get(bot.nick);
        assert.equal(plan.bot.difficultyScale, 1, "the presenter must not receive a second volume reduction");
        assert.ok(plan.words.length <= bot.maxWordsPerRound);
        assert.ok(plan.words.length > 0);
        scores.set(bot.nick, scores.get(bot.nick) + plan.words.reduce((sum, word) => sum + solutionScores.get(word), 0));
      }
    }
    // Milestones are average strengths; individual rounds can still reverse them.
    for (let index = 1; index < hosts.length; index++) {
      assert.ok(scores.get(hosts[index - 1].nick) > scores.get(hosts[index].nick) * 1.1,
        `congested room: ${JSON.stringify([...scores])}`);
    }
  } finally {
    manager.clearTimers(room.id);
    clearInterval(manager.presenceInterval);
  }
});
