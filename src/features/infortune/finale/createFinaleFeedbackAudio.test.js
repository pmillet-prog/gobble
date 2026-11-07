import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinaleFeedbackAudio } from './createFinaleFeedbackAudio.js';

function harness() {
  const notes = []; let created = 0, closed = 0;
  const param = () => ({ events: [], setValueAtTime(...value) { this.events.push(value); }, linearRampToValueAtTime(...value) { this.events.push(value); }, exponentialRampToValueAtTime(...value) { this.events.push(value); } });
  const context = { state: 'running', currentTime: 10, destination: {},
    createOscillator() { const note = { frequency: param(), connect() {}, disconnect() {}, start(at) { this.at = at; }, stop(at) { this.end = at; } }; notes.push(note); return note; },
    createGain() { const gain = { gain: param(), connect() {}, disconnect() {} }; notes.at(-1).gain = gain; return gain; },
    close() { closed++; return Promise.resolve(); } };
  const audio = createFinaleFeedbackAudio({ createContext: () => { created++; return context; } });
  return { audio, notes, get created() { return created; }, get closed() { return closed; } };
}
const cue = { kind: 'reveal', count: 3, stepMs: 510, flipMs: 480 };

test('reveal tones follow the letter faces and dense batches do not become an audio buzz', () => {
  const h = harness(); h.audio.play(cue); assert.equal(h.created, 0);
  h.audio.unlock(); h.audio.play(cue);
  assert.deepEqual(h.notes.map(note => note.at), [10.24, 10.75, 11.26]);
  assert.ok(h.notes.every(note => note.end <= 11.5));
  h.notes.length = 0; h.audio.play({ ...cue, count: 40, stepMs: 1020 / 39 });
  assert.ok(h.notes.length <= 14);
  h.notes.length = 0; h.audio.play(cue, true); assert.equal(h.notes.length, 1); assert.equal(h.notes[0].at, 10);
  h.audio.dispose(); assert.equal(h.closed, 1);
});

test('absence has a short descending cue; mute, volume, background and disposal stop it', () => {
  const h = harness(); h.audio.unlock(); h.audio.play({ kind: 'absent' });
  assert.deepEqual(h.notes[0].frequency.events.map(([frequency]) => frequency), [220, 130]);
  assert.ok(h.notes[0].end - h.notes[0].at < .25);
  for (const prefs of [{ isSfxMuted: true }, { soundMasterVolume: 0 }, { soundInvalidErrorEnabled: false }]) {
    h.audio.setPreferences(prefs); h.audio.play({ kind: 'absent' }); assert.equal(h.notes.length, 1);
  }
  h.audio.setPreferences({}); h.audio.setHidden(true); h.audio.play(cue); assert.equal(h.notes.length, 1);
  h.audio.setHidden(false); assert.equal(h.notes.length, 1);
  h.audio.play(cue); h.audio.dispose(); assert.ok(h.notes.every(note => note.end === undefined));
  h.audio.unlock(); h.audio.play(cue); assert.equal(h.created, 1);
});
