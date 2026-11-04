import React from "react";
import { createWheelController } from "../../src/features/infortune/createWheelController.js";
import { createWheelAudio } from "../../src/features/infortune/wheelAudio.js";
import { WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";
import { createProjection, updateProjection, STAGE_CAMERA, unprojectPoint } from "./projection.js";
import { PEG_RADIUS } from "./wheelDimensions.js";
import { PAWL_MODELS } from "../../src/features/infortune/wheelPawlModels.js";
import { DEFAULT_ACTOR_SHADE } from "./actorShadeSettings.js";
import { screenGestureTravel } from "./wheelScreenGesture.js";
import { deferWheelSetup } from "./wheelScenePreparation.js";
import { useWheelPerformance } from "./useWheelPerformance.js";
import { flatWheelPoint, flatWheelTravel } from "./flatWheelGeometry.js";
import { infortuneSectors } from "../../shared/infortuneWheel.js";
import { createExchangeArrival } from "./exchangeArrival.js";
import { updateSkillShotOverlay } from "./skillShotOverlay.js";

// This preview owns its own input and lifecycle. The original workshop and its
// input mapping remain untouched; the physical model is shared, not the view.
export function usePerspectiveWheel(size, reflections, { muted: initiallyMuted = false, onLaunch: onLaunchCallback, onResult, contestants, exchangeEnabled = false, banks, onChoose, inputDisabled = false, gestureMode = "power", diagnostic = null } = {}) {
  const scene = React.useRef(null), canvas = React.useRef(null), gauges = React.useRef({});
  const canvasHost = React.useRef(null);
  const skillOverlay = React.useRef(null);
  const controller = React.useRef(null), graphics = React.useRef(null), currentProjection = React.useRef(null);
  const spinProgress = React.useRef(null);
  const audioEvents = React.useRef(null);
  const inputLock = React.useRef(true);
  const exchangeProgress = React.useRef(exchangeEnabled ? 0 : 1), arrival = React.useRef(null);
  const graphicsReady = React.useRef(false), lastState = React.useRef(null), cameraSequence = React.useRef(null);
  const performance = useWheelPerformance(diagnostic?.profile);
  const flat = performance.report.profile === "flat", mode = flat ? "flat" : "3d";
  const [inputLocked, setInputLockedState] = React.useState(true);
  if (!currentProjection.current) currentProjection.current = createProjection(size.width, size.height, STAGE_CAMERA);
  const pointers = React.useRef({ wheel: null });
  const [view, setView] = React.useState({ phase: "ready", message: "", result: null });
  const [muted, setMuted] = React.useState(initiallyMuted);
  const [launchBank, setLaunchBank] = React.useState(0);
  const [pawlMode, setPawlMode] = React.useState("needle");
  const [actorShade, setActorShade] = React.useState(DEFAULT_ACTOR_SHADE);
  const [renderError, setRenderError] = React.useState(null);
  const [stageStatus, setStageStatus] = React.useState({ phase: "loading", message: "Installation du plateau…" });
  const latest = React.useRef(null); latest.current = { reflections, actorShade, mode, profile: performance.report.profile, contestants,
    exchangeEnabled, sectors: infortuneSectors(exchangeEnabled), onLaunchCallback, onResult, banks, onChoose, inputDisabled, gestureMode, diagnostic };
  const syncInputLock = React.useCallback(() => {
    const locked = inputLock.current || !graphicsReady.current || latest.current.inputDisabled || latest.current.exchangeEnabled && exchangeProgress.current < 1;
    controller.current?.setInputLocked(locked); setInputLockedState(locked);
  }, []);
  React.useEffect(syncInputLock, [inputDisabled, syncInputLock]);
  React.useEffect(() => {
    const animation = createExchangeArrival({ onProgress(value) { exchangeProgress.current = value; graphics.current?.setExchangeProgress(value); }, onDone: syncInputLock });
    arrival.current = animation; exchangeProgress.current = exchangeEnabled ? 0 : 1; syncInputLock();
    return () => { animation.dispose(); arrival.current = null; };
  }, [exchangeEnabled, syncInputLock]);
  React.useEffect(() => deferWheelSetup(() => {
    let lastScene = {};
    const instance = createWheelController({
      audio: createWheelAudio(), onChange(view) {
        audioEvents.current?.({ type: "phase", view }); setView(view);
        if (!["dragging", "aiming"].includes(view.phase)) performance.monitor.applyPending();
      },
      pegRadius: PEG_RADIUS, pawlModel: PAWL_MODELS[pawlMode],
      launchGame: { rewards: { good: 50, perfect: 100 }, gestureMode: latest.current.gestureMode },
      inputLocked: inputLock.current || !graphicsReady.current,
      readSectors: () => latest.current.sectors,
      onResult: value => latest.current.onResult?.(value),
      onLaunch(value) { latest.current.onLaunchCallback?.(value); if (value.quality?.bonus) setLaunchBank(total => total + value.quality.bonus); },
      onSpinProgress(progress) { audioEvents.current?.({ type: "spin", progress }); spinProgress.current?.(progress); },
      render(state, phase, power, game) {
        updateSkillShotOverlay(skillOverlay.current, game?.skill);
        lastState.current = { state: { ...state }, phase };
        // The aiming markers can move without redrawing an unchanged 3D set.
        if (lastScene.angle !== state.angle || lastScene.pawl !== state.pawl || lastScene.model !== state.pawlModel || lastScene.phase !== phase) {
          graphics.current?.update(state, phase);
          lastScene = { angle: state.angle, pawl: state.pawl, model: state.pawlModel, phase };
        }
        if (game) for (const node of Object.values(gauges.current)) if (node) {
          node.style.setProperty("--power", `${Math.max(0, Math.min(1, game.power)) * 100}%`);
          node.dataset.ready = String(game.power >= game.minimumPower);
          const output = node.querySelector("[data-power-value]"), value = `${Math.round(game.power * 100)} %`;
          if (output && output.textContent !== value) output.textContent = value;
        }
      },
    });
    controller.current = instance;
    instance.setMuted(initiallyMuted);
    instance.initialize();
    const cancel = () => { instance.cancelGesture(); pointers.current = { wheel: null }; };
    const visibility = () => {
      performance.monitor.resetSamples();
      if (document.hidden) { cancel(); instance.pause(); } else { instance.resume(); graphics.current?.draw(); }
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    if (document.hidden) instance.pause();
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      instance.dispose(); controller.current = null;
    };
  }), []);
  React.useEffect(() => { controller.current?.setLaunchOptions({ gestureMode }); }, [gestureMode]);
  React.useEffect(() => deferWheelSetup(() => {
    let disposed = false, renderer;
    graphicsReady.current = false; syncInputLock(); setRenderError(null);
    setStageStatus({ phase: "loading", message: flat ? "Préparation de la roue 2D…" : "Installation du plateau…" });
    performance.monitor.resetSamples();
    const fail = message => {
      if (disposed) return;
      if (latest.current.diagnostic) {
        setRenderError(message || "Le rendu 3D a été interrompu.");
        latest.current.diagnostic.onError?.(message || "Le rendu 3D a été interrompu.");
      } else performance.monitor.fail();
    };
    const frame = (time, cost, active) => {
      performance.monitor.frame(time, cost, active, !["dragging", "aiming"].includes(lastState.current?.phase));
      latest.current.diagnostic?.frame?.(time, cost, active, { phase: lastState.current?.phase, sequence: cameraSequence.current });
    };
    const status = value => {
      if (disposed) return;
      if (value.phase === "error" && !flat) { fail(value.message); return; }
      graphicsReady.current = value.phase === "ready";
      if (graphicsReady.current) latest.current.diagnostic?.ready?.();
      syncInputLock(); setStageStatus(value);
    };
    async function start() {
      try {
        const moduleStart = globalThis.performance.now();
        const module = flat ? await import("./createFlatWheelScene.js") : await import("./wheelSceneSession.js");
        if (disposed) return;
        latest.current.diagnostic?.timing?.({ module: globalThis.performance.now() - moduleStart });
        const projection = currentProjection.current;
        const options = {
            profile: latest.current.profile,
            contestants: latest.current.contestants,
            exchangeEnabled: latest.current.exchangeEnabled,
            retain: !latest.current.diagnostic,
            onBenchmark: (intervals, costs, profile) => performance.monitor.benchmark(intervals, costs, profile),
            onTimings: value => { if (!disposed) { performance.monitor.timings(value); latest.current.diagnostic?.timing?.(value); } },
            onStartupSlow: value => !disposed && performance.monitor.startupSlow(value),
            onFrame: frame,
          };
        if (flat) {
          canvas.current = document.createElement("canvas");
          canvas.current.className = "perspective-workshop__canvas";
          canvas.current.style.cssText = "display:block;width:100%;height:100%";
          canvas.current.setAttribute("aria-hidden", "true");
          canvasHost.current.appendChild(canvas.current);
          renderer = module.createFlatWheelScene(canvas.current, projection, status, latest.current.exchangeEnabled, { onFrame: frame });
        } else {
          renderer = await module.acquireWheelScene(canvasHost.current, projection, fail, status, options, () => disposed);
          if (disposed) { renderer?.dispose(); return; }
          canvas.current = renderer.canvas;
        }
        graphics.current = renderer;
        renderer.setProjection(projection, latest.current.reflections); renderer.setActorShade(latest.current.actorShade);
        renderer.setExchangeProgress(exchangeProgress.current); renderer.setBanks?.(latest.current.banks);
        if (lastState.current) renderer.update(lastState.current.state, lastState.current.phase);
        if (cameraSequence.current) renderer.setCameraSequence(cameraSequence.current);
        renderer.start?.();
      } catch (error) {
        if (disposed) return;
        renderer?.dispose(); canvas.current?.remove(); canvas.current = null; graphics.current = null;
        console.error("Wheel display initialization failed", error);
        if (!flat || latest.current.diagnostic) fail("La roue n’a pas pu être affichée.");
        else setRenderError("La roue n’a pas pu être affichée. Rechargez l’atelier pour réessayer.");
      }
    }
    void start();
    return () => {
      disposed = true; graphicsReady.current = false;
      // Choosing the lightweight view must also release the retained GPU memory.
      renderer?.dispose({ discard: latest.current.mode === "flat" });
      canvas.current?.remove(); canvas.current = null;
      if (graphics.current === renderer) graphics.current = null;
    };
  }), [mode, contestants, exchangeEnabled]);
  React.useEffect(() => { graphics.current?.setBanks?.(banks); }, [banks]);
  React.useEffect(() => { if (!flat) graphics.current?.setQuality(performance.report.profile); }, [performance.report.profile]);
  React.useEffect(() => {
    const projection = currentProjection.current;
    updateProjection(projection, size.width, size.height);
    graphics.current?.setProjection(projection, reflections);
  }, [size.width, size.height, reflections]);
  React.useEffect(() => { graphics.current?.setActorShade(actorShade); }, [actorShade]);
  const setCamera = React.useCallback((settings, sequence) => {
    const projection = currentProjection.current;
    updateProjection(projection, projection.width, projection.height, settings);
    graphics.current?.setProjection(projection);
    if (sequence) { cameraSequence.current = sequence; graphics.current?.setCameraSequence(sequence); }
    if (latest.current.exchangeEnabled && sequence?.sequence === "intro") {
      if (sequence.time < 5) { arrival.current?.reset(); syncInputLock(); }
      else arrival.current?.start();
    }
  }, []);
  const setInputLocked = React.useCallback(value => {
    inputLock.current = value; syncInputLock();
  }, [syncInputLock]);

  function point(event) {
    const rect = scene.current.getBoundingClientRect();
    if (latest.current.mode === "flat") return flatWheelPoint(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    const local = unprojectPoint(event.clientX - rect.left, event.clientY - rect.top, currentProjection.current);
    if (!local) return null;
    const x = local.x - WHEEL_GEOMETRY.centerX, y = local.y - WHEEL_GEOMETRY.centerY;
    return { angle: Math.atan2(y, x), radius: Math.hypot(x, y) / 640 };
  }
  function cancel(event) {
    const active = pointers.current;
    if (event.pointerId !== undefined && event.pointerId !== active.wheel) return;
    controller.current?.cancelGesture();
    pointers.current = { wheel: null };
  }
  function releaseCapture(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function gesturePoint(event) {
    const rect = scene.current.getBoundingClientRect(), unit = Math.max(1, Math.min(rect.width, rect.height));
    return { x: (event.clientX - rect.left) / unit, y: (event.clientY - rect.top) / unit,
      width: rect.width / unit, height: rect.height / unit };
  }
  function drag(event) {
    const active = pointers.current;
    // A pointerup commonly repeats the last position. It is not a new, slow
    // segment of the gesture, and must not reduce the power at release.
    if (event.clientX === active.position.x && event.clientY === active.position.y) return;
    const local = point(event) || (latest.current.gestureMode !== "power" ? active.local : null);
    if (!local) return;
    const position = { x: event.clientX, y: event.clientY };
    active.travel += latest.current.mode === "flat"
      ? flatWheelTravel(active.position, position, local, currentProjection.current.width)
      : screenGestureTravel(active.position, position, local, currentProjection.current);
    active.position = position;
    const angle = latest.current.gestureMode === "power" ? local.angle : active.local.angle + active.travel * Math.PI * 2;
    controller.current?.drag(angle, event.timeStamp, active.travel, { deferRender: true, gesturePoint: gesturePoint(event) });
  }
  return { scene, canvas, canvasHost, gauges, skillOverlay, view, muted, renderError, stageStatus, pawlMode, launchBank, actorShade, setActorShade, setCamera, spinProgress, inputLocked, setInputLocked, audioEvents, performance, flat,
    clickLaunch: time => controller.current?.clickLaunch(time),
    cancelLaunch: () => controller.current?.cancelGesture(),
    setLaunchOptions: value => controller.current?.setLaunchOptions(value),
    selectPawlMode(id) {
      const model = PAWL_MODELS[id];
      if (model && controller.current?.setPawlModel(model)) setPawlMode(id);
    },
    reset: () => controller.current?.reset(),
    toggleSound() {
      controller.current?.setMuted(!muted);
      if (muted) controller.current?.unlockAudio();
      setMuted(!muted);
    },
    wheelEvents: {
      onPointerDown(event) {
        if (!event.isPrimary || event.button !== 0) return;
        if (latest.current.onChoose) {
          if (!canvas.current || !graphicsReady.current) return;
          const rect = canvas.current.getBoundingClientRect();
          const id = graphics.current?.pickContestant?.((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
          if (id) { event.preventDefault(); latest.current.onChoose(id); }
          return;
        }
        const local = point(event);
        if (!local || local.radius < 0.16 || local.radius > 0.46 || !controller.current?.beginDrag(local.angle, event.timeStamp, gesturePoint(event))) return;
        event.preventDefault(); pointers.current = { wheel: event.pointerId, position: { x: event.clientX, y: event.clientY }, travel: 0, local };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event) {
        if (event.pointerId !== pointers.current.wheel) return;
        const samples = event.nativeEvent.getCoalescedEvents?.();
        if (samples?.length) for (const sample of samples) drag(sample);
        else drag(event);
      },
      onPointerUp(event) {
        if (event.pointerId !== pointers.current.wheel) return;
        drag(event);
        controller.current?.endDrag(event.timeStamp); pointers.current.wheel = null; releaseCapture(event);
      },
      onPointerCancel: cancel, onLostPointerCapture: cancel,
    },
  };
}
