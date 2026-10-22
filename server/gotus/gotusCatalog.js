import { readFile } from "node:fs/promises";
import { normalizeGotusWord } from "../../shared/gotusRules.js";

const BANK_URL = new URL("../../public/gotus/words.json", import.meta.url);
let pending = null;

export function createGotusCatalog(bank) {
  if (bank?.wordLength !== 6 || !Array.isArray(bank.accepted) || !Array.isArray(bank.targets)) {
    throw new Error("invalid_gotus_catalog");
  }
  const accepted = new Set(bank.accepted.map(normalizeGotusWord));
  const targets = [...new Set(bank.targets.map(normalizeGotusWord))];
  if (!targets.length || [...accepted, ...targets].some(word => !/^[A-Z]{6}$/.test(word)) ||
      targets.some(word => !accepted.has(word))) throw new Error("invalid_gotus_catalog");
  return Object.freeze({
    has: word => accepted.has(word),
    choose(random = Math.random) {
      return targets[Math.max(0, Math.min(targets.length - 1, Math.floor(random() * targets.length)))];
    },
    acceptedCount: accepted.size,
    targetCount: targets.length,
  });
}

export function loadGotusCatalog() {
  pending ??= readFile(BANK_URL, "utf8").then(JSON.parse).then(createGotusCatalog).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}
