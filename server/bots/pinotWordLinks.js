import { getLocalDefinitionEntry } from "../definitions/localDefinitionStore.js";
import { getPresenterWordRanges, presenterWordKey } from "../../shared/presenterWords.js";

// The form and lemma already come from verified dictionary entries. Expand a
// matching fragment to its whole word only when that word has a local definition.
// Called once for the selected intervention, never for every candidate or on tap.
export async function getPinotWordHighlights(text, knownWords, { lookupEntry = getLocalDefinitionEntry } = {}) {
  const highlights = new Map((knownWords || []).filter(Boolean).map(word => [presenterWordKey(word), word]));
  const keys = [...highlights.keys()];
  const candidates = new Map();
  for (const { word } of getPresenterWordRanges(text)) {
    const key = presenterWordKey(word);
    if (!highlights.has(key) && keys.some(known => key.includes(known))) candidates.set(key, word);
  }
  const entries = await Promise.all([...candidates].map(async ([key, word]) => {
    const entry = await lookupEntry(word);
    const definitions = [entry?.definition, ...(Array.isArray(entry?.definitions) ? entry.definitions : [])];
    return definitions.some(value => typeof value === "string" && value.trim()) ? [key, word] : null;
  }));
  for (const entry of entries) if (entry) highlights.set(...entry);
  return [...highlights.values()];
}
