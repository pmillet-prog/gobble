import test from 'node:test';
import assert from 'node:assert/strict';
import { fadeOutMediaAudio } from './fadeOutMediaAudio.js';

function harness({ paused = false } = {}) {
  let clock = 0, sequence = 0;
  const jobs = new Map(), documentTarget = new EventTarget();
  documentTarget.hidden = false;
  const audio = Object.assign(new EventTarget(), { paused, ended: false, muted: false, volume: .95,
    removed: false, loads: 0, pause() { this.paused = true; this.dispatchEvent(new Event('pause')); },
    removeAttribute(name) { assert.equal(name, 'src'); this.removed = true; }, load() { this.loads++; } });
  const completion = fadeOutMediaAudio(audio, { documentTarget, now: () => clock,
    setTimer(callback, delay) { const id = ++sequence; jobs.set(id, { callback, at: clock + delay }); return id; },
    clearTimer(id) { jobs.delete(id); } });
  return { audio, documentTarget, jobs, completion, advance(ms) {
    const end = clock + ms;
    while (jobs.size) {
      const [id, job] = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (job.at > end) break;
      clock = job.at; jobs.delete(id); job.callback();
    }
    clock = end;
  } };
}

test('the finale applause decreases progressively then releases its media source', async () => {
  const h = harness(); assert.equal(h.audio.paused, false);
  h.advance(450); assert.ok(Math.abs(h.audio.volume - .475) < .001);
  assert.equal(h.audio.removed, false);
  h.advance(450); await h.completion;
  assert.equal(h.audio.volume, 0); assert.equal(h.audio.paused, true);
  assert.equal(h.audio.removed, true); assert.equal(h.audio.loads, 1); assert.equal(h.jobs.size, 0);
});

test('hidden, ended or paused applause releases immediately without a later restart', async () => {
  for (const reason of ['hidden', 'ended', 'pause']) {
    const h = harness(); h.advance(200);
    if (reason === 'hidden') { h.documentTarget.hidden = true; h.documentTarget.dispatchEvent(new Event('visibilitychange')); }
    else if (reason === 'pause') h.audio.pause();
    else { h.audio.ended = true; h.audio.dispatchEvent(new Event('ended')); }
    await h.completion; assert.equal(h.jobs.size, 0); assert.equal(h.audio.loads, 1);
    h.documentTarget.hidden = false; h.advance(3000);
    assert.equal(h.audio.paused, true); assert.equal(h.audio.loads, 1);
  }
  const h = harness({ paused: true }); await h.completion; assert.equal(h.jobs.size, 0);
});
