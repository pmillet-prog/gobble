import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("live session satellites own login, resume and reconnect resources", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const entrySource = read(
    "../../src/features/session/createLiveEntryFeature.js"
  );
  const resumeSource = read(
    "../../src/features/session/createLiveResumeFeature.js"
  );

  assert.doesNotMatch(applicationSource, /function handleManualRefresh/);
  assert.doesNotMatch(applicationSource, /function requestSessionResumeSnapshot/);
  assert.doesNotMatch(applicationSource, /function resumeLoginFromSession/);
  assert.doesNotMatch(applicationSource, /function attemptSilentReconnect/);
  assert.match(applicationSource, /useLiveEntryFeature\(/);
  assert.match(applicationSource, /useLiveResumeFeature\(/);
  assert.match(
    applicationSource,
    /resumeLoginFromSessionRef\.current = liveResumeFeature\.resume/
  );
  assert.match(entrySource, /function login\(\)/);
  assert.match(entrySource, /setTimeoutFn\(/);
  assert.match(resumeSource, /function probeResume\(/);
  assert.match(resumeSource, /function resume\(/);
  assert.match(resumeSource, /function reconnect\(/);
  assert.match(resumeSource, /function cancelAll\(/);
});
