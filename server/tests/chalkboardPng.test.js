import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { runChalkboardExportWorker } from "../chalkboard/chalkboardExports.js";
import { getElementBounds } from "../../src/features/chalkboard/chalkboardModel.js";

test("export worker produces a complete PNG with fonts, strokes and isolated masks without blocking the event loop", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gobble-png-"));
  let beats = 0;
  const timer = setInterval(() => beats++, 10);
  try {
    const text = { id: "text", type: "text", seed: 3, font: "chalk", color: "#ff0000", text: "LE GRAND TABLEAU", cx: 450, cy: 180, width: 760, fontSize: 68, scale: 1, angle: 0 };
    const stroke = { id: "stroke", type: "stroke", seed: 2, color: "#f7d154", size: 14, points: [{ x: 200, y: 400 }, { x: 800, y: 400 }] };
    const mask = { id: "erase", type: "erase", size: 100, points: [{ x: 480, y: 400 }, { x: 520, y: 400 }] };
    const snapshot = { weekId: "2026-09-07", interventions: [{ id: "text", bounds: getElementBounds(text), elements: [text] }, { id: "stroke", bounds: getElementBounds(stroke), elements: [stroke, mask] }] };
    const filename = path.join(directory, "tableau.png");
    const result = await runChalkboardExportWorker({ action: "render", snapshot, filename });
    assert.equal(result.width, 24000);
    assert.equal(result.height, 1000);
    const png = await readFile(filename);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    const image = await loadImage(png);
    assert.equal(image.width, 24000);
    const preview = createCanvas(1000, 600);
    const context = preview.getContext("2d");
    context.drawImage(image, 0, 0);
    const erased = context.getImageData(500, 400, 1, 1).data;
    const visible = context.getImageData(300, 400, 1, 1).data;
    assert.ok(visible[0] > erased[0] + 20, "unmasked yellow chalk must remain visible");
    const textPixels = context.getImageData(50, 110, 800, 140).data;
    let redPixels = 0;
    for (let index = 0; index < textPixels.length; index += 4) {
      if (textPixels[index] > 150 && textPixels[index + 1] < 70 && textPixels[index + 2] < 70) redPixels++;
    }
    assert.ok(redPixels > 500, "the exported text must retain its selected red chalk color");
    assert.ok(beats > 1, "the main thread must remain responsive while exporting");
  } finally {
    clearInterval(timer);
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-png-"));
    await rm(directory, { recursive: true, force: true });
  }
});
