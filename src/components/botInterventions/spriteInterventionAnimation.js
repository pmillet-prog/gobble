const SHORT_PUNCTUATION_PAUSE_MS = 90;
const LONG_PUNCTUATION_PAUSE_MS = 190;

export function resolveInterventionAppearanceSfxKey(
  config,
  { manualActivation = false, fallbackKey = "" } = {}
) {
  if (manualActivation && config?.manualAppearanceSfxKey) {
    return config.manualAppearanceSfxKey;
  }
  return config?.appearanceSfxKey || fallbackKey;
}

export function isInterventionForActiveRound(eventRoundId, activeRoundId) {
  const eventId = eventRoundId == null ? "" : String(eventRoundId);
  const activeId = activeRoundId == null ? "" : String(activeRoundId);
  return !eventId || !activeId || eventId === activeId;
}

export function splitInterventionText(text) {
  const value = String(text || "");
  if (!value) return [];
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (entry) => entry.segment);
  }
  return Array.from(value);
}

function addHighlightRange(ranges, start, end, textLength) {
  const safeStart = Math.max(0, Math.min(textLength, Math.trunc(Number(start) || 0)));
  const safeEnd = Math.max(safeStart, Math.min(textLength, Math.trunc(Number(end) || 0)));
  if (safeEnd > safeStart) ranges.push([safeStart, safeEnd]);
}

export function buildInterventionTextSegments(text, explicitHighlights = []) {
  const value = String(text || "");
  if (!value) return [];
  const ranges = [];
  const lowered = value.toLocaleLowerCase("fr");
  for (const rawHighlight of Array.isArray(explicitHighlights) ? explicitHighlights : []) {
    const highlight = String(rawHighlight || "").trim();
    if (!highlight) continue;
    const loweredHighlight = highlight.toLocaleLowerCase("fr");
    let fromIndex = 0;
    while (fromIndex < lowered.length) {
      const index = lowered.indexOf(loweredHighlight, fromIndex);
      if (index < 0) break;
      addHighlightRange(ranges, index, index + highlight.length, value.length);
      fromIndex = index + Math.max(1, highlight.length);
    }
  }

  const automaticPatterns = [
    /-\p{L}{3,}/gu,
    /\b\d+(?:[.,]\d+)?\s+(?:mots?|lettres?|points?|pts?)\b/giu,
    /\b[A-ZÀ-ÖØ-ÝŒ]{3,}\b/gu,
  ];
  for (const pattern of automaticPatterns) {
    for (const match of value.matchAll(pattern)) {
      addHighlightRange(ranges, match.index, match.index + match[0].length, value.length);
    }
  }
  for (const match of value.matchAll(/[«“"]([^»”"]{2,})[»”"]/gu)) {
    const leadingSpace = match[1].match(/^\s*/u)?.[0]?.length || 0;
    const trailingSpace = match[1].match(/\s*$/u)?.[0]?.length || 0;
    const start = match.index + 1 + leadingSpace;
    addHighlightRange(
      ranges,
      start,
      start + match[1].length - leadingSpace - trailingSpace,
      value.length
    );
  }

  const highlighted = new Uint8Array(value.length);
  for (const [start, end] of ranges) {
    highlighted.fill(1, start, end);
  }
  const segments = [];
  let start = 0;
  for (let index = 1; index <= value.length; index += 1) {
    if (index < value.length && highlighted[index] === highlighted[start]) continue;
    segments.push({
      text: value.slice(start, index),
      highlighted: highlighted[start] === 1,
    });
    start = index;
  }
  return segments;
}

export function randomIntegerBetween(min, max, random = Math.random) {
  const safeMin = Math.ceil(Number(min) || 0);
  const safeMax = Math.max(safeMin, Math.floor(Number(max) || 0));
  const sample = Math.min(0.999999, Math.max(0, Number(random?.()) || 0));
  return safeMin + Math.floor(sample * (safeMax - safeMin + 1));
}

export function getInterventionTypingDelay(character, config, random = Math.random) {
  const base = randomIntegerBetween(
    config.typeDelayMinMs,
    config.typeDelayMaxMs,
    random
  );
  const punctuationPause = /[.!?]/u.test(character)
    ? LONG_PUNCTUATION_PAUSE_MS
    : /[,;:]/u.test(character)
    ? SHORT_PUNCTUATION_PAUSE_MS
    : 0;
  const speedMultiplier = Math.max(1, Number(config.typingSpeedMultiplier) || 1);
  return Math.max(1, Math.round((base + punctuationPause) / speedMultiplier));
}

export function getInterventionFramePosition(frame, frameCount = 7) {
  const safeFrameCount = Math.max(1, Math.trunc(Number(frameCount) || 1));
  const maximumFrame = safeFrameCount - 1;
  const safeFrame = Math.min(
    maximumFrame,
    Math.max(0, Math.trunc(Number(frame) || 0))
  );
  if (maximumFrame <= 0) return "0% 0%";
  return `${(safeFrame / maximumFrame) * 100}% 0%`;
}

export function getNextPresenterHitReaction(hitCount) {
  return Math.max(0, Math.trunc(Number(hitCount) || 0)) % 2 === 0
    ? "hit1"
    : "hit2";
}

export function computeInterventionPlacement(hostRect, viewport = {}, config) {
  const viewportWidth = Math.max(1, Number(viewport.width) || 1);
  const viewportHeight = Math.max(1, Number(viewport.height) || 1);
  const compact = viewportWidth <= 640;
  const characterHeight = compact
    ? config.characterHeightMobilePx
    : config.characterHeightPx;
  const bubbleWidth = compact
    ? config.bubbleMaxWidthMobilePx
    : config.bubbleMaxWidthPx;
  const characterWidth = characterHeight * config.frameAspectRatio;
  const surfaceWidth = Math.min(
    viewportWidth - 16,
    characterWidth + bubbleWidth + (compact ? 8 : 10)
  );
  const fallbackRect = {
    left: viewportWidth * 0.2,
    top: viewportHeight * 0.58,
    width: viewportWidth * 0.6,
  };
  const rect =
    hostRect &&
    Number.isFinite(hostRect.left) &&
    Number.isFinite(hostRect.top) &&
    Number.isFinite(hostRect.width)
      ? hostRect
      : fallbackRect;
  const desiredCenter = rect.left + rect.width / 2;
  const halfSurface = Math.max(0, surfaceWidth / 2);
  const minCenter = 8 + halfSurface;
  const maxCenter = Math.max(minCenter, viewportWidth - 8 - halfSurface);
  const anchorX = Math.min(maxCenter, Math.max(minCenter, desiredCenter));
  const desiredBottom = viewportHeight - rect.top + (compact ? 5 : 8);
  const maximumBottom = Math.max(8, viewportHeight - characterHeight - 8);

  return {
    anchorBottom: Math.max(8, Math.min(maximumBottom, desiredBottom)),
    anchorX,
    compact,
  };
}
