import { summarizeWheelFrames } from "../../../../dev/infortune-perspective/wheelPerformance.js";

export function createWheelDiagnosticRun({ profile, attempt = 1, now = () => performance.now() }) {
  const start = now(), samples = {}, timings = {};
  let readyAt = null, loadingHiddenMs = 0, introAt = null, previous = null, previousPhase = null, hiddenAt = null, hiddenMs = 0, hiddenCount = 0, ended = null;
  let size = {}, gestureMode = "power", audioStatus = "loading", programs = null, parallelShaders = null;
  const longTasks = { supported: false, count: 0, totalMs: 0, maxMs: 0 };
  const phaseOf = context => context.sequence?.playing && context.sequence.sequence === "intro" ? "intro"
    : context.phase === "spinning" ? "spin" : ["dragging", "aiming"].includes(context.phase) ? "gesture"
      : context.sequence?.playing && context.sequence.sequence === "results" ? "results" : null;
  return {
    ready() {
      if (readyAt === null && ended === null) {
        readyAt = now(); loadingHiddenMs = hiddenMs + (hiddenAt === null ? 0 : readyAt - hiddenAt);
      }
    },
    intro() {
      if (introAt === null && ended === null) {
        introAt = now();
        // Include the wait for the very first visible intro frame, often where
        // a cold driver stalls even though later frames are smooth.
        if (hiddenAt === null) { previous = introAt; previousPhase = "intro"; }
      }
    },
    timing(value) { Object.assign(timings, value); programs = value.programs ?? programs; parallelShaders = value.parallelShaders ?? parallelShaders; },
    context(value) { size = value.size || size; gestureMode = value.gestureMode || gestureMode; audioStatus = value.audioStatus || audioStatus; },
    visibility(hidden) {
      if (ended !== null) return;
      previous = previousPhase = null;
      if (hidden && hiddenAt === null) { hiddenAt = now(); hiddenCount++; }
      if (!hidden && hiddenAt !== null) { hiddenMs += now() - hiddenAt; hiddenAt = null; }
    },
    supportLongTasks(value) { longTasks.supported = value; },
    longTask(duration) {
      if (ended !== null || hiddenAt !== null || !Number.isFinite(duration)) return;
      longTasks.count++; longTasks.totalMs += duration; longTasks.maxMs = Math.max(longTasks.maxMs, duration);
    },
    frame(time, cost, active, context = {}) {
      if (ended !== null) return;
      const phase = phaseOf(context);
      if (hiddenAt !== null || !active || !phase) { previous = previousPhase = null; return; }
      if (phase === "intro") this.intro();
      if (previousPhase !== phase) { previous = time; previousPhase = phase; return; }
      const gap = time - previous;
      // Multiple redraws in the same browser frame are not additional FPS.
      if (gap < 4) return;
      previous = time;
      const sample = samples[phase] ||= { intervals: [], costs: [] };
      if (sample.intervals.length < 20000) { sample.intervals.push(gap); sample.costs.push(cost); }
    },
    loading() { return readyAt === null; },
    elapsed() { return now() - start; },
    snapshot(status = "complete", reason = "") {
      const end = ended ?? now();
      return { profile, attempt, status, reason, elapsedMs: end - start, loadingMs: readyAt === null ? null : readyAt - start - loadingHiddenMs,
        loadingWallMs: readyAt === null ? null : readyAt - start,
        introWaitMs: introAt === null ? null : introAt - start, hiddenMs: hiddenMs + (hiddenAt === null ? 0 : end - hiddenAt), hiddenCount,
        gestureMode, audioStatus, size: { ...size }, timings: { ...timings }, programs, parallelShaders,
        longTasks: { ...longTasks }, phases: Object.fromEntries(Object.entries(samples).map(([phase, sample]) => [phase, {
          ...summarizeWheelFrames(sample.intervals, sample.costs, profile === "light" ? 30 : 60),
          max: Math.max(...sample.intervals), durationMs: sample.intervals.reduce((a, b) => a + b, 0),
        }])) };
    },
    finish(status, reason) { ended ??= now(); return this.snapshot(status, reason); },
  };
}
