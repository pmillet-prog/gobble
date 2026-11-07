import { WHEEL_GRAPHICS_ORDER, assessWheelGraphicsRun, recommendWheelGraphics, wheelDiagnosticPreference } from "../../../../shared/wheelGraphicsRecommendation.js";
import { beginWheelGraphicsCheck, graphicsStorage, interruptedWheelGraphicsCheck, readWheelGraphics,
  saveWheelGraphics, wheelGraphicsDevice, readWheelGraphicsPreference, setWheelGraphicsPreference, endWheelGraphicsCheck } from "./wheelGraphicsStorage.js";

// Owns setup, cancellation and deadlines. Rendering remains in the stage.
export function createWheelGraphicsSetup({ storage = graphicsStorage(), fetcher = globalThis.fetch, timers = globalThis,
  now = () => performance.now(), visible = () => !document.hidden, onChange = () => {}, onKnown = () => {} } = {}) {
  let state = { phase: "checking", index: 0, profile: "detailed", runs: [], recommendation: null, legacy: [] };
  let disposed = false, interval = null, abort = null, lookupTimer = null, last = 0, stageMs = 0, measuring = false, wasVisible = true;
  const publish = patch => { if (!disposed) { state = { ...state, ...patch }; onChange(state); } };
  const known = recommendation => { publish({ phase: "done", recommendation }); onKnown(recommendation); };
  const finish = recommendation => {
    if (disposed) return;
    if (interval !== null) timers.clearInterval(interval); interval = null;
    const saved = saveWheelGraphics(recommendation, { storage });
    publish({ phase: "done", recommendation: saved || recommendation });
  };
  const restore = entry => {
    const saved = saveWheelGraphics(entry.recommendation, { storage, reportId: entry.reportId });
    const preference = wheelDiagnosticPreference({ survey: { preferred: entry.preference } });
    if (preference) {
      setWheelGraphicsPreference(preference, storage); endWheelGraphicsCheck(storage);
      return { profile: preference, reason: "manual" };
    }
    return saved;
  };
  const next = run => {
    if (disposed || state.phase !== "running" || run.profile !== state.profile) return;
    const runs = [...state.runs, run];
    if (assessWheelGraphicsRun(run).usable) { publish({ runs }); finish(recommendWheelGraphics({ runs })); return; }
    if (state.index === WHEEL_GRAPHICS_ORDER.length - 1) {
      const recommendation = recommendWheelGraphics({ runs });
      publish({ runs }); finish({ ...recommendation, profile: "flat",
        reason: runs.some(attempt => attempt.status === "timeout") ? "timeout" : recommendation.reason }); return;
    }
    stageMs = 0; measuring = false; last = now();
    publish({ runs, index: state.index + 1, profile: WHEEL_GRAPHICS_ORDER[state.index + 1] });
  };
  return {
    snapshot: () => state,
    async start({ force = false } = {}) {
      if (!force) {
        const preference = readWheelGraphicsPreference(storage);
        if (preference !== "auto") { endWheelGraphicsCheck(storage); known({ profile: preference, reason: "manual" }); return; }
        // A crash/reload during setup must never cause an endless GPU crash loop.
        if (interruptedWheelGraphicsCheck(storage)) {
          const fallback = saveWheelGraphics({ profile: "flat", reason: "interrupted" }, { storage });
          known(fallback); return;
        }
        const saved = readWheelGraphics(storage);
        if (saved) { known(saved); return; }
        abort = new AbortController();
        lookupTimer = timers.setTimeout(() => abort?.abort(), 3500);
        try {
          const response = await fetcher(`/api/infortune/graphics?device=${encodeURIComponent(wheelGraphicsDevice(storage))}`,
            { credentials: "same-origin", cache: "no-store", signal: abort.signal });
          if (disposed) return;
          if (response.ok) {
            const body = await response.json();
            if (disposed) return;
            const restored = restore(body);
            if (restored) { known(restored); return; }
            const legacy = Array.isArray(body.legacy) ? body.legacy : [];
            // Old reports predate device identifiers. Reuse the account's most
            // recent explicit choice without claiming its measurements describe
            // this device, and persist it so reloads need no server lookup.
            const previousChoice = legacy.map(entry => wheelDiagnosticPreference({ survey: { preferred: entry.preference } })).find(Boolean);
            if (previousChoice) {
              setWheelGraphicsPreference(previousChoice, storage); endWheelGraphicsCheck(storage);
              known({ profile: previousChoice, reason: 'manual' }); return;
            }
            publish({ legacy: legacy.slice(0, 3) });
          }
        } catch { /* Offline/old servers still allow a local measurement. */ }
        finally { timers.clearTimeout(lookupTimer); lookupTimer = null; }
      }
      publish({ phase: "welcome" });
    },
    begin() {
      if (disposed || state.phase !== "welcome") return;
      beginWheelGraphicsCheck(storage); last = now(); stageMs = 0; measuring = false; wasVisible = visible();
      publish({ phase: "running" });
      interval = timers.setInterval(() => {
        const time = now(), elapsed = Math.max(0, time - last); last = time;
        const foreground = visible();
        if (!foreground || !wasVisible) { wasVisible = foreground; return; }
        stageMs += elapsed;
        // Each quality gets its own loading and animation budgets. A cold GPU
        // or a blocked task on high must never consume the lower qualities' tests.
        if (stageMs >= (measuring ? 15000 : 45000)) next({ profile: state.profile, status: "timeout",
          reason: measuring ? "La mesure du lancer n’a pas abouti." : "Le plateau n’a pas fini de charger." });
      }, 250);
    },
    ready(profile) {
      if (disposed || state.phase !== "running" || profile !== state.profile || measuring) return;
      measuring = true; stageMs = 0; last = now(); wasVisible = visible();
    },
    retry() {
      if (disposed || state.phase !== "done") return;
      publish({ phase: "welcome", index: 0, profile: "detailed", runs: [], recommendation: null });
      this.begin();
    },
    chooseManual(profile) {
      if (disposed || !["flat", ...WHEEL_GRAPHICS_ORDER].includes(profile)) return;
      abort?.abort();
      if (interval !== null) timers.clearInterval(interval); interval = null;
      setWheelGraphicsPreference(profile, storage); endWheelGraphicsCheck(storage);
      publish({ phase: "done", recommendation: { profile, reason: "manual" } });
    },
    useLegacy(reportId) {
      if (disposed || state.phase !== "welcome") return;
      const candidate = state.legacy.find(entry => entry.reportId === reportId);
      if (!candidate) return;
      const restored = restore(candidate);
      if (restored) publish({ phase: "done", recommendation: restored });
    },
    receive: next,
    visibility() { last = now(); wasVisible = visible(); },
    dispose() { disposed = true; abort?.abort(); if (lookupTimer !== null) timers.clearTimeout(lookupTimer);
      if (interval !== null) timers.clearInterval(interval); interval = null; },
  };
}
