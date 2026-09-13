export function normalizeChalkboardLineBreaks(text, value) {
  if (!Array.isArray(value) || value.length >= text.length) return [];
  let start = 0;
  for (const end of value) {
    if (!Number.isInteger(end) || end <= start || end >= text.length ||
      !text.slice(start, end).trim() ||
      /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) return [];
    start = end;
  }
  return text.slice(start).trim() ? [...value] : [];
}

// Store offsets into the unchanged message: automatic breaks do not consume
// its 280-character allowance, even when a long word has to be split.
export function getChalkboardTextLines(element) {
  const text = String(element.text || "");
  let start = 0;
  return [...(element.lineBreaks || []), text.length].map(end => {
    const line = text.slice(start, end).trim();
    start = end;
    return line;
  });
}

export function getChalkboardLineHeight(element) {
  return Number(element?.fontSize || 64) * 1.32;
}

export function getChalkboardTextHeight(element) {
  return getChalkboardLineHeight(element) * ((element?.lineBreaks?.length || 0) + 1);
}
