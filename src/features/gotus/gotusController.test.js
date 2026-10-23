import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createGotusController } from "./gotusController.js";
import { evaluateGotusGuess } from "../../../shared/gotusRules.js";

const words = ["BALLON", "BANANE", "BALLES", "BILLES", "BATEAU", "BOUCLE", "BOUTON"];
function harness(options = {}) {
  const tasks = new Map(), intervals = new Map(), events = new Map(), sent = [], cues = [];
  let id = 0, time = 1000;
  const socket = {
    connected: true,
    on(name, callback) { events.set(name, callback); }, off(name, callback) { if (events.get(name) === callback) events.delete(name); },
    emit(name, payload, callback) { sent.push({ name, payload, callback }); },
  };
  const controller = createGotusController({ socket, roundId: "round-1", getNow: () => time,
    schedule: (fn, delay) => { tasks.set(++id, { fn, delay }); return id; }, cancel: token => tasks.delete(token),
    repeat: fn => { intervals.set(++id, fn); return id; }, cancelRepeat: token => intervals.delete(token),
    loadTrainingWords: async () => ({ targets: ["BALLON"], accepted: words }), ...options,
  });
  controller.subscribeCue(cue => cues.push(cue));
  const reveal = () => {
    for (let step = 0; step < 7; step++) {
      const job = [...tasks].find(([, task]) => task.delay === 260);
      assert.ok(job, `missing reveal step ${step}`);
      tasks.delete(job[0]); job[1].fn();
    }
  };
  return { controller, socket, tasks, intervals, events, sent, cues, reveal,
    advanceClock(now) { time = now; [...intervals.values()].forEach(fn => fn()); } };
}
function snapshot(attemptWords = [], phase = "playing", overrides = {}) {
  const attempts = attemptWords.map(word => ({ word, marks: evaluateGotusGuess("BALLON", word) }));
  return { ok: true, roundId: "round-1", phase, endsAt: 20000, firstLetter: "B", known: ["B", "", "", "", "", ""], attempts,
    remainingAttempts: 6 - attempts.length, wordsFound: phase === "won" ? 1 : 0,
    summary: { won: phase === "won", wordsFound: phase === "won" ? 1 : 0, attemptsUsed: attempts.length, phase }, ...overrides };
}

test("live reveal consumes one server batch and deduplicates its progress push and ACK", () => {
  const h = harness();
  h.controller.activate({ deadline: 20000 });
  assert.equal(h.sent[0].name, "gotus:start");
  h.sent[0].callback(snapshot());
  h.controller.edit("BALLON"); h.controller.submit();
  const submitted = h.sent.at(-1);
  assert.equal(submitted.name, "gotus:guess"); assert.ok(submitted.payload.requestId);
  const progression = { before: { totalWins: 9 }, after: { totalWins: 10 }, reward: { amount: 500 } };
  const result = snapshot(["BALLON"], "won", { solution: "BALLON", progression });
  h.events.get("gotus:progress")(result);
  assert.equal(h.controller.getSnapshot().phase, "revealing");
  assert.equal(h.controller.getSnapshot().progression, null, "reward waits for the completed reveal");
  submitted.callback(result);
  h.reveal();
  assert.equal(h.controller.getSnapshot().phase, "won");
  assert.deepEqual(h.controller.getSnapshot().progression, progression);
  assert.equal(h.cues.filter(cue => cue.type === "letter").length, 6);
  assert.equal(h.cues.filter(cue => cue.type === "won").length, 1);
  assert.equal(h.sent.length, 2, "no per-letter network traffic");
  h.controller.deactivate();
  assert.equal(h.tasks.size, 0); assert.equal(h.intervals.size, 0); assert.equal(h.events.size, 0);
});

test("late ACK from the previous guess cannot rewind a newer submitted guess", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.edit("BALLES"); h.controller.submit(); const old = h.sent.at(-1);
  h.events.get("gotus:progress")(snapshot(["BALLES"])); h.reveal();
  h.controller.edit("BALLON"); h.controller.submit(); const latest = h.sent.at(-1);
  old.callback(snapshot(["BALLES"]));
  assert.equal(h.controller.getSnapshot().phase, "submitting");
  latest.callback(snapshot(["BALLES", "BALLON"], "won", { solution: "BALLON" })); h.reveal();
  assert.equal(h.controller.getSnapshot().attempts.length, 2);
  assert.equal(h.controller.getSnapshot().phase, "won"); h.controller.deactivate();
});

test("reconnect restores authoritative attempts without replaying sounds or rewarding twice", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.edit("BALLON"); h.controller.submit(); const stale = h.sent.at(-1);
  h.events.get("disconnect")();
  stale.callback(snapshot(["BALLON"], "won"));
  assert.equal(h.controller.getSnapshot().attempts.length, 0);
  h.events.get("connect")(); h.sent.at(-1).callback(snapshot(["BALLON"], "won", { solution: "BALLON" }));
  assert.equal(h.controller.getSnapshot().phase, "won");
  assert.equal(h.cues.filter(cue => cue.type !== "reset").length, 0);
  h.controller.deactivate();
});

test("invalid server word keeps the same attempt and deadline prevents late submissions", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.edit("ZZZZZZ"); h.controller.submit(); h.sent.at(-1).callback({ ...snapshot(), ok: false, error: "unknown_word" });
  assert.equal(h.controller.getSnapshot().attempts.length, 0);
  assert.equal(h.controller.getSnapshot().canAnswer, true);
  assert.match(h.controller.getSnapshot().error, /dictionnaire/);
  h.advanceClock(20000);
  assert.equal(h.controller.getSnapshot().phase, "expired");
  const count = h.sent.length; h.controller.submit(); assert.equal(h.sent.length, count);
  assert.equal(h.tasks.size, 0); assert.equal(h.intervals.size, 0); h.controller.deactivate();
});

test("training shares reveals and victory but owns no socket, clock or persisted progress", async () => {
  const h = harness({ mode: "training" }); h.controller.activate(); await setImmediate();
  assert.equal(h.controller.getSnapshot().firstLetter, "B");
  assert.equal(h.sent.length, 0); assert.equal(h.events.size, 0); assert.equal(h.intervals.size, 0);
  h.controller.edit("BALLES"); h.controller.submit(); h.reveal();
  h.controller.edit("BALLES"); assert.equal(h.controller.submit(), false);
  h.controller.edit("BALLON"); h.controller.submit(); h.reveal();
  assert.equal(h.controller.getSnapshot().phase, "won");
  assert.equal(h.controller.getSnapshot().wordsFound, 1);
  assert.equal(h.controller.getSnapshot().progression, null);
  assert.equal(h.cues.filter(cue => cue.type === "won").length, 1);
  h.controller.newRound(); await setImmediate();
  assert.equal(h.controller.getSnapshot().phase, "playing");
  assert.equal(h.controller.getSnapshot().attempts.length, 0);
  h.controller.giveUp(); assert.equal(h.controller.getSnapshot().solution, "BALLON");
  assert.equal(h.cues.filter(cue => cue.type === "lost").length, 0);
  assert.equal(h.sent.length, 0); h.controller.deactivate(); assert.equal(h.tasks.size, 0);
});

test("only a wrong sixth attempt plays loss; correct sixth attempt wins", async () => {
  for (const won of [false, true]) {
    const h = harness({ mode: "training" }); h.controller.activate(); await setImmediate();
    for (const word of [...words.slice(1, 6), won ? "BALLON" : "BOUTON"]) {
      h.controller.edit(word); h.controller.submit(); h.reveal();
    }
    assert.equal(h.controller.getSnapshot().phase, won ? "won" : "lost");
    assert.deepEqual(h.cues.filter(cue => ["won", "lost"].includes(cue.type)).map(cue => cue.type), [won ? "won" : "lost"]);
    h.controller.deactivate();
  }
});

test("closing, timing out or rejecting dismissal always settles its promise", async () => {
  for (const action of ["close", "timeout", "reject"]) {
    const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
    const dismissed = h.controller.dismiss();
    if (action === "close") h.controller.deactivate();
    else if (action === "reject") h.sent.at(-1).callback({ ok: false });
    else { const [id, timer] = [...h.tasks][0]; h.tasks.delete(id); timer.fn(); }
    assert.equal(await dismissed, false);
    h.controller.deactivate();
  }
});

test("live direct cell input validates holes and sends the exact six letters", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  assert.equal(h.controller.getSnapshot().activeColumn, 1);
  h.controller.selectCell(4); h.controller.typeLetters("ôn");
  assert.equal(h.controller.getSnapshot().draft, "B   ON");
  assert.equal(h.controller.submit(), false);
  assert.equal(h.sent.length, 1, "an incomplete row cannot reach the server");
  h.controller.selectCell(1); h.controller.typeLetters("âll");
  assert.equal(h.controller.submit(), true);
  assert.equal(h.sent.at(-1).name, "gotus:guess");
  assert.equal(h.sent.at(-1).payload.word, "BALLON");
  assert.equal(h.sent.at(-1).payload.puzzleIndex, 0);
  h.controller.deactivate();
});

test("all editing commands stay blocked while submitting and revealing", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.typeLetters("ALLES"); h.controller.submit();
  const submitted = h.sent.at(-1);
  for (const stage of ["submitting", "revealing"]) {
    if (stage === "revealing") submitted.callback(snapshot(["BALLES"]));
    const before = h.controller.getSnapshot();
    h.controller.selectCell(0); h.controller.typeLetters("Z"); h.controller.backspace();
    h.controller.deleteLetter(); h.controller.moveCursor("Home"); h.controller.edit("ZZZZZZ");
    assert.equal(h.controller.getSnapshot(), before, stage);
  }
  h.reveal();
  assert.equal(h.controller.getSnapshot().draft, "B");
  assert.equal(h.controller.getSnapshot().activeColumn, 1);
  h.controller.deactivate();
});

test("duplicate progress and a late ACK preserve an edited next row and cursor", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.typeLetters("ALLES"); h.controller.submit(); const submitted = h.sent.at(-1);
  const response = snapshot(["BALLES"], "playing", { known: ["B", "A", "L", "L", "", ""] });
  h.events.get("gotus:progress")(response);
  h.reveal();
  assert.equal(h.controller.getSnapshot().draft, "BALL", "known letters are part of the editable word");
  assert.equal(h.controller.getSnapshot().activeColumn, 4);
  h.controller.selectCell(5); h.controller.typeLetters("N"); h.controller.selectCell(2);
  for (const receive of [h.events.get("gotus:progress"), submitted.callback]) {
    receive(response);
    assert.equal(h.controller.getSnapshot().draft, "BALL N");
    assert.equal(h.controller.getSnapshot().activeColumn, 2);
  }
  h.controller.deactivate();
});

test("training completes only LLON after BANANE has supplied known BA", async () => {
  const h = harness({ mode: "training" }); h.controller.activate(); await setImmediate();
  h.controller.edit("BANANE"); assert.equal(h.controller.submit(), true); h.reveal();
  assert.deepEqual(h.controller.getSnapshot().known, ["B", "A", "", "", "", ""]);
  assert.equal(h.controller.getSnapshot().draft, "BA");
  assert.equal(h.controller.getSnapshot().activeColumn, 2);
  h.controller.typeLetters("LLON");
  assert.equal(h.controller.getSnapshot().draft, "BALLON");
  assert.equal(h.controller.submit(), true); h.reveal();
  assert.equal(h.controller.getSnapshot().phase, "won");
  assert.equal(h.sent.length, 0); h.controller.deactivate();
});

test("live submission contains known letters plus only the newly typed completion", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.edit("BANANE"); h.controller.submit();
  h.sent.at(-1).callback(snapshot(["BANANE"], "playing", { known: ["B", "A", "", "", "", ""] }));
  h.reveal();
  h.controller.typeLetters("LLON");
  assert.equal(h.controller.getSnapshot().draft, "BALLON");
  assert.equal(h.controller.submit(), true);
  assert.equal(h.sent.at(-1).name, "gotus:guess");
  assert.equal(h.sent.at(-1).payload.word, "BALLON");
  h.controller.deactivate();
});

test("reconnect restores known letters as editable draft content without replaying the reveal", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.edit("BALLES"); h.controller.submit();
  h.events.get("disconnect")(); h.events.get("connect")();
  h.sent.at(-1).callback(snapshot(["BALLES"], "playing", { known: ["B", "A", "L", "L", "", ""] }));
  assert.equal(h.controller.getSnapshot().phase, "playing");
  assert.equal(h.controller.getSnapshot().draft, "BALL");
  assert.equal(h.controller.getSnapshot().activeColumn, 4);
  assert.equal(h.cues.filter(cue => cue.type === "letter").length, 0);
  h.controller.typeLetters("ON"); assert.equal(h.controller.submit(), true);
  assert.equal(h.sent.at(-1).payload.word, "BALLON");
  h.controller.deactivate();
});

test("deleting a known cell remains a real hole across identical progress pushes", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 });
  const response = snapshot(["BANANE"], "playing", { known: ["B", "A", "", "", "", ""] });
  h.sent[0].callback(response);
  h.controller.typeLetters("LLON"); h.controller.selectCell(1); h.controller.typeLetters("O");
  assert.equal(h.controller.getSnapshot().draft, "BOLLON");
  h.controller.selectCell(1); h.controller.deleteLetter();
  assert.equal(h.controller.getSnapshot().draft, "B LLON");
  h.events.get("gotus:progress")(response);
  assert.equal(h.controller.getSnapshot().draft, "B LLON", "a repeated snapshot must not refill the deleted A");
  assert.equal(h.controller.getSnapshot().activeColumn, 1);
  assert.equal(h.controller.submit(), false);
  assert.equal(h.sent.length, 1, "the cleared cell must be filled before sending");
  h.controller.typeLetters("A");
  assert.equal(h.controller.getSnapshot().draft, "BALLON");
  assert.equal(h.controller.submit(), true);
  assert.equal(h.sent.at(-1).payload.word, "BALLON");
  h.controller.deactivate();
});

test("an old progress push cannot unlock editing during a newer submitted guess", () => {
  const h = harness(); h.controller.activate({ deadline: 20000 }); h.sent[0].callback(snapshot());
  h.controller.edit("BALLES"); h.controller.submit(); h.sent.at(-1).callback(snapshot(["BALLES"])); h.reveal();
  h.controller.edit("BALLON"); h.controller.submit();
  h.events.get("gotus:progress")(snapshot(["BALLES"]));
  assert.equal(h.controller.getSnapshot().phase, "submitting");
  assert.equal(h.controller.getSnapshot().canAnswer, false);
  assert.equal(h.controller.getSnapshot().draft, "BALLON");
  h.controller.deactivate();
});
