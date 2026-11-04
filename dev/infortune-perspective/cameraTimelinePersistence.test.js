import test from "node:test";
import assert from "node:assert/strict";
import { CAMERA_TIMELINE_STORAGE, createCameraTimeline, setCameraKeyframe } from "./cameraTimeline.js";
import { cameraSequenceBackups, loadCameraDraft, readCameraDraftBackup, restoreCameraSequence, storeCameraDraft } from "./cameraTimelinePersistence.js";

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function shared() {
  let timeline = setCameraKeyframe(createCameraTimeline(), "launch", "framing", 3, 150);
  timeline = setCameraKeyframe(timeline, "results", "elevation", 3, 20);
  timeline = setCameraKeyframe(timeline, "results", "perspective", 3, 48);
  return { ...timeline, launchSpeedThreshold: 1.05 };
}

test("a phone's legacy automatic save cannot mask the shared launch or its speed threshold", () => {
  const local = storage(), old = createCameraTimeline(), project = shared();
  local.setItem(CAMERA_TIMELINE_STORAGE, JSON.stringify(old));
  local.setItem("gobble.infortune.camera-launch-speed.v1", "0.5");
  const loaded = loadCameraDraft(project, local);
  assert.deepEqual(loaded.timeline.launch, project.launch);
  assert.equal(loaded.speedThreshold, 1.05);
  assert.deepEqual(JSON.parse(local.getItem(CAMERA_TIMELINE_STORAGE)), old);
  assert.deepEqual(readCameraDraftBackup(local), { timeline: old, speedThreshold: 0.5 });
});

test("unsaved local edits survive reopening against the same shared version", () => {
  const local = storage(), project = shared();
  const { timeline } = loadCameraDraft(project, local);
  const draft = setCameraKeyframe(timeline, "launch", "elevation", 2, 37);
  storeCameraDraft(project, draft, 0.75, local, ["launch"]);
  assert.deepEqual(loadCameraDraft(project, local), { timeline: draft, speedThreshold: 0.75, editedSequences: ["launch"] });
});

test("a new shared launch replaces stale phone data, preserves other drafts and keeps a recovery copy", () => {
  const local = storage(), project = shared();
  let draft = loadCameraDraft(project, local).timeline;
  draft = setCameraKeyframe(draft, "intro", "elevation", 1, 65);
  draft = setCameraKeyframe(draft, "launch", "focal", 3, 35);
  storeCameraDraft(project, draft, 0.75, local, ["intro", "launch"]);
  const updated = { ...setCameraKeyframe(project, "launch", "framing", 3, 175), launchSpeedThreshold: 1.2 };
  const loaded = loadCameraDraft(updated, local);
  assert.deepEqual(loaded.timeline.launch, updated.launch);
  assert.deepEqual(loaded.timeline.intro, draft.intro);
  assert.equal(loaded.speedThreshold, 1.2);
  assert.deepEqual(readCameraDraftBackup(local), { timeline: draft, speedThreshold: 0.75 });
  storeCameraDraft(updated, loaded.timeline, loaded.speedThreshold, local, loaded.editedSequences);
  assert.deepEqual(loadCameraDraft(updated, local), loaded);
});

test("explicitly saved changes become the shared base without losing edits made while saving", () => {
  const local = storage(), project = shared();
  const saved = setCameraKeyframe(project, "launch", "focal", 3, 40);
  const nextDraft = setCameraKeyframe(loadCameraDraft(saved, local).timeline, "launch", "elevation", 1, 28);
  storeCameraDraft(saved, nextDraft, 1.05, local, ["launch"]);
  assert.deepEqual(loadCameraDraft(saved, local).timeline, nextDraft);
});

test("an unedited or old unmarked return cache cannot override the shared return even with matching baselines", () => {
  for (const oldFormat of [false, true]) {
    const local = storage(), project = shared();
    const stale = { ...project, results: createCameraTimeline().results };
    storeCameraDraft(project, stale, 1.05, local);
    if (oldFormat) {
      const saved = JSON.parse(local.getItem("gobble.infortune.camera-drafts.v2"));
      delete saved.editedSequences;
      local.setItem("gobble.infortune.camera-drafts.v2", JSON.stringify(saved));
    }
    const loaded = loadCameraDraft(project, local);
    assert.deepEqual(loaded.timeline.results, project.results);
    assert.deepEqual(loaded.timeline.launch, project.launch);
    assert.deepEqual(loaded.editedSequences, []);
  }
});

test("recovering the previous local return restores only that sequence and survives saving and phone reload", () => {
  const desktop = storage(), phone = storage(), project = shared();
  const previous = setCameraKeyframe(project, "results", "framing", 3, 110);
  desktop.setItem(CAMERA_TIMELINE_STORAGE, JSON.stringify(previous));
  desktop.setItem("gobble.infortune.camera-launch-speed.v1", "0.5");
  const current = loadCameraDraft(project, desktop);
  const backups = cameraSequenceBackups(desktop, "results", current.timeline.results, current.speedThreshold);
  assert.equal(backups.length, 1, "Identical recovery copies are shown once");
  assert.equal(backups[0].id, "legacy");
  const restored = restoreCameraSequence(current, backups[0].value, "results");
  assert.deepEqual(restored.timeline.results, previous.results);
  assert.equal(restored.timeline.intro, current.timeline.intro);
  assert.equal(restored.timeline.launch, current.timeline.launch);
  assert.equal(restored.speedThreshold, 1.05);
  storeCameraDraft(project, restored.timeline, restored.speedThreshold, desktop, ["results"]);
  assert.deepEqual(loadCameraDraft(project, desktop).timeline.results, previous.results);
  storeCameraDraft(project, current.timeline, 1.05, phone);
  const newlySaved = { ...project, results: restored.timeline.results };
  assert.deepEqual(loadCameraDraft(newlySaved, phone).timeline.results, restored.timeline.results);
});

test("unedited caches cannot overwrite recovery, while a displaced actual edit is recoverable", () => {
  const local = storage(), project = shared();
  const previous = setCameraKeyframe(project, "results", "framing", 3, 110);
  local.setItem(CAMERA_TIMELINE_STORAGE, JSON.stringify(previous));
  loadCameraDraft(project, local);
  const recovery = readCameraDraftBackup(local);
  storeCameraDraft(project, createCameraTimeline(), 0.5, local);
  loadCameraDraft(project, local);
  assert.deepEqual(readCameraDraftBackup(local), recovery);
  const edited = setCameraKeyframe(project, "results", "framing", 3, 125);
  storeCameraDraft(project, edited, 1.05, local, ["results"]);
  const updated = setCameraKeyframe(project, "results", "framing", 3, 135);
  loadCameraDraft(updated, local);
  assert.deepEqual(readCameraDraftBackup(local).timeline.results, edited.results);
});
