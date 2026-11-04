import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { cameraTimelineStoragePlugin } from "./cameraTimelineStoragePlugin.mjs";
import { createCameraTimeline } from "./cameraTimeline.js";

test("explicit sequence saves merge independently, preserving edits and the launch threshold", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gobble-camera-save-"));
  const file = join(directory, "camera.json");
  let handler;
  const plugin = cameraTimelineStoragePlugin({ file });
  plugin.configureServer({ middlewares: { use(path, callback) { handler = callback; } } });
  async function save(sequence, tracks, { origin = "http://localhost:8777", speedThreshold = 0.65 } = {}) {
    const request = Readable.from([JSON.stringify({ sequence, tracks, speedThreshold })]);
    request.method = "POST";
    request.headers = { host: "localhost:8777", origin, "content-type": "application/json" };
    let status, body;
    await handler(request, { writeHead(value) { status = value; }, end(value) { body = JSON.parse(value); } });
    return { status, body };
  }
  try {
    const timeline = createCameraTimeline();
    timeline.intro.focal = [{ time: 0, value: 85 }, { time: 5, value: 20.4 }];
    timeline.launch.focal = [{ time: 3, value: 45 }];
    timeline.results.focal = [{ time: 3, value: 15 }];
    const replies = await Promise.all([save("intro", timeline.intro), save("launch", timeline.launch), save("results", timeline.results)]);
    assert.ok(replies.every(reply => reply.status === 200));
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(saved, { intro: timeline.intro, launch: timeline.launch, results: timeline.results, launchSpeedThreshold: 0.65 });
    async function readFromPhone() {
      const request = { method: "GET", headers: { host: "192.168.1.10:3000" } };
      let status, headers, body;
      await handler(request, { writeHead(value, metadata) { status = value; headers = metadata; }, end(value) { body = JSON.parse(value); } });
      assert.equal(status, 200);
      assert.equal(headers["Cache-Control"], "no-store");
      return body.project;
    }
    assert.deepEqual(await readFromPhone(), saved);
    timeline.launch.focal = [{ time: 3, value: 58 }];
    await save("launch", timeline.launch, { speedThreshold: 1.05 });
    assert.deepEqual((await readFromPhone()).results, timeline.results, "Saving the launch preserves the shared return");
    timeline.results.focal = [{ time: 3, value: 22 }];
    await save("results", timeline.results);
    const latest = await readFromPhone();
    assert.deepEqual(latest.launch, timeline.launch);
    assert.deepEqual(latest.results, timeline.results);
    assert.deepEqual(latest.intro, timeline.intro);
    assert.equal(latest.launchSpeedThreshold, 1.05);
    assert.equal((await save("results", timeline.results, { origin: "https://unrelated.example" })).status, 403);
    assert.equal((await save("../outside", timeline.intro)).status, 400);
    assert.equal((await save("launch", timeline.launch, { speedThreshold: -1 })).status, 400);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), latest);
    assert.deepEqual(plugin.handleHotUpdate({ file }), []);
  } finally { await unlink(file).catch(() => {}); await rmdir(directory); }
});
