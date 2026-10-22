import test from "node:test";
import assert from "node:assert/strict";
import { createRound, evaluateGuess, submitGuess, revealLetter, keyboardMarks } from "./model.mjs";
import { createMotusController } from "./controller.mjs";

test("exact matches consume occurrences before yellow matches", () => {
  assert.deepEqual(evaluateGuess("BALLON", "BANANE"), ["correct", "correct", "present", "absent", "absent", "absent"]);
  assert.deepEqual(evaluateGuess("BANANE", "BALLON"), ["correct", "correct", "absent", "absent", "absent", "present"]);
  assert.deepEqual(evaluateGuess("BALLON", "BILLES"), ["correct", "absent", "correct", "correct", "absent", "absent"]);
});
const finish = state => { while (state.phase === "revealing") state = revealLetter(state); return state; };
test("rejects invalid words without using an attempt, accepts conjugations and different initial letters", () => {
  const initial = createRound("JOUETS"), accepted = new Set(["JOUAIS", "JOUETS", "BALLON"]);
  for (const guess of ["J", "JZZZZZ"]) {
    const result = submitGuess(initial, guess, accepted);
    assert.ok(result.error); assert.equal(result.state, initial);
  }
  const result = submitGuess(initial, "jouais", accepted);
  assert.equal(result.error, ""); assert.equal(result.state.attempts.length, 1);
  assert.equal(submitGuess(result.state, "JOUETS", accepted).state, result.state);
  const differentInitial = submitGuess(initial, "BALLON", accepted);
  assert.equal(differentInitial.error, "");
  assert.equal(differentInitial.state.attempts.length, 1);
  assert.equal(differentInitial.state.attempts[0].marks[0], "absent");
  assert.equal(finish(differentInitial.state).known[0], "J");
});
test("known letters carry to next row and victory occurs after final reveal", () => {
  const accepted = new Set(["BALLON", "BALLES"]);
  let state = submitGuess(createRound("BALLON"), "BALLES", accepted).state;
  assert.deepEqual(keyboardMarks(state), {});
  state = finish(state);
  assert.deepEqual(state.known, ["B", "A", "L", "L", "", ""]);
  assert.equal(state.phase, "playing");
  assert.ok(submitGuess(state, "BALLES", accepted).error);
  state = submitGuess(state, "BALLON", accepted).state;
  for (let index = 0; index < 6; index++) state = revealLetter(state);
  assert.equal(state.phase, "revealing");
  assert.equal(revealLetter(state).phase, "won");
});
test("six wrong attempts end the round", () => {
  const guesses = ["BANANE", "BALLES", "BILLES", "BATEAU", "BOUCLE", "BOUTON"];
  let state = createRound("BALLON");
  for (const guess of guesses) state = finish(submitGuess(state, guess, new Set(guesses)).state);
  assert.equal(state.phase, "lost"); assert.equal(state.attempts.length, 6);
});
test("reset and disposal cancel reveals and protect against stale callbacks", () => {
  const jobs = new Map(); let id = 0, changes = 0;
  const controller = createMotusController({ accepted: new Set(["BALLON", "BALLES"]), targets: ["BALLON"], onChange: () => changes++, schedule: fn => { jobs.set(++id, fn); return id; }, cancel: timer => jobs.delete(timer) });
  controller.newRound("BALLON"); controller.edit("BALLES"); controller.submit();
  const stale = [...jobs.values()][0]; assert.equal(jobs.size, 1);
  controller.newRound("BALLON"); stale();
  assert.equal(jobs.size, 0); assert.equal(controller.getState().attempts.length, 0);
  assert.equal(controller.newRound("BALLES"), false);
  controller.edit("BALLON"); controller.submit(); const stale2 = [...jobs.values()][0];
  controller.dispose(); const before = changes; stale2();
  assert.equal(jobs.size, 0); assert.equal(changes, before);
});

test("only an incorrect final guess emits loss, and a final-row win emits victory once", () => {
  const wrong = ["BANANE", "BALLES", "BILLES", "BATEAU", "BOUCLE", "BOUTON"];
  const jobs = new Map(), cues = []; let id = 0;
  const controller = createMotusController({
    accepted: new Set([...wrong, "BALLON"]), targets: ["BALLON"], onChange() {}, onCue: cue => cues.push(cue),
    schedule: fn => { jobs.set(++id, fn); return id; }, cancel: timer => jobs.delete(timer),
  });
  const propose = word => {
    controller.edit(word); controller.submit();
    while (jobs.size) { const [key, job] = [...jobs][0]; jobs.delete(key); job(); }
  };
  controller.newRound("BALLON");
  wrong.slice(0, 5).forEach(propose);
  assert.equal(cues.filter(cue => cue.type === "lost" || cue.type === "won").length, 0);
  propose("BALLON");
  assert.deepEqual(cues.filter(cue => cue.type === "lost" || cue.type === "won"), [{ type: "won", row: 5 }]);
  assert.equal(cues.filter(cue => cue.type === "letter").length, 36);
  controller.newRound("BALLON"); cues.length = 0;
  wrong.forEach(propose);
  assert.deepEqual(cues.filter(cue => cue.type === "lost" || cue.type === "won"), [{ type: "lost", row: 5 }]);
  controller.newRound("BALLON"); cues.length = 0;
  controller.giveUp();
  assert.deepEqual(cues, [{ type: "reset" }]);
  controller.dispose();
});
