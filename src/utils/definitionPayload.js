import { normalizeWord } from "../components/gameLogic.js";

const DEFINITION_PLACEHOLDER_RE = /^[.\u2026\u00b7\s-]+$/;

export function sanitizeDefinitionText(value) {
  const text = String(value || "").trim();
  if (!text || DEFINITION_PLACEHOLDER_RE.test(text)) return "";
  return text;
}

export function pickDefinitionText(data) {
  if (!data) return "";
  return sanitizeDefinitionText(data.definition) || sanitizeDefinitionText(data.extract);
}

export function pickDefinitionList(data) {
  if (!data || !Array.isArray(data.definitions)) return [];
  const seen = new Set();
  return data.definitions.flatMap((raw) => {
    const text = sanitizeDefinitionText(raw);
    const key = text.toLocaleLowerCase("fr-FR");
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

export function buildDefinitionFallbacks(clean, data, tried) {
  const fallbacks = [];
  const push = (value) => {
    const term = String(value || "").trim();
    const key = normalizeWord(term);
    if (!term || !key || tried.has(key)) return;
    tried.add(key);
    fallbacks.push(term);
  };
  push(data?.lemma);
  push(data?.title);
  push(data?.matchedTitle);
  const normalized = normalizeWord(clean);
  if (normalized && !tried.has(normalized)) {
    tried.add(normalized);
    fallbacks.push(normalized);
  }
  return fallbacks;
}
