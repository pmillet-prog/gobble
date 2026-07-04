const TARGET_HINT_GRADIENT_STOPS = [
  { position: 0, color: [22, 163, 74] },
  { position: 0.55, color: [234, 179, 8] },
  { position: 1, color: [249, 115, 22] },
];

function interpolateChannel(start, end, ratio) {
  return Math.round(start + (end - start) * ratio);
}

function getGradientColor(ratio) {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  const endIndex = TARGET_HINT_GRADIENT_STOPS.findIndex(
    (stop) => stop.position >= safeRatio
  );
  if (endIndex <= 0) return TARGET_HINT_GRADIENT_STOPS[0].color;

  const end = TARGET_HINT_GRADIENT_STOPS[endIndex];
  const start = TARGET_HINT_GRADIENT_STOPS[endIndex - 1];
  const segmentRatio = (safeRatio - start.position) / (end.position - start.position);
  return start.color.map((channel, index) =>
    interpolateChannel(channel, end.color[index], segmentRatio)
  );
}

function buildTargetHintEntries(cells, wordIndices) {
  const entries = [];
  const seen = new Set();
  const safeCells = Array.isArray(cells) ? cells : [];
  const safeWordIndices = Array.isArray(wordIndices) ? wordIndices : [];

  for (let index = 0; index < safeCells.length; index += 1) {
    const boardIndex = safeCells[index];
    const wordIndex = safeWordIndices[index];
    if (!Number.isInteger(boardIndex) || boardIndex < 0 || seen.has(boardIndex)) continue;
    seen.add(boardIndex);
    entries.push({
      boardIndex,
      wordIndex: Number.isInteger(wordIndex) && wordIndex >= 0 ? wordIndex : null,
    });
  }

  return entries;
}

function getLastWordIndex(entries, wordLength) {
  if (Number.isFinite(wordLength) && wordLength > 1) {
    return Math.trunc(wordLength) - 1;
  }
  return Math.max(
    1,
    entries.reduce((max, entry) => Math.max(max, entry.wordIndex ?? 0), 0)
  );
}

export function buildTargetHintStyleMap(cells, wordIndices, wordLength) {
  const entries = buildTargetHintEntries(cells, wordIndices);
  if (!entries.length) return new Map();

  const lastWordIndex = getLastWordIndex(entries, wordLength);
  return new Map(
    entries.map((entry) => {
      const ratio =
        entry.wordIndex == null
          ? 0
          : Math.max(0, Math.min(1, entry.wordIndex / lastWordIndex));
      const [red, green, blue] = getGradientColor(ratio);
      return [
        entry.boardIndex,
        {
          "--tile-hint-rgb": `${red}, ${green}, ${blue}`,
          "--tile-hint-glow-alpha": "0.52",
        },
      ];
    })
  );
}

export function buildTargetHintPreviewStyleMap(wordIndices, wordLength) {
  const safeIndices = Array.isArray(wordIndices) ? wordIndices : [];
  const uniqueIndices = Array.from(
    new Set(safeIndices.filter((wordIndex) => Number.isInteger(wordIndex) && wordIndex >= 0))
  );
  if (!uniqueIndices.length) return new Map();

  const lastWordIndex =
    Number.isFinite(wordLength) && wordLength > 1
      ? Math.trunc(wordLength) - 1
      : Math.max(1, ...uniqueIndices);
  return new Map(
    uniqueIndices.map((wordIndex) => {
      const ratio = Math.max(0, Math.min(1, wordIndex / lastWordIndex));
      const [red, green, blue] = getGradientColor(ratio);
      return [
        wordIndex,
        {
          color: `rgb(${red}, ${green}, ${blue})`,
          textShadow: `0 0 10px rgba(${red}, ${green}, ${blue}, 0.28)`,
        },
      ];
    })
  );
}

export function buildTargetHintOverlayStyleMap(
  cells,
  wordIndices,
  wordLength,
  variant = "fill"
) {
  const entries = buildTargetHintEntries(cells, wordIndices);
  if (!entries.length) return new Map();

  const lastWordIndex = getLastWordIndex(entries, wordLength);
  return new Map(
    entries.map((entry) => {
      const ratio =
        entry.wordIndex == null
          ? 0
          : Math.max(0, Math.min(1, entry.wordIndex / lastWordIndex));
      const [red, green, blue] = getGradientColor(ratio);
      const style =
        variant === "outline"
          ? {
              background: "transparent",
              boxShadow:
                `inset 0 0 0 4px rgba(${red}, ${green}, ${blue}, 0.98), ` +
                `0 0 14px 2px rgba(${red}, ${green}, ${blue}, 0.48)`,
            }
          : {
              background:
                "linear-gradient(145deg, rgba(255, 255, 255, 0.28) 0%, " +
                "rgba(255, 255, 255, 0.06) 48%, rgba(15, 23, 42, 0.16) 100%)",
              boxShadow:
                "inset 0 2px 0 rgba(255, 255, 255, 0.3), " +
                "inset 0 -3px 7px rgba(15, 23, 42, 0.18)",
            };
      return [entry.boardIndex, style];
    })
  );
}
