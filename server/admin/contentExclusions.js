import { readFileSync, mkdirSync, writeFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWord } from "../../shared/gameLogic.js";
import { randomUUID } from "node:crypto";

export const CONTENT_SCOPES = new Set(["ocid", "linguist", "humorist", "lepers"]);
const dataDir = process.env.GOBBLE_DATA_DIR || fileURLToPath(new URL("../data/", import.meta.url));

// Each compute worker reads the same durable file. No polling timer or database
// query per candidate; refresh once at the beginning of each selection.
export function createContentExclusions(filePath) {
  let entries = {}, stamp = null;
  function refresh() {
    try {
      const info = statSync(filePath);
      const nextStamp = `${info.mtimeMs}:${info.size}`;
      if (nextStamp === stamp) return;
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object") throw new Error("Invalid content exclusions");
      entries = parsed.entries;
      stamp = nextStamp;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      entries = {}; stamp = null;
    }
  }
  const has = (scope, word) => Boolean(entries[`${scope}:${normalizeWord(String(word || ""))}`]);
  function exclude(scope, rawWord, actor) {
    const word = normalizeWord(String(rawWord || ""));
    if (!CONTENT_SCOPES.has(scope) || !/^[a-z]{2,32}$/.test(word)) throw new Error("invalid_content");
    refresh();
    if (has(scope, word)) return entries[`${scope}:${word}`];
    const entry = { scope, word, actorUserId: Number(actor.id), actorName: actor.usernameDisplay || "", excludedAt: Date.now() };
    const next = { ...entries, [`${scope}:${word}`]: entry };
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(`${filePath}.tmp`, JSON.stringify({ version: 1, entries: next }), { mode: 0o600 });
    renameSync(`${filePath}.tmp`, filePath);
    entries = next;
    const info = statSync(filePath);
    stamp = `${info.mtimeMs}:${info.size}`;
    return entry;
  }
  return { refresh, has, exclude };
}

export const contentExclusions = createContentExclusions(path.join(dataDir, "content-exclusions.json"));

const references = new Map();
const referenceKeys = new Map();
export function registerContentReference(scope, word, key) {
  if (!word) return null;
  key = `${scope}:${key}:${word}`;
  const existing = referenceKeys.get(key);
  if (existing && references.has(existing)) return { scope, reference: existing };
  const reference = randomUUID();
  references.set(reference, { scope, word, key });
  referenceKeys.set(key, reference);
  if (references.size > 2000) {
    const oldest = references.keys().next().value;
    referenceKeys.delete(references.get(oldest).key);
    references.delete(oldest);
  }
  return { scope, reference };
}
export function resolveContentReference(reference) { return references.get(reference) || null; }
