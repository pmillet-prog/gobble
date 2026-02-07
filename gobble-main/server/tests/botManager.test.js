import assert from "assert";
import {
  pickWordsForBot,
  BOT_ROSTER,
  MAX_WORDS_PER_BOT_PER_ROUND,
  isBotSleeping,
} from "../bots/botManager.js";

const solutions = new Map(
  Array.from({ length: 200 }).map((_, idx) => [`mot${idx}`, { pts: 200 - idx }])
);

const strongBot = { ...BOT_ROSTER[0], skill: 0.9, maxWordsPerRound: 180 };
const weakBot = { ...BOT_ROSTER[BOT_ROSTER.length - 1], skill: 0.2, maxWordsPerRound: 180 };

const strongWords = pickWordsForBot(solutions, strongBot);
const weakWords = pickWordsForBot(solutions, weakBot);

assert.ok(
  strongWords.length > weakWords.length,
  "bots should have distinct volumes according to skill"
);
assert.ok(
  strongWords.length <= MAX_WORDS_PER_BOT_PER_ROUND,
  "strong bot must respect hard cap"
);

const overkillBot = {
  nick: "Stress",
  skill: 1,
  maxWordsPerRound: 500,
  minWordsPerRound: 0,
  pointBias: 0.9,
};
const overkillWords = pickWordsForBot(solutions, overkillBot);
assert.ok(
  overkillWords.length <= MAX_WORDS_PER_BOT_PER_ROUND,
  "bots never exceed 140 planned words"
);

const sleepingBot = { nick: "Sleepy", sleep: { startHour: 2, durationHours: 3 } };
const awakeBot = { nick: "Awake", sleep: { startHour: 2, durationHours: 3 } };
const asleepDate = new Date();
asleepDate.setHours(3, 0, 0, 0);
const awakeDate = new Date();
awakeDate.setHours(9, 0, 0, 0);

assert.strictEqual(isBotSleeping(sleepingBot, asleepDate), true, "bot should be sleeping");
assert.strictEqual(isBotSleeping(awakeBot, awakeDate), false, "bot should be awake");

console.log("botManager tests OK");
