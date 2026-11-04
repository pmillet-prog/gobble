import { STAGE_CAMERA } from "./projection.js";

export const CAMERA_TRACKS = Object.freeze([
  { key: "elevation", label: "Hauteur", unit: "°", min: 10, max: 75 },
  { key: "perspective", label: "Perspective", unit: "%", min: 0, max: 100 },
  { key: "focal", label: "Focale", unit: "mm", min: 14, max: 85 },
  { key: "framing", label: "Cadrage", unit: "%", min: 30, max: 300 },
  { key: "offsetX", label: "Décalage X", unit: "%", min: -80, max: 80 },
  { key: "offsetY", label: "Décalage Y", unit: "%", min: -80, max: 80 },
  { key: "roll", label: "Inclinaison", unit: "°", min: -35, max: 35 },
]);
export const CAMERA_SEQUENCES = Object.freeze({ intro: { label: "Intro", duration: 5 },
  launch: { label: "Lancer", duration: 3 }, results: { label: "Retour plateau", duration: 3 } });
export const CAMERA_TIMELINE_STORAGE = "gobble.infortune.camera-timeline.v1";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const keyframeTime = (sequence, time) => Math.round(clamp(time, 0, CAMERA_SEQUENCES[sequence].duration) * 10) / 10;
export const cameraEase = t => t * t * (3 - 2 * t);

export function createCameraTimeline() {
  const intro = Object.fromEntries(CAMERA_TRACKS.map(({ key }) => [key, [{ time: 0, value: STAGE_CAMERA[key] }]]));
  intro.perspective = [{ time: 0, value: 0 }, { time: 5, value: STAGE_CAMERA.perspective }];
  return { intro, ...Object.fromEntries(["launch", "results"].map(sequence =>
    [sequence, Object.fromEntries(CAMERA_TRACKS.map(({ key }) => [key, []]))])) };
}

export function normalizeCameraTimeline(value) {
  if (!value?.intro || !value?.launch) return createCameraTimeline();
  return Object.fromEntries(Object.keys(CAMERA_SEQUENCES).map(sequence => [sequence,
    Object.fromEntries(CAMERA_TRACKS.map(({ key, min, max }) => {
      const points = new Map();
      for (const point of Array.isArray(value[sequence]?.[key]) ? value[sequence][key] : []) {
        if (Number.isFinite(point?.time) && Number.isFinite(point?.value)) {
          points.set(keyframeTime(sequence, point.time), clamp(point.value, min, max));
        }
      }
      return [key, [...points].map(([time, value]) => ({ time, value })).sort((a, b) => a.time - b.time)];
    })),
  ]));
}

function trackValue(points, time, initial) {
  let previous = { time: 0, value: initial };
  for (const point of points) {
    if (point.time <= time) { previous = point; continue; }
    const ratio = clamp((time - previous.time) / (point.time - previous.time), 0, 1);
    return previous.value + (point.value - previous.value) * cameraEase(ratio);
  }
  return previous.value;
}

export function cameraAt(timeline, sequence, time) {
  const initial = sequence === "results" ? cameraAt(timeline, "launch", 3)
    : sequence === "launch" ? cameraAt(timeline, "intro", 5) : STAGE_CAMERA;
  const position = clamp(time, 0, CAMERA_SEQUENCES[sequence].duration);
  const plateau = sequence === "results" ? cameraAt(timeline, "intro", 5) : null;
  return Object.fromEntries(CAMERA_TRACKS.map(({ key }) => {
    let points = timeline[sequence]?.[key] || [];
    // An unkeyed return ends at the plateau established by the intro. Moving
    // that framing later also updates the return, until its endpoint is keyed.
    if (plateau && !points.some(point => point.time === 3)) points = [...points, { time: 3, value: plateau[key] }];
    return [key, trackValue(points, position, initial[key])];
  }));
}

export function setCameraKeyframe(timeline, sequence, key, time, value) {
  const track = CAMERA_TRACKS.find(track => track.key === key);
  if (!track || !Number.isFinite(value)) return timeline;
  const position = keyframeTime(sequence, time);
  const points = timeline[sequence][key].filter(point => point.time !== position);
  points.push({ time: position, value: clamp(value, track.min, track.max) });
  points.sort((a, b) => a.time - b.time);
  return { ...timeline, [sequence]: { ...timeline[sequence], [key]: points } };
}

export function removeCameraKeyframe(timeline, sequence, key, time) {
  const position = keyframeTime(sequence, time);
  return { ...timeline, [sequence]: { ...timeline[sequence],
    [key]: timeline[sequence][key].filter(point => point.time !== position) } };
}
