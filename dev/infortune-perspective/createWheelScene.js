import * as THREE from "three";
import { createWheelMeshes } from "./wheelMeshes.js";
import { createStudioEnvironment } from "./studioEnvironment.js";
import { createStageSet } from "./createStageSet.js";
import { createStageActors } from "./createStageActors.js";
import { createStageReflections } from "./createStageReflections.js";
import { createStageLighting } from "./createStageLighting.js";
import { DEFAULT_REFLECTIONS } from "./sphericalReflections.js";
import { createActorReflections } from "./createActorReflections.js";
import { createAudienceEnvironment } from "./createAudienceEnvironment.js";
import { createWheelResultPresentation } from "./createWheelResultPresentation.js";
import { sectorAtPointer } from "../../src/features/infortune/wheelConfig.js";
import { prepareWheelRendering } from "./wheelScenePreparation.js";
import { WHEEL_PROFILES, createWheelFrameGate } from "./wheelPerformance.js";
import { measureWheelRendering } from "./measureWheelRendering.js";
import { placeStageContestants } from "./stageFixtures.js";
import { infortuneSectors } from "../../shared/infortuneWheel.js";
import { createExchangeTiles } from "./createExchangeTiles.js";
import { compileWheelPass } from "./compileWheelPass.js";
import { createWheelStartupBudget } from "./wheelStartupBudget.js";
import { finishWheelPrograms } from "./finishWheelPrograms.js";
import { compactAreaLightShader } from "./compactAreaLightShader.js";

export function createWheelScene(canvas, initialProjection, onContextError, onStageChange = () => {}, performanceOptions = {}) {
  const startedAt = performance.now(), abort = new AbortController(), frameGate = createWheelFrameGate();
  let qualityId = performanceOptions.profile || "balanced", requestedQuality = qualityId, shadowResizePending = false;
  const ownsRenderer = !performanceOptions.renderer;
  const renderer = performanceOptions.renderer || new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setRenderTarget(null);
  const parallelShaders = renderer.extensions.has("KHR_parallel_shader_compile");
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, WHEEL_PROFILES[qualityId].maxPixelRatio) * WHEEL_PROFILES[qualityId].scale;
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#000000");
  let environmentTarget = null;
  scene.environmentIntensity = 0.6;
  // Compilation support controls how we wait for shaders, never scene quality.
  const lighting = createStageLighting(); scene.add(lighting.root);
  const audience = createAudienceEnvironment(); scene.add(audience.root);
  const model = createWheelMeshes(); scene.add(model.root);
  const sectors = infortuneSectors(performanceOptions.exchangeEnabled);
  const exchange = performanceOptions.exchangeEnabled ? createExchangeTiles(model.rotor, { underlays: model.tiles }) : null;
  const contestants = placeStageContestants(performanceOptions.contestants);
  const picker = new THREE.Raycaster();
  const stage = createStageSet(contestants, { screenTextureWidth: Math.min(qualityId === "light" ? 2048 : 4096, renderer.capabilities.maxTextureSize) });
  const actors = createStageActors(lighting.backLights, contestants); scene.add(stage.root, actors.root);
  // Both 256px maps use the same blur shader. Keep its generator alive until
  // scene disposal instead of deleting and compiling that program a second time.
  const ownsEnvironmentGenerator = !performanceOptions.environmentGenerator;
  const environmentGenerator = performanceOptions.environmentGenerator || new THREE.PMREMGenerator(renderer);
  const reflections = createStageReflections(renderer, scene, model.root, stage.reflectiveMaterials, actors.root, environmentGenerator);
  const actorReflections = stage.reflectionSurfaces.map(({ surface, ...options }) =>
    createActorReflections(renderer, scene, surface, actors.root, lighting.root, options));
  lighting.setQuality(WHEEL_PROFILES[qualityId]);
  actorReflections.forEach(reflection => reflection.setResolutionScale(WHEEL_PROFILES[qualityId].reflectionScale));
  let projection = initialProjection, reflectionSettings = DEFAULT_REFLECTIONS, disposed = false;
  let prepared = false, warming = null, released = false, active = true, disposal = null;
  let pendingDraw = null, renderWidth = 0, renderHeight = 0;
  const resultPresentation = createWheelResultPresentation();
  let previousPhase = null;
  let sequence = null;
  let preparingStep = "Images et avatars";
  const timings = { assets: 0, graphics: 0, measurement: 0, steps: {}, programChecks: [],
    driverCheckMs: 0, driverYieldMs: 0, programCheckCount: 0, parallelShaders,
    reusedContext: performanceOptions.reusedContext === true };
  const publishTimings = () => performanceOptions.onTimings?.({ ...timings, steps: { ...timings.steps },
    programChecks: timings.programChecks.slice(), programs: renderer.info.programs.length });
  const budget = createWheelStartupBudget({ onSlow(value) {
    publishTimings(); return performanceOptions.onStartupSlow?.({ ...value, step: preparingStep }) === true;
  } });
  const cancelled = () => disposed || renderer.getContext().isContextLost() || budget.check();
  const status = value => { preparingStep = value.message; if (!cancelled()) onStageChange(value); };
  const compile = async (targetScene, camera, include = [], pass = "shaders") => {
    const label = preparingStep;
    const compiled = await compileWheelPass(renderer, targetScene, camera, {
      isDisposed: cancelled, include,
      onProgress(done, total) { if (!cancelled()) onStageChange({ phase: "loading", message: `${label} Objets : ${done}/${total}` }); },
    });
    if (!compiled || cancelled()) return false;
    return finishWheelPrograms(renderer, { isDisposed: cancelled,
      onProgress(done, total, program) {
        const shader = program ? ` · ${program.name || program.type || "shader"} #${program.id ?? done}` : "";
        status({ phase: "loading", message: `Validation graphique par le pilote… ${done}/${total}${shader}` });
      },
      onProgramTiming(value) {
        timings.driverCheckMs += value.checkMs; timings.driverYieldMs += value.yieldMs; timings.programCheckCount++;
        timings.programChecks.push({ ...value, pass });
        timings.programChecks.sort((a, b) => b.checkMs - a.checkMs); timings.programChecks.length = Math.min(16, timings.programChecks.length);
        if (import.meta.env?.DEV && value.checkMs >= 100) console.info("[Roue · validation pilote]", { pass, ...value });
        publishTimings();
      },
    });
  };
  reflections.setProjection(projection, reflectionSettings);
  function draw(force = false) {
    if (pendingDraw !== null) { cancelAnimationFrame(pendingDraw); pendingDraw = null; }
    if (disposed || !active || !prepared || document.hidden) return;
    if (!force && !frameGate.due(performance.now(), WHEEL_PROFILES[qualityId].fps)) { scheduleDraw(); return; }
    renderFrame();
  }
  function renderFrame(camera = projection.camera, record = prepared) {
    const time = performance.now();
    if (shadowResizePending) { captureShadows(); shadowResizePending = false; }
    for (const reflection of actorReflections) reflection.render(camera, reflectionSettings.actors);
    renderer.render(scene, camera);
    resultPresentation.render(renderer, projection);
    if (record) performanceOptions.onFrame?.(time, performance.now() - time,
      sequence?.playing || ["spinning", "dragging"].includes(previousPhase));
  }
  function scheduleDraw() {
    if (!disposed && active && prepared && pendingDraw === null) pendingDraw = requestAnimationFrame(() => draw());
  }
  function captureShadows() {
    const wasVisible = model.root.visible;
    try { model.root.visible = false; lighting.prepareActorShadows(); renderer.render(scene, projection.camera); }
    finally { model.root.visible = wasVisible; }
  }
  function applyQuality(value) {
    if (!WHEEL_PROFILES[value] || value === "flat" || value === qualityId) return;
    qualityId = value; frameGate.reset(); renderer.setPixelRatio(pixelRatio());
    lighting.setQuality(WHEEL_PROFILES[value]); shadowResizePending = true;
    actorReflections.forEach(reflection => reflection.setResolutionScale(WHEEL_PROFILES[value].reflectionScale));
  }
  status({ phase: "loading", message: "Installation du présentateur et des avatars…" });
  Promise.all([actors.ready, audience.ready]).then(async () => {
    if (cancelled()) return;
    compactAreaLightShader(scene);
    const assetsAt = performance.now();
    timings.assets = assetsAt - startedAt; publishTimings();
    warming = prepareWheelRendering({ renderer, scene, camera: projection.camera,
      isDisposed: cancelled, onStatus: status,
      onTiming(id, duration) { timings.steps[id] = duration; timings.graphics = performance.now() - assetsAt; publishTimings(); },
      compile: () => compile(scene, projection.camera, exchange?.tiles || []),
      prepareEnvironment() {
        environmentTarget = createStudioEnvironment(renderer, environmentGenerator); scene.environment = environmentTarget.texture;
        reflections.prepare(environmentTarget.texture);
      },
      prepareShadows: () => lighting.prepareActorShadows(),
      captureShadows,
      captureReflections: () => reflections.capture((s, c) => compile(s, c, [], "studioReflection"), cancelled),
      prepareActorReflections: () => actorReflections.forEach(reflection => reflection.prepare()),
      async warmActorReflections() {
        for (const reflection of actorReflections) {
          if (cancelled()) return;
          await reflection.warmup((s, c) => compile(s, c, [], "actorReflections"));
        }
      },
      draw: () => renderFrame(projection.camera, false),
    });
    // Keep disposal waiting through both GPU warmup and the cancellable sample.
    warming = warming.then(async ready => {
      if (!ready || cancelled()) return false;
      const graphicsAt = performance.now();
      applyQuality(requestedQuality);
      if (performanceOptions.onBenchmark) {
        status({ phase: "loading", message: "Réglage de la fluidité du plateau…" });
        for (let attempt = 0; attempt < 3 && !cancelled(); attempt++) {
          const camera = projection.camera.clone(), rotation = camera.quaternion.clone();
          const sample = await measureWheelRendering({ signal: abort.signal, draw(index) {
            camera.quaternion.copy(rotation); camera.rotateY(Math.sin(index / 20) * 0.035); camera.updateMatrixWorld(true);
            actorReflections.forEach(reflection => reflection.invalidate()); renderFrame(camera, false);
          } });
          if (!sample || cancelled()) return false;
          const next = performanceOptions.onBenchmark(sample.intervals, sample.costs, qualityId);
          if (next === "flat") return false;
          if (next === qualityId) break;
          applyQuality(next);
        }
      }
      if (cancelled()) return false;
      actorReflections.forEach(reflection => reflection.invalidate()); renderFrame(projection.camera, false);
      timings.graphics = graphicsAt - assetsAt; timings.measurement = performance.now() - graphicsAt; publishTimings();
      budget.dispose();
      prepared = true; frameGate.reset(); onStageChange({ phase: "ready", message: "" });
      return true;
    });
    await warming;
  }).catch(error => {
    if (cancelled()) return;
    budget.dispose();
    console.error("Stage preparation failed", error);
    onStageChange({ phase: "error", message: "La préparation du plateau a échoué. Rechargez l’atelier pour réessayer." });
  });
  function contextLost(event) {
    event.preventDefault(); onContextError("Le rendu 3D a été interrompu. Rechargez l’atelier pour reprendre.");
  }
  function releaseResources() {
    if (released) return;
    released = true;
    resultPresentation.dispose(); actors.dispose(); audience.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(object => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of materials) {
      for (const [key, value] of Object.entries(material)) if (key !== "envMap" && value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    actorReflections.forEach(reflection => reflection.dispose()); reflections.dispose(); lighting.dispose(); environmentTarget?.dispose();
    if (ownsEnvironmentGenerator) environmentGenerator.dispose();
    if (ownsRenderer) renderer.dispose();
  }
  canvas.addEventListener("webglcontextlost", contextLost);
  function suspend() {
    active = false;
    if (pendingDraw !== null) { cancelAnimationFrame(pendingDraw); pendingDraw = null; }
    canvas.removeEventListener("webglcontextlost", contextLost);
    // Cached graphics must not keep an unmounted React view or its callbacks
    // alive. Controllers, camera sequences and audio remain owned by the hook.
    performanceOptions = {}; onStageChange = () => {}; onContextError = () => {};
    sequence = null; resultPresentation.clear();
  }
  return {
    suspend,
    pickContestant(x, y) {
      picker.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), projection.camera);
      const candidates = actors.root.children.filter(actor => actor.name.startsWith("contestant-"));
      const hit = picker.intersectObjects(candidates, false)[0];
      return hit?.object.name.slice("contestant-".length) || null;
    },
    setExchangeProgress(progress) { exchange?.update(progress); scheduleDraw(); },
    setBanks(value) { stage.setBanks(value); scheduleDraw(); },
    setCameraSequence(state) { sequence = state; resultPresentation.setSequence(state); scheduleDraw(); },
    setQuality(value) { requestedQuality = value; if (prepared) { applyQuality(value); scheduleDraw(); } },
    setActorShade(value) {
      actors.setShading(value);
      actorReflections.forEach(reflection => reflection.invalidate()); draw();
    },
    setProjection(value, settings = reflectionSettings) {
      projection = value; reflectionSettings = settings; reflections.setProjection(value, settings);
      actorReflections.forEach(reflection => reflection.invalidate());
      const width = Math.round(value.width), height = Math.round(value.height);
      if (width !== renderWidth || height !== renderHeight) {
        renderWidth = width; renderHeight = height; renderer.setSize(width, height, false);
      }
      // A physics frame can consume this request, avoiding a second scene render
      // when the wheel and the camera are animated at the same time.
      scheduleDraw();
    },
    update(state, phase) {
      // Same orientation and contact geometry as the overhead prototype.
      model.rotor.rotation.y = -state.angle; model.pawl.update(state.pawl, state.pawlModel);
      if (phase === "finished" && previousPhase !== "finished") {
        resultPresentation.setResult(sectorAtPointer(state.angle, state.pawl, state.pawlModel, sectors), state.angle);
      } else if (phase !== "finished" && previousPhase === "finished") resultPresentation.clear();
      previousPhase = phase;
      canvas.dataset.motion = phase; draw(phase === "finished");
    },
    draw,
    dispose() {
      if (disposed) return disposal;
      suspend();
      disposed = true; budget.dispose(); abort.abort();
      // Let the preparation's cancellation/polling settle before GPU cleanup.
      // Asset-only loading has no GPU work in flight and can release immediately.
      if (warming) disposal = warming.then(releaseResources, releaseResources);
      else { releaseResources(); disposal = Promise.resolve(); }
      return disposal;
    },
  };
}
