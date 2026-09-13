// Pipes inside wiki links belong to the link, not to the surrounding template.
export function parseTemplateParameters(body) {
  const parts = [];
  let start = 0;
  let linkDepth = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body.slice(index, index + 2) === "[[") { linkDepth += 1; index += 1; }
    else if (body.slice(index, index + 2) === "]]") { linkDepth = Math.max(0, linkDepth - 1); index += 1; }
    else if (body[index] === "|" && !linkDepth) {
      parts.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(body.slice(start).trim());
  const name = parts.shift() || "";
  const named = new Map();
  const positional = new Map();
  let position = 1;
  for (const part of parts) {
    const match = part.match(/^([^=|\[\]{}]+)=(.*)$/s);
    if (match) {
      const key = match[1].trim();
      if (/^[1-9]\d*$/.test(key)) positional.set(Number(key), match[2].trim());
      else named.set(key.toLowerCase(), match[2].trim());
    } else {
      positional.set(position++, part);
    }
  }
  return {
    name,
    params: parts,
    positionalParams: Array.from({ length: Math.max(0, ...positional.keys()) }, (_, i) => positional.get(i + 1) || ""),
    namedParam: (key) => named.get(key) || "",
  };
}

export function formatEtymon(word, transcription = "", meaning = "") {
  if (!word) return "";
  const reading = transcription && transcription !== "-" && transcription !== word
    ? `, ${transcription}` : "";
  return `${word}${reading}${meaning ? ` (« ${meaning} »)` : ""}`;
}
