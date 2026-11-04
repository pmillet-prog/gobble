import { CAMERA_SEQUENCES, CAMERA_TIMELINE_STORAGE, createCameraTimeline, normalizeCameraTimeline } from "./cameraTimeline.js";

const DRAFT_STORAGE = "gobble.infortune.camera-drafts.v2";
const BACKUP_STORAGE = "gobble.infortune.camera-draft-backup.v1";
const LEGACY_SPEED_STORAGE = "gobble.infortune.camera-launch-speed.v1";
export const CAMERA_SEQUENCE_ENDPOINT = "/__atelier/infortune/camera-sequence";
const speed = value => Number.isFinite(value) ? Math.max(0.05, Math.min(3, value)) : 0.5;
export const projectSpeed = project => speed(project.launchSpeedThreshold);
export const sequenceSnapshot = (sequence, tracks, speedThreshold) => JSON.stringify({ tracks,
  ...(sequence === "launch" ? { speedThreshold } : {}) });

function read(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}
function sharedTimeline(project) { return normalizeCameraTimeline({ ...createCameraTimeline(), ...project }); }
function baselines(project) {
  return Object.fromEntries(Object.entries(sharedTimeline(project)).map(([sequence, tracks]) =>
    [sequence, sequenceSnapshot(sequence, tracks, projectSpeed(project))]));
}

export function readCameraDraftBackup(storage, legacy = false) {
  const backup = legacy ? { timeline: read(storage, CAMERA_TIMELINE_STORAGE), speedThreshold: read(storage, LEGACY_SPEED_STORAGE) }
    : read(storage, BACKUP_STORAGE);
  return backup?.timeline ? { timeline: normalizeCameraTimeline(backup.timeline), speedThreshold: speed(backup.speedThreshold) } : null;
}

export function cameraSequenceBackups(storage, sequence, currentTracks, speedThreshold) {
  const seen = new Set([sequenceSnapshot(sequence, currentTracks, speedThreshold)]);
  return [
    { id: "legacy", label: "Sauvegarde locale précédente", value: readCameraDraftBackup(storage, true) },
    { id: "backup", label: "Brouillon conservé", value: readCameraDraftBackup(storage) },
  ].filter(backup => {
    if (!backup.value) return false;
    const snapshot = sequenceSnapshot(sequence, backup.value.timeline[sequence], backup.value.speedThreshold);
    if (seen.has(snapshot)) return false;
    seen.add(snapshot); return true;
  });
}

export function restoreCameraSequence(current, backup, sequence) {
  return { timeline: { ...current.timeline, [sequence]: backup.timeline[sequence] },
    speedThreshold: sequence === "launch" ? backup.speedThreshold : current.speedThreshold };
}

export function loadCameraDraft(project, storage) {
  const timeline = sharedTimeline(project), baseline = baselines(project);
  let speedThreshold = projectSpeed(project), displaced = false, displacedEdits = false;
  const editedSequences = [];
  const draft = read(storage, DRAFT_STORAGE);
  const legacy = draft ? null : read(storage, CAMERA_TIMELINE_STORAGE);
  const candidate = draft || (legacy && { timeline: legacy, speedThreshold: speed(read(storage, LEGACY_SPEED_STORAGE)) });
  if (candidate?.timeline) {
    const local = normalizeCameraTimeline(candidate.timeline);
    for (const sequence of Object.keys(CAMERA_SEQUENCES)) {
      // A local draft belongs to the shared version it was edited against.
      // Old auto-saved defaults on another device must never mask a newer save.
      // Auto-saving a screen is not proof that the user edited every sequence.
      // Only explicitly edited tracks may override the shared save. Older
      // unmarked caches are retained for recovery, never promoted to edits.
      const compatible = draft ? draft.editedSequences?.includes(sequence) && draft.baselines?.[sequence] === baseline[sequence] : !project[sequence];
      if (compatible) {
        timeline[sequence] = local[sequence];
        editedSequences.push(sequence);
        if (sequence === "launch") speedThreshold = speed(candidate.speedThreshold);
      } else if (sequenceSnapshot(sequence, local[sequence], speed(candidate.speedThreshold)) !== baseline[sequence]) {
        displaced = true;
        displacedEdits ||= Boolean(draft?.editedSequences?.includes(sequence));
      }
    }
    if (displaced) {
      // Preserve edits from before a shared update/migration for explicit recovery.
      try {
        if (displacedEdits || !readCameraDraftBackup(storage)) storage.setItem(BACKUP_STORAGE, JSON.stringify({ timeline: local, speedThreshold: speed(candidate.speedThreshold) }));
      } catch { /* Original draft is also left intact. */ }
    }
  }
  return { timeline, speedThreshold, editedSequences };
}

export function storeCameraDraft(project, timeline, speedThreshold, storage, editedSequences = []) {
  const baseline = baselines(project);
  const edited = editedSequences.filter(sequence => CAMERA_SEQUENCES[sequence]
    && sequenceSnapshot(sequence, timeline[sequence], speedThreshold) !== baseline[sequence]);
  storage.setItem(DRAFT_STORAGE, JSON.stringify({ timeline, speedThreshold, baselines: baseline, editedSequences: edited }));
}

export function savedSequenceStates(project) {
  const timeline = sharedTimeline(project);
  return Object.fromEntries(Object.keys(CAMERA_SEQUENCES).filter(sequence => project[sequence])
    .map(sequence => [sequence, { snapshot: sequenceSnapshot(sequence, timeline[sequence], projectSpeed(project)) }]));
}
