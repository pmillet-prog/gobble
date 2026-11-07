export const WHEEL_DIAGNOSTIC_VERSION = 1;
export const WHEEL_DIAGNOSTIC_STEPS = Object.freeze([
  { profile: "flat", label: "2D", description: "La roue vue du dessus, sans le décor 3D. Le fonctionnement du lancer reste le même." },
  { profile: "light", label: "3D légère", description: "Une 3D moins exigeante, limitée à trente images par seconde." },
  { profile: "balanced", label: "3D moyenne", description: "Le plateau 3D avec une définition plus élevée et des reflets plus détaillés." },
  { profile: "detailed", label: "3D haute", description: "Tous les détails, les ombres et les reflets, avec la meilleure définition." },
]);
export const WHEEL_SURVEY = Object.freeze([
  { id: "stutter", label: "La 3D t’a-t-elle paru saccadée ?", options: { no: "Non", slight: "Un peu", strong: "Beaucoup", unseen: "Je n’ai pas pu la voir" } },
  { id: "loading", label: "Le chargement t’a-t-il paru long ?", options: { no: "Non", first: "La première fois seulement", every: "Oui, à plusieurs passages", unsure: "Difficile à dire" } },
  { id: "visual", label: "L’image s’affichait-elle correctement ?", options: { good: "Oui", broken: "Des éléments manquaient ou étaient déformés", black: "Écran noir ou affichage bloqué", unsure: "Je ne sais pas" } },
  { id: "gesture", label: "As-tu réussi à lancer la roue au geste ?", options: { easy: "Oui, facilement", practice: "Après quelques essais", difficult: "Difficilement", impossible: "Non", click: "J’ai utilisé seulement le bouton" } },
  { id: "audio", label: "Comment était le son ?", options: { good: "Correct", broken: "Haché, décalé ou avec des clics gênants", absent: "Aucun son malgré son activation", muted: "Je l’ai coupé" } },
  { id: "preferred", label: "Quelle version choisirais-tu pour jouer sur cet appareil ?", options: {
    flat: "2D", light: "3D légère", balanced: "3D moyenne", detailed: "3D haute", none: "Aucune ne fonctionnait bien", unsure: "Sans préférence" } },
]);
export const WHEEL_FLUIDITY = Object.freeze({ smooth: "Fluide", slight: "Quelques saccades", strong: "Très saccadé", unseen: "Non observé" });
export const diagnosticProfileLabel = profile => WHEEL_DIAGNOSTIC_STEPS.find(step => step.profile === profile)?.label || profile;
export const WHEEL_PREPARATION_STEPS = Object.freeze({ environment: "Environnement lumineux", textures: "Envoi des textures au GPU",
  shaders: "Compilation et validation des shaders", shadows: "Ombres", studioReflection: "Reflets du décor",
  actorReflections: "Reflets des candidats", firstFrame: "Premier rendu complet" });

export function wheelSurveyComplete(survey) {
  return !!survey && WHEEL_SURVEY.every(question => Object.hasOwn(question.options, survey[question.id]))
    && WHEEL_DIAGNOSTIC_STEPS.every(step => Object.hasOwn(WHEEL_FLUIDITY, survey.fluidity?.[step.profile]));
}

// An explicit bounded schema also keeps arbitrary client objects out of storage.
export function normalizeWheelDiagnostic(value) {
  const invalid = () => { throw new Error("invalid_wheel_diagnostic"); };
  const object = item => item && typeof item === "object" && !Array.isArray(item);
  const text = (item, max) => typeof item === "string" ? item.slice(0, max) : "";
  const number = (item, max = 3600000) => Number.isFinite(item) && item >= 0 && item <= max ? Math.round(item * 100) / 100 : null;
  if (!object(value) || value.version !== WHEEL_DIAGNOSTIC_VERSION || !/^[\w-]{16,80}$/.test(value.id)
    || !Array.isArray(value.runs) || !value.runs.length || value.runs.length > 8 || !wheelSurveyComplete(value.survey)) invalid();
  const phases = ["intro", "gesture", "spin", "results"];
  const metric = m => !object(m) ? null : Object.fromEntries(["fps", "p95", "max", "slowRatio", "renderMs", "samples", "durationMs"].map(key => [key, number(m[key])]));
  const runs = value.runs.map(run => {
    if (!object(run) || !WHEEL_DIAGNOSTIC_STEPS.some(step => step.profile === run.profile)
      || !["complete", "skipped", "error", "timeout"].includes(run.status)) invalid();
    return { profile: run.profile, attempt: number(run.attempt, 2), status: run.status, reason: text(run.reason, 400),
      elapsedMs: number(run.elapsedMs), loadingMs: number(run.loadingMs), loadingWallMs: number(run.loadingWallMs), introWaitMs: number(run.introWaitMs), hiddenMs: number(run.hiddenMs),
      hiddenCount: number(run.hiddenCount), gestureMode: text(run.gestureMode, 20), audioStatus: text(run.audioStatus, 30),
      size: { width: number(run.size?.width, 20000), height: number(run.size?.height, 20000) },
      timings: { ...Object.fromEntries(["assets", "graphics", "measurement", "module", "driverCheckMs", "driverYieldMs", "programCheckCount"].map(key => [key, number(run.timings?.[key])])),
        steps: Object.fromEntries(Object.keys(WHEEL_PREPARATION_STEPS).filter(key => Number.isFinite(run.timings?.steps?.[key]))
          .map(key => [key, number(run.timings.steps[key])])),
        programChecks: (Array.isArray(run.timings?.programChecks) ? run.timings.programChecks : []).slice(0, 16).filter(object).map(check => ({
          id: number(check.id, 1000000), type: text(check.type, 80), name: text(check.name, 80),
          pass: Object.hasOwn(WHEEL_PREPARATION_STEPS, check.pass) ? check.pass : "shaders",
          checkMs: number(check.checkMs), yieldMs: number(check.yieldMs), linked: check.linked === true,
        })) },
      parallelShaders: typeof run.parallelShaders === "boolean" ? run.parallelShaders : null,
      programs: number(run.programs, 10000),
      phases: Object.fromEntries(phases.map(phase => [phase, metric(run.phases?.[phase])])),
      longTasks: object(run.longTasks) ? { supported: run.longTasks.supported === true, count: number(run.longTasks.count),
        totalMs: number(run.longTasks.totalMs), maxMs: number(run.longTasks.maxMs) } : null,
    };
  });
  if (WHEEL_DIAGNOSTIC_STEPS.some(step => runs.filter(run => run.profile === step.profile).length > 2)) invalid();
  return { version: value.version, id: value.id, startedAt: text(value.startedAt, 40),
    environment: { deviceId: /^[\w-]{16,80}$/.test(value.environment?.deviceId || "") ? value.environment.deviceId : null,
      userAgent: text(value.environment?.userAgent, 600), platform: text(value.environment?.platform, 100),
      width: number(value.environment?.width, 20000), height: number(value.environment?.height, 20000),
      pixelRatio: number(value.environment?.pixelRatio, 20), cores: number(value.environment?.cores, 1024),
      memory: number(value.environment?.memory, 1024), touchPoints: number(value.environment?.touchPoints, 100) },
    runs, survey: { ...Object.fromEntries(WHEEL_SURVEY.map(q => [q.id, value.survey[q.id]])),
      fluidity: Object.fromEntries(WHEEL_DIAGNOSTIC_STEPS.map(step => [step.profile, value.survey.fluidity[step.profile]])),
      comment: text(value.survey.comment, 1200) } };
}
