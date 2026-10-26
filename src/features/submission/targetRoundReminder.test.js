import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createGameplaySessionFeature } from "../gameplay/createGameplaySessionFeature.js";
import { createWordSubmissionEngine } from "../../game/createWordSubmissionEngine.js";
import {
  createTargetRoundReminderFeature,
  TARGET_ROUND_REMINDER_DURATION_MS,
  TARGET_ROUND_REMINDER_LINES,
} from "./createTargetRoundReminderFeature.js";

function harness(t) {
  const kernel = createApplicationKernel();
  const timers = new Map();
  let timerId = 0;
  kernel.commands.navigation.go("live");
  kernel.features.define("gameplaySession", createGameplaySessionFeature);
  kernel.features.define("targetRoundReminder", context => createTargetRoundReminderFeature(context, {
    random: () => 0.5,
    setTimeoutFn: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeoutFn: id => timers.delete(id),
  }));
  const reminder = kernel.features.acquire("targetRoundReminder").feature;
  const gameplay = kernel.features.prepare("gameplaySession");
  const start = (roundId = "round-1", extra = {}) => gameplay.startRound({
    roomId: "room", roundId, startsAt: 50_000, endsAt: 140_000, status: "intro", ...extra,
  });
  const submit = (roundType = "target_long", nowMs = 51_000) =>
    reminder.registerSubmission({ roundType, nowMs });
  const burst = (roundType, nowMs) => Array.from({ length: 5 }, () => submit(roundType, nowMs));
  t.after(() => kernel.dispose());
  start();
  return { kernel, reminder, gameplay, start, submit, burst, timers };
}

test("fifth local validation triggers once, with the correct objective in all three rounds", t => {
  const h = harness(t);
  let updates = 0;
  h.reminder.store.subscribe(() => updates++);
  for (const [type, action, detail] of [
    ["target_long", "trouver", "plus long"],
    ["target_score", "trouver", "plus de points"],
    ["ocid", "proposer", "OCID"],
  ]) {
    h.start(type);
    const before = updates;
    for (let i = 0; i < 4; i++) assert.equal(h.submit(type), false);
    assert.equal(updates, before, "counting does not rerender the UI");
    assert.equal(h.submit(type), true);
    const popup = h.reminder.store.getState().reminder;
    assert.equal(popup.action, action);
    assert.ok(popup.detail.includes(detail));
    assert.ok(TARGET_ROUND_REMINDER_LINES.includes(popup.line));
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].delay, TARGET_ROUND_REMINDER_DURATION_MS);
    h.reminder.dismiss();
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.burst(type), [false, false, false, false, false]);
    assert.equal(h.reminder.store.getState().reminder, null);
  }
  assert.equal(new Set(TARGET_ROUND_REMINDER_LINES).size, 10);
});

test("the first ten seconds start at server startsAt, including the exact boundary", t => {
  const h = harness(t);
  h.burst("target_long", 49_999); // Actual intro, before the board is playable.
  h.submit("target_long", 50_000);
  h.submit("target_long", 55_000);
  h.submit("target_long", 58_000);
  h.submit("target_long", 59_999);
  assert.equal(h.reminder.store.getState().reminder, null);
  assert.equal(h.submit("target_long", 60_000), true);
  h.start("too-late");
  for (let i = 0; i < 4; i++) h.submit("target_long", 59_999);
  assert.equal(h.submit("target_long", 60_001), false);
  assert.equal(h.reminder.store.getState().reminder, null);
  h.start("joined-late");
  h.burst("ocid", 65_000);
  assert.equal(h.reminder.store.getState().reminder, null);
});

test("ordinary rounds, unknown clocks, results and OCID voting cannot trigger a reminder", t => {
  const h = harness(t);
  for (const type of [undefined, "normal", "speed", "self_specials_3_words", "gotus"]) {
    for (let i = 0; i < 5; i++) h.reminder.registerSubmission({ roundType: type, nowMs: 51_000 });
  }
  h.burst("ocid", NaN);
  assert.equal(h.reminder.store.getState().reminder, null);
  h.start("no-clock", { startsAt: null });
  h.burst();
  h.start("voting");
  h.gameplay.transitionPhase("playing", { status: "ocid_vote" });
  h.burst("ocid");
  h.gameplay.transitionPhase("results");
  h.burst();
  assert.equal(h.reminder.store.getState().reminder, null);
  assert.equal(h.timers.size, 0);
});

test("snapshot recovery preserves the counter and the once-per-round latch", t => {
  const h = harness(t);
  for (let i = 0; i < 4; i++) h.submit();
  const snapshot = {
    roomId: "room", phase: "playing",
    currentRound: { roundId: "round-1", startsAt: 50_000, endsAt: 140_000, status: "running" },
  };
  h.gameplay.hydrateSnapshot(snapshot);
  assert.equal(h.submit(), true);
  h.reminder.dismiss();
  h.gameplay.hydrateSnapshot(snapshot);
  assert.equal(h.submit(), false);
  h.start("round-2");
  assert.deepEqual(h.burst(), [false, false, false, false, true]);
});

test("auto-close, round end, leaving and disposal clear popup timers", t => {
  const h = harness(t);
  h.burst();
  [...h.timers.values()][0].callback();
  assert.equal(h.reminder.store.getState().reminder, null);
  assert.equal(h.timers.size, 0);
  h.start("round-2");
  h.burst();
  h.gameplay.transitionPhase("results");
  assert.equal(h.timers.size, 0);
  assert.equal(h.reminder.store.getState().reminder, null);
  h.start("round-3");
  h.burst();
  h.kernel.commands.navigation.go("home");
  assert.equal(h.timers.size, 0);
  assert.equal(h.reminder.store.getState().reminder, null);
  h.kernel.commands.navigation.go("live");
  h.start("round-4");
  h.burst();
  h.kernel.dispose();
  assert.equal(h.timers.size, 0);
});

function submissionEngine(type, onTargetRoundWordSubmitted, inputMode = "keyboard") {
  const ref = current => ({ current });
  const noop = () => {};
  const errors = [];
  const currentTilesRef = ref(["C", "H", "A", "T"]);
  const highlightPathRef = ref([0, 1, 2, 3]);
  const inputLockedRef = ref(false);
  const engine = createWordSubmissionEngine({
    inputLockedRef, isDailyPlayRef: ref(false), appViewRef: ref("live"),
    standaloneTrainingSessionRef: ref(null), currentTilesRef, highlightPathRef,
    keyboardRecallSubmittedWordRef: ref(false), isMobileLayoutRef: ref(false),
    lastInputModeRef: ref(inputMode), isTouchDeviceRef: ref(inputMode === "touch"),
    board: ["C", "H", "A", "T", ...Array(12).fill("X")].map(letter => ({ letter })),
    specialRound: { type }, specialScoreConfig: { type },
    // Target rounds deliberately receive only the solution, not the full dictionary.
    serverSolutionsReadyRef: ref(true), solutionsRef: ref(new Map()),
    dictionary: new Set(["chat", "cha", "hat", "ch", "at"]),
    error: message => errors.push(message), setHighlightPath: noop, clearSelection: noop,
    onTargetRoundWordSubmitted, roundId: "round-1", socket: { connected: false },
    ocidLatestProposalRef: ref(null), setOcidProposal: noop, setOcidProposalPath: noop,
    setOcidProposalSubmitted: noop, setOcidStatusMessage: noop,
  });
  return {
    engine, errors, inputLockedRef,
    enter(word, path) { currentTilesRef.current = [...word]; highlightPathRef.current = path; engine.submit(); },
  };
}

test("keyboard, mouse and touch target proposals count before the target-only rejection", t => {
  const h = harness(t);
  for (const mode of ["keyboard", "mouse", "touch"]) {
    h.start(mode);
    const { enter, errors } = submissionEngine("target_long", ({ roundType }) => h.submit(roundType), mode);
    for (const [word, path] of [
      ["CHAT", [0, 1, 2, 3]], ["CHA", [0, 1, 2]], ["HAT", [1, 2, 3]],
      ["CH", [0, 1]], ["AT", [2, 3]],
    ]) enter(word, path);
    assert.equal(errors.length, 5);
    assert.ok(errors.every(message => message === "Pas le mot cible"));
    assert.equal(h.reminder.store.getState().reminder.action, "trouver");
  }
});

test("OCID counts locally traceable proposals even when they are invented words or offline", t => {
  const h = harness(t);
  const { enter, errors } = submissionEngine("ocid", ({ roundType }) => h.submit(roundType));
  for (let i = 0; i < 5; i++) enter("CXX", [0, 4, 5]);
  assert.deepEqual(errors, []);
  assert.equal(h.reminder.store.getState().reminder.action, "proposer");
});

test("empty, short, untraceable and locked submissions do not count", () => {
  let count = 0;
  const h = submissionEngine("target_score", () => count++);
  h.enter("", []);
  h.enter("C", [0]);
  h.enter("CHAT", [0, 15, 2, 3]); // Keyboard resolves a valid path, so use touch below.
  assert.equal(count, 1);
  h.inputLockedRef.current = true;
  h.enter("CHAT", [0, 1, 2, 3]);
  const touch = submissionEngine("target_score", () => count++, "touch");
  touch.enter("CHAT", [0, 15, 2, 3]);
  touch.enter("ZZ", []);
  assert.equal(count, 1);
});
