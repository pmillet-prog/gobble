#!/usr/bin/env node
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import {
  FREQUENCY_MODES,
  addPreparedGrid,
  buildFrequencyPayload,
  buildFrequencyRows,
  createFrequencyStats,
  renderFrequencyCsv,
  renderFrequencyHtml,
  summarizeFrequencyStats,
} from "./word-grid-frequency-core.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WORKER_URL = new URL("./word-grid-frequency-worker.mjs", import.meta.url);
const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export function parseArgs(argv) {
  const options = {
    count: 1000,
    modes: ["normal"],
    workers: Math.min(2, os.availableParallelism?.() || 1),
    seed: "gobble-word-frequency-v1",
    minLength: 2,
    maxLength: 32,
    timeoutMs: 120000,
    outputDir: path.join(ROOT, ".tmp", "word-grid-frequency", timestamp()),
    help: false,
  };
  const integerOptions = new Map([
    ["--count", "count"], ["--workers", "workers"], ["--min-length", "minLength"],
    ["--max-length", "maxLength"], ["--timeout-ms", "timeoutMs"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = () => {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`Valeur manquante : ${argument}`);
      return value;
    };
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (integerOptions.has(argument)) {
      const value = Number(readValue());
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Entier positif attendu : ${argument}`);
      options[integerOptions.get(argument)] = value;
    } else if (argument === "--modes") {
      const value = readValue();
      options.modes = value === "all" ? FREQUENCY_MODES.map(({ value: mode }) => mode) : [...new Set(value.split(",").map((mode) => mode.trim()))];
    } else if (argument === "--seed") options.seed = readValue();
    else if (argument === "--output-dir") options.outputDir = path.resolve(readValue());
    else throw new Error(`Option inconnue : ${argument}`);
  }
  if (options.workers > 8) throw new Error("--workers doit être compris entre 1 et 8");
  if (options.minLength > options.maxLength) throw new Error("La longueur minimale dépasse la longueur maximale");
  for (const mode of options.modes) {
    if (!FREQUENCY_MODES.some((entry) => entry.value === mode)) throw new Error(`Type de manche inconnu : ${mode}`);
  }
  return options;
}

function printHelp() {
  console.log(`Mesure hors ligne de la présence des mots dans les grilles 4×4.

Usage : npm run words:frequency -- [options]
  --count <n>          Grilles par type de manche (défaut : 1000)
  --modes <liste|all>  Types séparés par des virgules (défaut : normal)
  --workers <n>        Workers locaux, de 1 à 8 (défaut : 2 maximum)
  --seed <texte>       Graine reproductible (défaut : gobble-word-frequency-v1)
  --min-length <n>     Filtre du tableau uniquement (défaut : 2)
  --max-length <n>     Filtre du tableau uniquement (défaut : 32)
  --timeout-ms <n>     Délai maximal d'une préparation (défaut : 120000)
  --output-dir <path> Dossier nouveau ou vide (défaut : .tmp/word-grid-frequency/<date>)
  --help              Affiche cette aide

Types : ${FREQUENCY_MODES.map(({ value }) => value).join(", ")}
Sorties : index.html (recherche/tri), frequencies.csv (Excel), report.json.
Le nombre de grilles s'applique à CHAQUE type. Aucun mélange pondéré des types.
Les grilles de repli du générateur sont conservées. OCID n'est pas inclus.
Le script ne démarre aucun serveur et ne modifie aucune base de jeu.`);
}

class OfflineWorker {
  constructor(timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.pending = null;
    this.failed = null;
    this.closing = false;
    this.worker = new Worker(WORKER_URL, { type: "module" });
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.startTimer = setTimeout(() => this.fail(new Error("Démarrage du worker trop long")), timeoutMs);
    this.worker.on("message", (message) => {
      if (message?.ready) {
        clearTimeout(this.startTimer);
        this.resolveReady();
        return;
      }
      if (!this.pending || message?.id !== this.pending.id) return;
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "Erreur de génération"));
    });
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", (code) => {
      if (!this.closing) this.fail(new Error(`Worker arrêté avant la fin (code ${code})`));
    });
  }

  fail(error) {
    this.failed = error;
    clearTimeout(this.startTimer);
    this.rejectReady(error);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
  }

  async prepare(payload, seed) {
    await this.ready;
    if (this.failed) throw this.failed;
    if (this.pending) throw new Error("Un seul travail simultané par worker est autorisé");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Préparation trop longue : ${seed}`)), this.timeoutMs);
      this.pending = { id: seed, resolve, reject, timer };
      try {
        this.worker.postMessage({ id: seed, type: "prepareNextGrid", payload, offlineSeed: seed });
      } catch (error) {
        this.fail(error);
      }
    });
  }

  async close() {
    this.closing = true;
    clearTimeout(this.startTimer);
    this.fail(new Error("Analyse arrêtée"));
    await this.worker.terminate();
  }
}

async function fingerprint(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { path: path.relative(ROOT, filePath).replaceAll("\\", "/"), bytes, sha256: hash.digest("hex") };
}

async function collectInputs() {
  // Fingerprint the entire generation dependency set and the read-only rarity DB.
  // No account/player database, network request or backend entry point is used.
  const sources = [
    "public/dico.txt", "shared/gameLogic.js", "shared/finaleRules.js",
    "server/compute/worker.js", "server/compute/anchoredGeneration.js",
    "server/training/trainingPoolConfig.js", "server/stats/wordRarityService.js",
    "server/scripts/word-grid-frequency-core.mjs", "server/scripts/word-grid-frequency-worker.mjs",
    "server/scripts/measure-word-grid-frequency.mjs",
  ];
  const inputs = [];
  for (const source of sources) inputs.push(await fingerprint(path.join(ROOT, source)));
  const rarityPath = process.env.GOBBLE_WORD_RARITY_DB
    ? path.resolve(process.env.GOBBLE_WORD_RARITY_DB)
    : path.join(ROOT, "data/word-rarity.sqlite");
  inputs.push(await fingerprint(rarityPath));
  if (!inputs[0].bytes) throw new Error("Dictionnaire local vide");
  return inputs;
}

export async function runAnalysis(options) {
  const inputs = await collectInputs();
  await fs.mkdir(options.outputDir, { recursive: true });
  if ((await fs.readdir(options.outputDir)).length) throw new Error("Le dossier de sortie doit être vide pour préserver les analyses précédentes");
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const stats = options.modes.map(createFrequencyStats);
  const workers = [];
  let stopped = false;
  let failure = null;
  let activeMode = options.modes[0];
  const save = async (status) => {
    const report = {
      schemaVersion: 1,
      status,
      error: failure?.message || null,
      startedAt,
      updatedAt: new Date().toISOString(),
      elapsedSeconds: (performance.now() - start) / 1000,
      nodeVersion: process.version,
      options,
      inputs,
      method: "Presence per returned production grid; one count per normalized word and grid; independent seeded samples per mode; Wilson 95% intervals; no player-found counts; no cross-mode weighting; theme challenge disabled; OCID excluded.",
      modes: stats.map((entry) => ({
        ...summarizeFrequencyStats(entry),
        label: FREQUENCY_MODES.find(({ value }) => value === entry.mode).label,
        payload: buildFrequencyPayload(entry.mode, 0),
      })),
      rows: stats.flatMap((entry) => buildFrequencyRows(entry, options)),
    };
    await fs.writeFile(path.join(options.outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    await fs.writeFile(path.join(options.outputDir, "frequencies.csv"), renderFrequencyCsv(report.rows));
    await fs.writeFile(path.join(options.outputDir, "index.html"), renderFrequencyHtml(report));
    return report;
  };
  const stop = () => {
    stopped = true;
    failure ||= new Error("Interruption demandée ; échantillon partiel");
    for (const worker of workers) worker.fail(failure);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const progress = setInterval(() => {
    const current = stats.find((entry) => entry.mode === activeMode);
    console.log(`[${activeMode}] ${current.grids}/${options.count} grilles · ${Math.round((performance.now() - start) / 1000)} s`);
  }, 10000);
  try {
    for (let index = 0; index < Math.min(options.workers, options.count); index += 1) workers.push(new OfflineWorker(options.timeoutMs));
    await Promise.all(workers.map((worker) => worker.ready));
    for (const current of stats) {
      if (stopped) break;
      activeMode = current.mode;
      let nextSample = 0;
      const jobs = workers.map(async (worker) => {
        while (!stopped && nextSample < options.count) {
          const sampleIndex = nextSample++;
          let accepted = false;
          for (let attempt = 0; attempt < 3 && !stopped; attempt += 1) {
            const seed = `${options.seed}:${current.mode}:${sampleIndex}:${attempt}`;
            const prepared = await worker.prepare(buildFrequencyPayload(current.mode, sampleIndex), seed);
            if (stopped) return;
            if (addPreparedGrid(current, prepared)) { accepted = true; break; }
          }
          if (!accepted && !stopped) throw new Error(`Trois préparations vides : ${current.mode}, échantillon ${sampleIndex}`);
        }
      });
      // Await all clients before saving so the last in-flight response cannot
      // change counts while a report is being serialized.
      const settled = await Promise.allSettled(jobs.map((job) => job.catch((error) => {
        stopped = true;
        failure ||= error;
        for (const worker of workers) worker.fail(failure);
        throw error;
      })));
      if (settled.some((result) => result.status === "rejected")) break;
      console.log(`[${current.mode}] ${current.grids} grilles, ${current.counts.size} mots distincts, ${current.qualityFallbacks} replis`);
      await save("partial");
    }
  } catch (error) {
    failure ||= error;
  } finally {
    clearInterval(progress);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await Promise.allSettled(workers.map((worker) => worker.close()));
  }
  const complete = !failure && stats.every((entry) => entry.grids === options.count);
  const report = await save(complete ? "complete" : "partial");
  console.log(`Tableau : ${path.join(options.outputDir, "index.html")}`);
  if (!complete) throw failure || new Error("Analyse incomplète");
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) printHelp();
    else await runAnalysis(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
