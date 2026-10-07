import { sanitizeDefinitionText } from "./definitionPayload.js";

function definitionKey(value) {
  return sanitizeDefinitionText(value)
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

// The exact question is supplied with the round results. Keep it available even
// if the dictionary entry changes after the question was picked; never guess a
// different meaning through a partial text match.
export function resolveDefinitionSelection({
  definition = "",
  definitions = [],
  highlightedDefinition = "",
} = {}) {
  const items = (Array.isArray(definitions) ? definitions : [])
    .map(sanitizeDefinitionText)
    .filter(Boolean);
  if (!items.length && sanitizeDefinitionText(definition)) {
    items.push(sanitizeDefinitionText(definition));
  }
  const selected = sanitizeDefinitionText(highlightedDefinition);
  let highlightedIndex = -1;
  if (selected) {
    const selectedKey = definitionKey(selected);
    highlightedIndex = items.findIndex((item) => definitionKey(item) === selectedKey);
    if (highlightedIndex < 0) {
      highlightedIndex = items.length;
      items.push(selected);
    }
  }
  return { items, highlightedIndex: items.length > 1 ? highlightedIndex : -1 };
}
