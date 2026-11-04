import React from "react";
import { CAMERA_SEQUENCES, CAMERA_TRACKS, keyframeTime, removeCameraKeyframe, setCameraKeyframe } from "./cameraTimeline.js";
import { createCameraTimelinePlayer } from "./createCameraTimelinePlayer.js";
import { createCameraSpinDirector } from "./createCameraSpinDirector.js";
import savedInProject from "./cameraTimeline.saved.json";
import { createCameraInputGate } from "./cameraInputGate.js";
import { createCameraAvailabilityGate } from "./cameraAvailabilityGate.js";
import { CAMERA_SEQUENCE_ENDPOINT, cameraSequenceBackups, loadCameraDraft, restoreCameraSequence, savedSequenceStates,
  sequenceSnapshot, storeCameraDraft } from "./cameraTimelinePersistence.js";
const localStore = () => { try { return window.localStorage; } catch { return null; } };

export function useCameraTimeline({ applyCamera, commitCamera, stageReady, spinProgress, setInputLocked, syncIntroAudio }) {
  const [initial] = React.useState(() => loadCameraDraft(savedInProject, localStore()));
  const [timeline, setTimeline] = React.useState(initial.timeline);
  const [transport, setTransport] = React.useState({ sequence: "intro", time: 0, playing: false });
  const [automatic, setAutomatic] = React.useState(true);
  const [saved, setSaved] = React.useState(true);
  const [speedThreshold, setSpeedThreshold] = React.useState(initial.speedThreshold);
  const [projectSaves, setProjectSaves] = React.useState(() => savedSequenceStates(savedInProject));
  const [projectReady, setProjectReady] = React.useState(!import.meta.env.DEV);
  const [projectLoadError, setProjectLoadError] = React.useState(null);
  const project = React.useRef(savedInProject);
  const editedSequences = React.useRef(initial.editedSequences || []);
  const markEdited = sequence => { if (!editedSequences.current.includes(sequence)) editedSequences.current.push(sequence); };
  const ready = stageReady && projectReady;
  const timelineRef = React.useRef(timeline), player = React.useRef(null), introStarted = React.useRef(false);
  const director = React.useRef(null), display = React.useRef({ values: {} });
  const callbacks = React.useRef({ applyCamera, commitCamera });
  const inputGate = React.useRef(null);
  const availability = React.useRef(null);
  if (!availability.current) availability.current = createCameraAvailabilityGate();
  if (!inputGate.current) inputGate.current = createCameraInputGate(setInputLocked);
  callbacks.current = { applyCamera, commitCamera, stageReady: ready, automatic, speedThreshold, syncIntroAudio };
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    let disposed = false;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000);
    async function loadShared() {
      try {
        const response = await fetch(CAMERA_SEQUENCE_ENDPOINT, { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error();
        const body = await response.json();
        if (!body.project || typeof body.project !== "object") throw new Error();
        if (disposed) return;
        project.current = body.project;
        const loaded = loadCameraDraft(body.project, localStore());
        editedSequences.current = loaded.editedSequences;
        timelineRef.current = loaded.timeline;
        setTimeline(loaded.timeline); setSpeedThreshold(loaded.speedThreshold);
        setProjectSaves(savedSequenceStates(body.project));
        player.current?.refresh();
      } catch {
        if (!disposed) setProjectLoadError("Sauvegarde partagée inaccessible : réglages locaux utilisés. Recharge l’atelier pour réessayer.");
      } finally {
        clearTimeout(timeout);
        if (!disposed) setProjectReady(true);
      }
    }
    void loadShared();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, []);
  React.useEffect(() => {
    if (!projectReady) return;
    try { storeCameraDraft(project.current, timeline, speedThreshold, localStore(), editedSequences.current); setSaved(true); }
    catch { setSaved(false); }
  }, [timeline, speedThreshold, projectReady]);
  React.useEffect(() => {
    const instance = createCameraTimelinePlayer({ readTimeline: () => timelineRef.current,
      onFrame(camera, state) {
        inputGate.current.update(state, callbacks.current);
        callbacks.current.applyCamera(camera, state);
        callbacks.current.syncIntroAudio?.(state);
        const nodes = display.current;
        nodes.root?.style.setProperty("--camera-playhead", `${state.time / CAMERA_SEQUENCES[state.sequence].duration * 100}%`);
        const update = (node, value) => { if (node && (state.playing || node !== document.activeElement)) node.value = value; };
        update(nodes.scrub, state.time); update(nodes.time, Math.round(state.time * 100) / 100);
        if (nodes.clock) nodes.clock.textContent = `${state.time.toFixed(2)} / ${CAMERA_SEQUENCES[state.sequence].duration.toFixed(2)} s`;
        for (const { key } of CAMERA_TRACKS) update(nodes.values[key], Math.round(camera[key] * 10) / 10);
      },
      onCommit: camera => callbacks.current.commitCamera(camera), onChange(state) {
        setTransport(state); director.current?.onTransportChange();
      },
    });
    player.current = instance; instance.seek("intro", 0);
    const spinDirector = createCameraSpinDirector({ player: instance, enabled: () => callbacks.current.automatic,
      readSpeedThreshold: () => callbacks.current.speedThreshold });
    director.current = spinDirector;
    spinProgress.current = progress => {
      display.current.speed = Math.abs(progress.velocity) / (Math.PI * 2);
      if (display.current.velocity) display.current.velocity.textContent = `${display.current.speed.toFixed(2)} tour/s`;
      spinDirector.update(progress);
    };
    const visibility = () => {
      availability.current.update(instance, !document.hidden && callbacks.current.stageReady);
      if (!document.hidden && callbacks.current.stageReady && callbacks.current.automatic && !introStarted.current) {
        introStarted.current = true; instance.play("intro", { from: 0 });
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility); spinProgress.current = null;
      callbacks.current.syncIntroAudio?.({ sequence: "intro", time: 0, playing: false });
      instance.dispose(); availability.current.reset(); player.current = null; director.current = null;
    };
  }, [spinProgress]);
  React.useEffect(() => {
    inputGate.current.update(player.current?.snapshot(), callbacks.current);
    availability.current.update(player.current, ready && !document.hidden);
    if (ready && automatic && !introStarted.current && !document.hidden) {
      introStarted.current = true; player.current?.play("intro", { from: 0 });
    }
  }, [ready, automatic]);
  function manual() { introStarted.current = true; director.current?.override(); }
  function change(edit) {
    const instance = player.current;
    if (!instance || !projectReady) return;
    manual();
    instance.pause();
    const state = instance.snapshot(), time = keyframeTime(state.sequence, state.time);
    markEdited(state.sequence);
    timelineRef.current = edit(timelineRef.current, state.sequence, time);
    setTimeline(timelineRef.current); instance.seek(state.sequence, time);
  }
  return { timeline, transport, automatic, saved, display, projectSaves, speedThreshold, projectReady, projectLoadError,
    sequenceBackups: sequence => cameraSequenceBackups(localStore(), sequence, timeline[sequence], speedThreshold),
    restoreDraftBackup(sequence, id) {
      if (!projectReady) return;
      const backup = cameraSequenceBackups(localStore(), sequence, timelineRef.current[sequence], speedThreshold).find(value => value.id === id);
      if (!backup) return;
      manual(); player.current?.pause();
      const restored = restoreCameraSequence({ timeline: timelineRef.current, speedThreshold }, backup.value, sequence);
      markEdited(sequence); timelineRef.current = restored.timeline; setTimeline(restored.timeline);
      setSpeedThreshold(restored.speedThreshold); player.current?.refresh();
    },
    setSpeedThreshold(value) { if (projectReady && Number.isFinite(value)) { markEdited("launch"); setSpeedThreshold(Math.max(0.05, Math.min(3, value))); } },
    isSequenceSaved: sequence => projectSaves[sequence]?.snapshot === sequenceSnapshot(sequence, timeline[sequence], speedThreshold),
    async saveSequence(sequence) {
      if (!CAMERA_SEQUENCES[sequence] || !projectReady) return;
      const tracks = timelineRef.current[sequence], snapshot = sequenceSnapshot(sequence, tracks, speedThreshold);
      setProjectSaves(previous => ({ ...previous, [sequence]: { ...previous[sequence], pending: true, error: null } }));
      try {
        const response = await fetch(CAMERA_SEQUENCE_ENDPOINT, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequence, tracks,
            ...(sequence === "launch" ? { speedThreshold } : {}) }),
        });
        if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Sauvegarde dans le projet disponible avec npm run dev.");
        const result = await response.json();
        if (!response.ok || result.saved !== sequence) throw new Error(result.error || "Sauvegarde impossible.");
        project.current = { ...project.current, [sequence]: tracks,
          ...(sequence === "launch" ? { launchSpeedThreshold: speedThreshold } : {}) };
        try { storeCameraDraft(project.current, timelineRef.current, callbacks.current.speedThreshold, localStore(), editedSequences.current); setSaved(true); }
        catch { setSaved(false); }
        setProjectSaves(previous => ({ ...previous, [sequence]: { snapshot, pending: false } }));
      } catch (error) {
        setProjectSaves(previous => ({ ...previous, [sequence]: { ...previous[sequence], pending: false, error: error.message } }));
      }
    },
    setAutomatic(value) {
      callbacks.current.automatic = value; setAutomatic(value);
      if (!value) player.current?.pause(); else director.current?.resume();
      inputGate.current.update(player.current?.snapshot(), callbacks.current);
    },
    select: sequence => { manual(); player.current?.seek(sequence, 0); },
    seek: time => { if (Number.isFinite(time)) { manual(); player.current?.seek(player.current.snapshot().sequence, time); } },
    togglePlay() { manual(); const instance = player.current; if (instance?.snapshot().playing) instance.pause(); else instance?.play(); },
    playAll: () => { manual(); player.current?.play("intro", { from: 0, together: true }); },
    restart: () => { manual(); player.current?.seek(player.current.snapshot().sequence, 0); },
    beginRound: () => {
      if (automatic) { inputGate.current.begin(); player.current?.play("intro", { from: 0 }); }
    },
    refresh: () => player.current?.refresh(),
    setValue: (key, value) => change((model, sequence, time) => setCameraKeyframe(model, sequence, key, time, value)),
    capture: camera => change((model, sequence, time) => CAMERA_TRACKS.reduce((next, { key }) => setCameraKeyframe(next, sequence, key, time, camera[key]), model)),
    remove: key => change((model, sequence, time) => removeCameraKeyframe(model, sequence, key, time)),
  };
}
