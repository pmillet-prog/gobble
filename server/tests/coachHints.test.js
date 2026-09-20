import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachHints, createCoachHintPicker, rankCoachSuffixes } from "../bots/coachHints.js";

const solutions = [
  { word: "braguette", pts: 20, path: [0] },
  { word: "débraguette", pts: 21, path: [1] },
  { word: "rebraguette", pts: 22, path: [4] },
  { word: "boussole", pts: 20, path: [3] },
  { word: "quiz", pts: 100, path: [15] },
  { word: "jazz", pts: 90, path: [14] },
];
const createRoom = () => ({ config: { gridSize: 4 }, currentRound: { solutions } });
const nextRound = (room, entries = solutions) => { room.currentRound = { solutions: entries }; };

test("caps endings at five letters while keeping each exact ending separate", () => {
  const words = [
    "BRAGUETTE", "braguettes", "débraguette", "débraguettes", "débraguettez",
    "débraguetter", "rebraguette", "rebraguettes", "rebraguettez", "rebraguetter",
  ];
  const ranked = rankCoachSuffixes(words.map(word => ({ word })), 4);
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every(({ suffix }) => suffix.length >= 4 && suffix.length <= 5));
  const counts = new Map(ranked.map(({ suffix, count }) => [suffix, count]));
  assert.equal(counts.get("uette"), 3);
  assert.equal(counts.get("ettes"), 3);
  assert.equal(counts.get("ettez"), 2);
  assert.equal(counts.get("etter"), 2);
  assert.ok(!counts.has("braguette"));
  const suffixHint = buildCoachHints(words.map(word => ({ word }))).find(hint => hint.kind === "suffix");
  assert.doesNotMatch(suffixHint.text, /-braguette/);
  assert.ok(!rankCoachSuffixes(words.map(word => ({ word })), 5).some(({ suffix }) => suffix === "ettez"));
});

test("offers spatial clues even when a suffix exists, using distinct length and score criteria", () => {
  const hints = buildCoachHints([
    ...solutions,
    { word: "satellites", pts: 50, path: [16] },
    { word: "aquarium", pts: 50, path: [] },
  ], 4);
  assert.deepEqual(hints.map(hint => hint.kind), ["suffix", "long_start", "score_start"]);
  const long = hints.find(hint => hint.kind === "long_start");
  assert.equal(long.zone, "haut à gauche");
  assert.equal(long.count, 3);
  assert.equal(long.minLength, 8);
  assert.match(long.text, /3 mots de 8 lettres ou plus/);
  const score = hints.find(hint => hint.kind === "score_start");
  assert.equal(score.zone, "bas à droite");
  assert.equal(score.count, 2);
  assert.equal(score.minPoints, 75);
  assert.match(score.text, /2 mots rapportant au moins 75 points/);
});

test("adapts valuable-word hints to small score scales and handles single-word clues", () => {
  const hints = buildCoachHints([
    { word: "boussole", pts: 11, path: [12] },
    { word: "goutte", pts: 8, path: [12] },
  ]);
  const score = hints.find(hint => hint.kind === "score_start");
  assert.equal(score.minPoints, 9);
  assert.equal(score.count, 1);
  assert.match(score.text, /1 mot rapportant au moins 9 points avec un départ en bas à gauche/);
  assert.match(hints.find(hint => hint.kind === "long_start").text, /1 mot de 8 lettres ou plus/);
});

test("draws all three available kinds once per cycle without consecutive repeats", () => {
  for (const sample of [0, 0.4, 0.999]) {
    const picker = createCoachHintPicker({ random: () => sample });
    const room = createRoom();
    const kinds = [];
    for (let round = 0; round < 12; round++) {
      nextRound(room);
      kinds.push(picker.forRound(room).kind);
    }
    for (let start = 0; start < kinds.length; start += 3) {
      assert.equal(new Set(kinds.slice(start, start + 3)).size, 3);
    }
    assert.ok(kinds.every((kind, index) => index === 0 || kind !== kinds[index - 1]));
  }
  assert.equal(createCoachHintPicker({ random: () => 0 }).forRound(createRoom()).kind, "suffix");
  assert.equal(createCoachHintPicker({ random: () => 0.999 }).forRound(createRoom()).kind, "score_start");
});

test("keeps one draw for preparation and broadcast of the same round, with independent rooms", () => {
  let draws = 0;
  const picker = createCoachHintPicker({ random: () => { draws++; return 0; } });
  const room = createRoom();
  const first = picker.forRound(room);
  assert.strictEqual(picker.forRound(room), first);
  assert.equal(draws, 1);
  nextRound(room);
  assert.equal(picker.forRound(room).kind, "long_start");
  assert.equal(picker.forRound(createRoom()).kind, "suffix");
  assert.equal(draws, 3);
});

test("preserves disabled round types without consuming a draw", () => {
  let draws = 0;
  const picker = createCoachHintPicker({ random: () => { draws++; return 0; } });
  const room = createRoom();
  assert.equal(picker.forRound(room).kind, "suffix");
  for (const type of ["ocid", "target_long", "target_score", "self_specials_3_words", "speed"]) {
    nextRound(room);
    room.currentRound.special = { type };
    assert.equal(picker.forRound(room), null);
    nextRound(room);
    assert.equal(picker.forRound(room, { type }), null);
  }
  assert.equal(draws, 1);
  nextRound(room);
  assert.equal(picker.forRound(room).kind, "long_start");
  assert.equal(draws, 2);
});

test("handles missing clue kinds and resumes varied draws when they return", () => {
  const picker = createCoachHintPicker({ random: () => 0 });
  const room = createRoom();
  assert.equal(picker.forRound(room).kind, "suffix");
  nextRound(room, [{ word: "quiz", pts: 25, path: [2] }]);
  assert.equal(picker.forRound(room).kind, "score_start");
  nextRound(room, [{ word: "quiz", pts: 25, path: [2] }]);
  assert.equal(picker.forRound(room).kind, "score_start");
  nextRound(room);
  assert.notEqual(picker.forRound(room).kind, "score_start");
  nextRound(room, solutions.map(({ word }) => ({ word })));
  assert.equal(picker.forRound(room).kind, "suffix");
  nextRound(room);
  assert.notEqual(picker.forRound(room).kind, "suffix");
  nextRound(room, []);
  assert.equal(picker.forRound(room), null);
  assert.equal(picker.forRound({}), null);
});
