import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, runAnalysis } from "../scripts/measure-word-grid-frequency.mjs";

test("real generator produces the same frequency table with one or two workers", { timeout: 180000 }, async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = path.join(root, ".tmp/word-grid-frequency-integration");
  await fs.mkdir(output, { recursive: true });
  const runRoot = await fs.mkdtemp(path.join(output, "run-"));
  const options = parseArgs([
    "--count", "3", "--modes", "normal,massive_boggle,finale",
    "--seed", "integration-frequency", "--workers", "1",
    "--output-dir", path.join(runRoot, "one-worker"),
  ]);
  const first = await runAnalysis(options);
  const second = await runAnalysis({ ...options, workers: 2, outputDir: path.join(runRoot, "two-workers") });
  assert.equal(first.status, "complete");
  assert.equal(second.status, "complete");
  assert.deepEqual(first.rows, second.rows);
  assert.deepEqual(first.modes, second.modes);
  for (const mode of first.modes) {
    assert.equal(mode.grids, 3);
    const rows = first.rows.filter((row) => row.mode === mode.mode);
    assert.equal(rows.reduce((sum, row) => sum + row.hits, 0), mode.totalWords);
    assert.ok(rows.every((row) => row.hits >= 1 && row.hits <= 3 && row.frequencyPercent <= 100));
  }
  const csv = await fs.readFile(path.join(options.outputDir, "frequencies.csv"), "utf8");
  assert.equal(csv.trim().split("\r\n").length, first.rows.length + 1);
  await assert.rejects(runAnalysis(options), /dossier de sortie doit être vide/);
  console.log(`Generated reports retained for review: ${runRoot}`);
});
