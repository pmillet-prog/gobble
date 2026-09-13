import { formatEtymon } from "./wiktionaryTemplateParams.mjs";

function romanNumber(value) {
  let number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100) return String(value);
  let result = "";
  for (const [amount, symbol] of [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) {
    while (number >= amount) { result += symbol; number -= amount; }
  }
  return result;
}

function plainDateLabel(value) {
  return String(value || "")
    .replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target.replace(/#.*$/, ""))
    .replace(/<\/?(?:sup|small|span)\b[^>]*>/gi, "")
    .trim();
}

function centuryOrdinal(value) {
  const number = /^\d+$/.test(value) ? romanNumber(value) : value.toUpperCase();
  return `${number}${number === "I" ? "er" : "e"}`;
}

function centuryLabel(value, includeCentury) {
  const text = plainDateLabel(value).replace(/^([ivxlcdm]+)(er|e)?$/i, (_, number, suffix = "") => number.toUpperCase() + suffix);
  if (!text || text === "?") return "Siècle à préciser";
  // Prefixes and historical-era suffixes belong to the date, not after “siècle”.
  return text.replace(/(?<![\p{L}\p{N}])([IVXLCDM]+|\d{1,2})(?:er|e|ᵉ|ᵉʳ)?(?![\p{L}\p{N}])(?:\s+si[èe]cle)?/u,
    (_, number) => `${centuryOrdinal(number)}${includeCentury ? " siècle" : ""}`);
}

const CONSTRUCTIONS = new Map([
  ["denominal", "dénominal"], ["deverbal", "déverbal"],
  ["apocope", "apocope"], ["apherese", "aphérèse"],
]);

const fromWord = (word) => `${/^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(word) ? "d’" : "de "}${word}`;

// Return null for an unsupported template, so the importer can report it.
export function renderWiktionaryInlineText(name, { positionalParams: values, namedParam }) {
  const first = values[0] || "";
  if (name === "date") {
    return !first || first === "?" ? "(Date à préciser)" : first;
  }
  if (name === "siecle") {
    const date = [centuryLabel(first, true), ...(values[1] ? [centuryLabel(values[1], true)] : [])].join(" – ");
    const uncertainty = namedParam("doute") ? " ?" : "";
    return date === "Siècle à préciser" ? `(${date})` : date + uncertainty;
  }
  // Unlike “siècle”, “siècle2” only renders the ordinal; prose supplies “siècle”.
  if (name === "siecle2") return centuryLabel(first, false);
  if (name === "circa") return first && first !== "?" ? `vers ${first}` : "(Date à préciser)";
  if (name === "avjc") return "av. J.-C.";
  if (name === "apjc") return "ap. J.-C.";
  if (name === "e" || name === "er") return first || name;
  if (name === "1er") return `1er${first ? ` ${first}` : ""}`;
  if (name === "lang") return values[1] || "";
  if (["nobr", "nowrap", "smcp", "petites capitales", "pc", "italique", "exposant"].includes(name)) return first;
  if (name === "term") return first ? `(${first})` : "";
  if (CONSTRUCTIONS.has(name)) {
    const label = CONSTRUCTIONS.get(name);
    const heading = namedParam("m") ? label[0].toUpperCase() + label.slice(1) : label;
    const word = namedParam("texte") || namedParam("de");
    return heading + (word ? ` ${fromWord(formatEtymon(word, namedParam("tr"), namedParam("sens")))}` : "");
  }
  if (name === "compose de") {
    const parts = values.map((word, index) => ({
      word,
      text: formatEtymon(namedParam(`dif${index + 1}`) || word, namedParam(`tr${index + 1}`), namedParam(`sens${index + 1}`)),
    })).filter(part => part.word);
    if (!parts.length) return "";
    let text;
    if (parts.length === 2 && parts[1].word.startsWith("-")) {
      text = `dérivé ${fromWord(parts[0].text)}, avec le suffixe ${parts[1].text}`;
    } else if (parts.length === 2 && parts[0].word.endsWith("-")) {
      text = `dérivé ${fromWord(parts[1].text)}, avec le préfixe ${parts[0].text}`;
    } else {
      const words = parts.map(part => part.text);
      text = `composé ${fromWord(words.length > 1 ? `${words.slice(0, -1).join(", ")} et ${fromWord(words.at(-1))}` : words[0])}`;
    }
    if (namedParam("f")) text = text.replace(/^(composé|dérivé)\b/, "$1e");
    return namedParam("m") ? text[0].toUpperCase() + text.slice(1) : text;
  }
  return null;
}

export function decodeWiktionaryTextEntities(text) {
  const entities = { nbsp: " ", thinsp: " ", ensp: " ", emsp: " ", quot: '"', apos: "'", amp: "&", lt: "<", gt: ">", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code.startsWith("#")) {
      const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
    }
    return entities[code.toLowerCase()] ?? entity;
  });
}
