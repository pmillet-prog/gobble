import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const destination = path.join(root, ".tmp/vocab-overlay/baseline");
const vocabFiles = (await fs.readdir(path.join(root, "src/components/vocab")))
  .filter(name => /\.(js|jsx|css)$/.test(name) && !name.endsWith(".test.js"))
  .map(name => `src/components/vocab/${name}`);
const files = [
  ...vocabFiles, "src/vocabRanks.js", "src/assets/assetKeys.js",
  "src/styles/gameRuntime.css", "src/index.css", "shared/gameLogic.js", "shared/finaleRules.js",
];
// Run once before editing. Refuse to destroy the evidence from a previous capture.
try {
  await fs.access(path.join(destination, "src/components/vocab/VocabProgressOverlay.jsx"));
  throw new Error(`Baseline already exists at ${destination}; preserve it or choose a fresh workspace.`);
} catch (error) { if (error.code !== "ENOENT") throw error; }
for (const file of files) {
  await fs.mkdir(path.dirname(path.join(destination, file)), { recursive: true });
  await fs.copyFile(path.join(root, file), path.join(destination, file));
}
console.log(destination);
