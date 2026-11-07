// A preference in the survey is not a capacity measurement. Keep this policy
// shared by the admin report, browser setup and server recovery endpoint.
export const WHEEL_GRAPHICS_POLICY_VERSION = 1;
export const WHEEL_GRAPHICS_ORDER = Object.freeze(["detailed", "balanced", "light"]);
export const WHEEL_GRAPHICS_LIMITS = Object.freeze({ excludedFps: 25, stableFps: 29, p95Ms: 50, minSamples: 40, minDurationMs: 1500 });
export const wheelDiagnosticPreference = report => ["flat", ...WHEEL_GRAPHICS_ORDER].includes(report?.survey?.preferred)
  ? report.survey.preferred : null;

export function assessWheelGraphicsRun(run) {
  const enough = phase => phase && Number.isFinite(phase.fps) && Number.isFinite(phase.p95)
    && phase.samples >= WHEEL_GRAPHICS_LIMITS.minSamples && phase.durationMs >= WHEEL_GRAPHICS_LIMITS.minDurationMs;
  if (Object.values(run?.phases || {}).filter(enough).some(phase => phase.fps < WHEEL_GRAPHICS_LIMITS.excludedFps)) {
    return { usable: false, conclusive: true, reason: "below_25" };
  }
  if (!run || run.status !== "complete") return { usable: false, conclusive: run?.status === "error", reason: "incomplete" };
  const phases = [run.phases?.intro, run.phases?.spin];
  const measured = phases.filter(enough);
  if (measured.length !== phases.length) return { usable: false, conclusive: false, reason: "insufficient" };
  // Existing slowRatio counts >27 ms frames in medium/high: it would reject a
  // perfectly regular 30 FPS. Use p95 instead, alongside the phase averages.
  const stable = measured.every(phase => phase.fps >= WHEEL_GRAPHICS_LIMITS.stableFps && phase.p95 <= WHEEL_GRAPHICS_LIMITS.p95Ms);
  const result = run.phases?.results;
  const stableResult = !result || result.samples < 20 || (result.fps >= WHEEL_GRAPHICS_LIMITS.stableFps && result.p95 <= WHEEL_GRAPHICS_LIMITS.p95Ms);
  return { usable: stable && stableResult, conclusive: true, reason: stable && stableResult ? "stable" : "unstable" };
}

export function recommendWheelGraphics(report) {
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  const evidence = Object.fromEntries(WHEEL_GRAPHICS_ORDER.map(profile => {
    const attempts = runs.filter(run => run.profile === profile);
    const assessed = attempts.map(assessWheelGraphicsRun);
    // A second successful attempt does not conceal a failure in the same test.
    return [profile, { usable: assessed.some(result => result.usable) && assessed.every(result => result.usable || !result.conclusive),
      conclusive: assessed.some(result => result.conclusive), reasons: assessed.map(result => result.reason) }];
  }));
  const visualFailure = ["broken", "black"].includes(report?.survey?.visual);
  const profile = visualFailure ? "flat" : WHEEL_GRAPHICS_ORDER.find(id => evidence[id].usable)
    || (WHEEL_GRAPHICS_ORDER.every(id => evidence[id].conclusive) ? "flat" : null);
  return { version: WHEEL_GRAPHICS_POLICY_VERSION, profile, evidence,
    reason: visualFailure ? "visual_error" : profile === "flat" ? "no_stable_3d" : profile ? "measured" : "needs_measurement" };
}

export const wheelGraphicsReason = recommendation => ({
  manual: "Mode choisi manuellement. Tu peux le modifier à tout moment dans Graphismes.",
  measured: "Qualité retenue d’après les mesures de l’introduction et du lancer.",
  no_stable_3d: "Aucun niveau 3D testé ne reste suffisamment fluide et fiable.",
  visual_error: "Un défaut d’affichage a été signalé ; la 2D est retenue par prudence.",
  needs_measurement: "Mesures insuffisantes : un contrôle sur cet appareil reste nécessaire.",
  interrupted: "Le contrôle précédent a été interrompu. La 2D permet de continuer.",
  timeout: "Le contrôle n’a pas pu aboutir à temps. La 2D permet de continuer.",
}[recommendation?.reason] || "Réglage adapté à cet appareil.");
