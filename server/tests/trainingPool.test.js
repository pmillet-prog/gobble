import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  TRAINING_GRID_SIZE,
  TRAINING_POOL_MODES,
  buildTrainingPoolRoundPlan,
  createTrainingRoomConfig,
  isTrainingPoolMode,
} from "../training/trainingPoolConfig.js";
import {
  createTrainingPoolEntry,
  getCanonicalTrainingGridSignature,
  validatePreparedTrainingGrid,
  validateTrainingPoolCatalog,
} from "../training/trainingPoolFormat.js";
import {
  TrainingPoolStore,
  resolveTrainingPoolDir,
} from "../training/trainingPoolStore.js";

function makeGrid() {
  return "ABCDEFGHIJKLMNOP".split("").map((letter) => ({
    letter,
    bonus: null,
  }));
}

function rotateClockwise(grid) {
  const rotated = Array.from({ length: grid.length }, () => null);
  for (let index = 0; index < grid.length; index += 1) {
    const row = Math.floor(index / TRAINING_GRID_SIZE);
    const column = index % TRAINING_GRID_SIZE;
    rotated[column * TRAINING_GRID_SIZE + (TRAINING_GRID_SIZE - 1 - row)] = grid[index];
  }
  return rotated;
}

function makePrepared(mode = "normal") {
  return {
    grid: makeGrid(),
    plan: buildTrainingPoolRoundPlan(mode, createTrainingRoomConfig()),
    quality: {
      ok: true,
      words: 200,
      maxLen: 9,
      maxPts: 120,
      totalPts: 4000,
      possibleScore: 4000,
    },
    targetWord: null,
    targetLength: null,
    targetPath: null,
    solutions: [{ word: "TEST", pts: 10, path: [0, 1, 2, 3] }],
  };
}

test("déclare exactement les dix catégories 4×4 sans OCID", () => {
  assert.equal(TRAINING_GRID_SIZE, 4);
  assert.equal(TRAINING_POOL_MODES.length, 10);
  assert.equal(isTrainingPoolMode("ocid"), false);
  assert.equal(new Set(TRAINING_POOL_MODES.map((entry) => entry.value)).size, 10);
});

test("localise les pools versionnés hors du répertoire runtime", () => {
  const projectDir = path.join(os.tmpdir(), "gobble-project");
  const serverDir = path.join(projectDir, "server");
  assert.equal(
    resolveTrainingPoolDir({
      serverDir,
      env: { GOBBLE_DATA_DIR: path.join(os.tmpdir(), "gobble-runtime") },
    }),
    path.join(projectDir, "data", "training-pools")
  );
  assert.equal(
    resolveTrainingPoolDir({
      serverDir,
      env: { GOBBLE_TRAINING_POOL_DIR: path.join(os.tmpdir(), "custom-training-pools") },
    }),
    path.join(os.tmpdir(), "custom-training-pools")
  );
});

test("construit les règles renforcées attendues pour chaque catégorie", () => {
  const roomConfig = createTrainingRoomConfig();
  for (const { value } of TRAINING_POOL_MODES) {
    const plan = buildTrainingPoolRoundPlan(value, roomConfig);
    assert.equal(plan.type, value);
    assert.equal(plan.gridSize, 4);
  }
  assert.equal(buildTrainingPoolRoundPlan("finale", roomConfig).tileBonusMultiplier, 2);
  assert.equal(buildTrainingPoolRoundPlan("speed", roomConfig).fixedWordScore, 11);
  assert.equal(buildTrainingPoolRoundPlan("massive_boggle", roomConfig).minWordLength, 3);
  assert.equal(buildTrainingPoolRoundPlan("fake_twins", roomConfig).minWordLength, 2);
});

test("déduplique rotations et symétries d'une même grille", () => {
  const grid = makeGrid();
  const rotated = rotateClockwise(grid);
  assert.equal(
    getCanonicalTrainingGridSignature(grid),
    getCanonicalTrainingGridSignature(rotated)
  );
  rotated[0] = { ...rotated[0], letter: "Z" };
  assert.notEqual(
    getCanonicalTrainingGridSignature(grid),
    getCanonicalTrainingGridSignature(rotated)
  );
});

test("refuse une grille sous le seuil de qualité", () => {
  const prepared = makePrepared();
  prepared.quality.ok = false;
  assert.deepEqual(validatePreparedTrainingGrid(prepared, "normal"), {
    ok: false,
    error: "quality_rejected",
  });
});

test("produit une entrée compacte et valide", () => {
  const prepared = makePrepared();
  const { entry, error } = createTrainingPoolEntry(prepared, "normal");
  assert.equal(error, null);
  assert.match(entry.id, /^tr-normal-[a-f0-9]{16}$/);
  const catalog = {
    mode: "normal",
    gridSize: 4,
    entries: [entry],
  };
  assert.equal(validateTrainingPoolCatalog(catalog), true);
  catalog.entries.push({ ...entry, id: `${entry.id}-duplicate`, grid: rotateClockwise(entry.grid) });
  assert.equal(validateTrainingPoolCatalog(catalog), false);
});

test("lit une seule grille grâce aux offsets de l'index", async (context) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "gobble-training-pool-"));
  context.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const entries = [
    { id: "tr-normal-a", grid: makeGrid() },
    { id: "tr-normal-b", grid: makeGrid().reverse() },
  ];
  const chunks = entries.map((entry) => Buffer.from(`${JSON.stringify(entry)}\n`, "utf8"));
  const records = [];
  let offset = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    records.push({ id: entries[index].id, offset, length: chunks[index].length });
    offset += chunks[index].length;
  }
  await fs.writeFile(path.join(rootDir, "normal.jsonl"), Buffer.concat(chunks));
  await fs.writeFile(
    path.join(rootDir, "normal.index.json"),
    JSON.stringify({
      schemaVersion: 1,
      mode: "normal",
      gridSize: 4,
      count: entries.length,
      dataFile: "normal.jsonl",
      records,
    })
  );

  const store = new TrainingPoolStore(rootDir);
  const second = await store.getRandomEntry("normal", { random: () => 0.99 });
  assert.equal(second.id, "tr-normal-b");
  const onlyAvailable = await store.getRandomEntry("normal", {
    excludeIds: ["tr-normal-b"],
    random: () => 0.99,
  });
  assert.equal(onlyAvailable.id, "tr-normal-a");
});
