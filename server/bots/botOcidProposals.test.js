import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { OCID_TYPE, normalizeWord, solveGrid } from "../../shared/gameLogic.js";
import { createBotManager, BOT_ANIMATOR_ROSTER } from "./botManager.js";
import { selectVisibleOcidVoteOptions } from "../../src/components/ocid/ocidVoteLayout.js";

function setup(t, humanCount = 9) {
  const dictionary = new Set(["chat", "chats", "rue", "sein", "pain", "en", "oui", "air", "rein", "nue", "nu", "un", "une"]);
  const grid = [..."CHATRENSOUIEZAPS"].map(letter => ({ letter, bonus: null }));
  const solved = solveGrid(grid, dictionary);
  assert.ok(solved.size > BOT_ANIMATOR_ROSTER.length + 1);
  const room = {
    id: "ocid-small-room", config: { gridSize: 4 },
    players: new Map(Array.from({ length: humanCount }, (_, index) => [
      `human-${index}`, { nick: `Human ${index}`, connected: true, token: `human-${index}` },
    ])),
    submissions: new Map(), medals: new Map(), medalExpiry: new Map(), currentRound: null,
  };
  const manager = createBotManager({
    rooms: new Map([[room.id, room]]), dictionary,
    botsEnabled: false, animatorBotsEnabled: true,
    ensurePlayerInRound() { assert.fail("fallback must not enroll a player"); },
    emitPlayers() {}, emitMedals() {}, broadcastProvisionalRanking() {},
  });
  room.currentRound = {
    id: "ocid-round", special: { type: OCID_TYPE }, status: "ocid_vote",
    targetWord: "CHAT", grid, startsAt: 1000, endsAt: 31000,
    solutions: Array.from(solved, ([word, entry]) => ({ word, ...entry })),
    ocidProposals: new Map(), ocidVotes: new Map(), ocidOptions: [],
  };
  t.after(() => {
    clearInterval(manager.presenceInterval);
    manager.clearTimers(room.id);
    for (const timer of manager.presenceTimers.values()) clearTimeout(timer);
  });
  return { room, manager, dictionary, solved };
}

test("below ten live humans, each absent host contributes one legal distinct distractor without joining", t => {
  for (const humanCount of [0, 1, 3, 5, 6, 9, 10, 11]) {
    const { room, manager, solved } = setup(t, humanCount);
    const beforePlayers = structuredClone(room.players);
    const beforeSubmissions = structuredClone(room.submissions);
    const presentHosts = BOT_ANIMATOR_ROSTER.filter(bot => room.players.has(`bot-${bot.nick}`));
    const proposals = manager.getOcidAnimatorFallbackProposals(room);
    assert.equal(proposals.length, humanCount < 10 ? BOT_ANIMATOR_ROSTER.length - presentHosts.length : 0);
    assert.equal(new Set(proposals.map(([, proposal]) => proposal.normalized)).size, proposals.length);
    for (const [nick, proposal] of proposals) {
      assert.ok(BOT_ANIMATOR_ROSTER.some(bot => bot.nick === nick));
      assert.ok(!room.players.has(`bot-${nick}`));
      assert.ok(solved.has(proposal.normalized));
      assert.notEqual(proposal.normalized, normalizeWord(room.currentRound.targetWord));
      assert.equal(proposal.animatorFallback, true);
    }
    assert.deepEqual(manager.getOcidAnimatorFallbackProposals(room), proposals, "selection is stable");
    assert.deepEqual(room.players, beforePlayers);
    assert.deepEqual(room.submissions, beforeSubmissions);
    assert.equal(room.currentRound.ocidProposals.size, 0, "fallback must not be a scored submission");
  }
});

test("offline humans and solo training do not disable small-room proposals", t => {
  const { room, manager } = setup(t);
  room.players.set("offline", { nick: "Offline", connected: false });
  room.players.set("training", { nick: "Solo", connected: true, standaloneTraining: { sessionId: "solo" } });
  room.players.set("training-presence", { nick: "Training", connected: true, trainingPresenceOnly: true });
  assert.equal(manager.getOcidAnimatorFallbackProposals(room).length, 6);
  room.players.set("tenth", { nick: "Tenth", connected: true });
  assert.deepEqual(manager.getOcidAnimatorFallbackProposals(room), []);
});

test("existing proposals, other round types and the animator disable switch stay respected", t => {
  const { room, manager } = setup(t);
  const existing = new Map([
    [BOT_ANIMATOR_ROSTER[0].nick, { normalized: "rue", display: "RUE" }],
    ["Human 0", { normalized: "pain", display: "PAIN" }],
  ]);
  room.currentRound.ocidProposals = existing;
  const before = structuredClone(existing);
  const proposals = manager.getOcidAnimatorFallbackProposals(room);
  assert.equal(proposals.length, 5);
  assert.ok(proposals.every(([nick, proposal]) => !existing.has(nick) && !["rue", "pain"].includes(proposal.normalized)));
  assert.deepEqual(existing, before);
  room.currentRound.special.type = "target_long";
  assert.deepEqual(manager.getOcidAnimatorFallbackProposals(room), []);
  room.currentRound.special.type = OCID_TYPE;
  manager.setAnimatorBotsEnabled(false);
  assert.deepEqual(manager.getOcidAnimatorFallbackProposals(room), []);
});

test("a sparse board never turns the correct answer into a host distractor", t => {
  const { room, manager } = setup(t);
  room.currentRound.solutions = [{ word: "chat" }, { word: "rue" }];
  const proposals = manager.getOcidAnimatorFallbackProposals(room);
  assert.equal(proposals.length, 6);
  assert.ok(proposals.every(([, proposal]) => proposal.normalized === "rue"));
  room.currentRound.solutions = [{ word: "chat" }];
  assert.deepEqual(manager.getOcidAnimatorFallbackProposals(room), []);
});

// Load only these pure server calculations: importing index.js would start the backend.
const serverSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");
function serverFunction(name, nextName) {
  const start = serverSource.indexOf(`function ${name}(`);
  const end = serverSource.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  return serverSource.slice(start, end);
}

function calculations(manager, dictionary) {
  const context = vm.createContext({
    Map, Set, OCID_TYPE, normalizeWord, botManager: manager, dictionary,
    OCID_EXACT_TARGET_POINTS: 1000, OCID_CORRECT_VOTE_POINTS: 600,
    OCID_VALID_PROPOSAL_POINTS: 100, OCID_BLUFF_VOTE_POINTS: 500,
    OCID_PROPOSAL_DURATION_MS: 30000,
    isBotToken: token => String(token || "").startsWith("bot-"),
    isBotNick: (room, nick) => Array.from(room.players.values()).some(player => player.nick === nick && player.token?.startsWith("bot-")),
    isPlayerConnected: player => player.connected !== false,
    getTeamForInstallCached() { return null; },
    isDailyChampionPlayer() { return false; },
    getWeeklyVocabPodiumRankForPlayer() { return null; },
    isWeeklyVocabChampionPlayer() { return false; },
    compareOcidRoundResultEntries: (a, b) => b.score - a.score,
  });
  vm.runInContext([
    serverFunction("shuffleOcidOptions", "buildPublicOcidVotePayload"),
    serverFunction("buildPublicOcidVotePayload", "clearOcidProposalForNick"),
    serverFunction("computeOcidRoundResults", "compareOcidRoundResultEntries"),
  ].join("\n"), context);
  return context;
}

test("fallback reaches mobile votes and reveals host names without introducing host scores", t => {
  const { room, manager, dictionary } = setup(t);
  const round = room.currentRound;
  const code = calculations(manager, dictionary);
  const payload = code.buildPublicOcidVotePayload(room);
  assert.equal(payload.optionCount, 7);
  assert.equal(payload.options.filter(option => option.botOnly && option.animatorFallback).length, 6);
  const chosen = round.ocidOptions.find(option => option.animatorFallback);
  round.ocidVotes.set("Human 0", chosen.id);
  round.ocidVotes.set("Human 1", round.ocidOptions.find(option => option.isTarget).id);
  const outcome = code.computeOcidRoundResults(room, []);
  assert.deepEqual(Array.from(outcome.results, entry => entry.nick).sort(), ["Human 0", "Human 1"]);
  assert.equal(outcome.results.find(entry => entry.nick === "Human 0").score, 0);
  assert.equal(outcome.results.find(entry => entry.nick === "Human 1").score, 600);
  const summary = outcome.summary.options.find(option => option.display === chosen.display);
  assert.equal(summary.authors.length, 1);
  assert.ok(BOT_ANIMATOR_ROSTER.some(bot => bot.nick === summary.authors[0]));
  assert.equal(summary.voteCount, 1);
  assert.equal(round.ocidProposals.size, 0);
  assert.equal(code.buildOcidVoteOptions(room), round.ocidOptions, "choices remain cached during the vote");

  const humanOptions = Array.from({ length: 9 }, (_, index) => ({ id: `human-${index}` }));
  const crowded = [...payload.options, ...humanOptions];
  const visible = selectVisibleOcidVoteOptions(crowded, { compact: true });
  assert.equal(visible.options.length, 16, "nine humans, six hosts and target remain visible on mobile");
  assert.equal(visible.hiddenBotCount, 0);
  const withRegularBots = [...crowded, { id: "regular-bot", botOnly: true }];
  const filtered = selectVisibleOcidVoteOptions(withRegularBots, { compact: true });
  assert.equal(filtered.options.length, 16);
  assert.equal(filtered.hiddenBotCount, 1, "regular bot filtering is preserved");
});

test("real human bluff submissions retain their points and merge cleanly with vote options", t => {
  const { room, manager, dictionary } = setup(t);
  const round = room.currentRound;
  round.ocidProposals.set("Human 0", { normalized: "rue", display: "RUE", submittedAt: 2000 });
  const code = calculations(manager, dictionary);
  const options = code.buildOcidVoteOptions(room);
  const humanChoice = options.find(option => option.word === "rue");
  assert.equal(humanChoice.botOnly, false);
  assert.equal(!!humanChoice.animatorFallback, false);
  round.ocidVotes.set("Human 1", humanChoice.id);
  const outcome = code.computeOcidRoundResults(room, []);
  assert.equal(outcome.results.find(entry => entry.nick === "Human 0").score, 600);
  assert.equal(outcome.results.find(entry => entry.nick === "Human 0").ocid.bluffVotes, 1);
  assert.ok(outcome.results.every(entry => !entry.isBot));
});
