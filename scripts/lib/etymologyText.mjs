export function hasUnbalancedEtymologyDelimiters(text) {
  const stack = [];
  for (const character of text) {
    if (character === "(" || character === "«") stack.push(character);
    else if (character === ")" || character === "»") {
      if (stack.pop() !== (character === ")" ? "(" : "«")) return true;
    }
  }
  return stack.length > 0;
}

export function getEtymologyTextIssues(text) {
  const issues = [];
  if (hasUnbalancedEtymologyDelimiters(text)) issues.push("unbalanced-delimiters");
  if (/\?\s*si[èe]cle/i.test(text) || /^\?\s/.test(text)) issues.push("raw-unknown-date");
  if (/«\s*»|\(\s*\)/.test(text)) issues.push("empty-delimiters");
  if (/\{\{|\[\[|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|#[a-z]{2,3}\b/i.test(text)) issues.push("residual-markup");
  return issues;
}

export function clipEtymologyText(text, maxLen) {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, Math.max(0, maxLen - 3));
  const stack = [];
  let lastWord = 0;
  let lastPunctuation = 0;
  for (let index = 0; index < slice.length; index += 1) {
    const character = slice[index];
    if (character === "(" || character === "«") stack.push(character);
    else if (character === ")" || character === "»") stack.pop();
    if (stack.length) continue;
    if (/\s/.test(character)) lastWord = index;
    if (/[.,;]/.test(character) && /\s/.test(slice[index + 1] || "")) lastPunctuation = index;
    if (slice.startsWith(" et ", index) || slice.startsWith(" ou ", index)) lastPunctuation = index;
  }
  const boundary = lastPunctuation >= Math.min(80, Math.floor(maxLen * 0.55))
    ? lastPunctuation : lastWord;
  const cut = boundary ? slice.slice(0, boundary) : "";
  return cut ? `${cut.replace(/[«“(,;:\s]+$/g, "").trim()}...` : "";
}
