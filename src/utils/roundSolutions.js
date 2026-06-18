import { normalizeWord } from "../components/gameLogic";

export function hydrateServerSolutionsPayload(payload, options = {}) {
  const disableRareBonus = !!options.disableRareBonus;
  const isPackedPayload = payload && !Array.isArray(payload) && Array.isArray(payload.w);
  const packedPoints = isPackedPayload && Array.isArray(payload.p) ? payload.p : [];
  const packedMetaByIndex = new Map();
  if (isPackedPayload && Array.isArray(payload.m)) {
    for (const row of payload.m) {
      if (!Array.isArray(row)) continue;
      const idx = Number(row[0]);
      if (Number.isInteger(idx) && idx >= 0) {
        packedMetaByIndex.set(idx, row);
      }
    }
  }
  const list = isPackedPayload
    ? payload.w.map((word, idx) => {
        const metaRow = packedMetaByIndex.get(idx) || [];
        return [
          word,
          packedPoints[idx],
          [],
          metaRow[1],
          metaRow[2],
          metaRow[3],
          metaRow[4],
          metaRow[5],
          metaRow[6],
          metaRow[7],
        ];
      })
    : Array.isArray(payload)
    ? payload
    : [];
  const solved = new Map();
  const all = [];
  for (const entry of list) {
    const word = normalizeWord(Array.isArray(entry) ? entry[0] : entry?.word);
    if (!word) continue;
    const ptsSource = Array.isArray(entry) ? entry[1] : entry?.pts;
    const pathSource = Array.isArray(entry) ? entry[2] : entry?.path;
    const usedFakeTwinsSource = Array.isArray(entry) ? entry[3] : entry?.usedFakeTwins;
    const fakeTwinsCompletionSource = Array.isArray(entry)
      ? entry[4]
      : entry?.fakeTwinsCompletionWord;
    const fakeTwinsBonusOnlySource = Array.isArray(entry) ? entry[5] : entry?.fakeTwinsBonusOnly;
    const rareBonusWordSource = Array.isArray(entry) ? entry[6] : entry?.rareBonusWord;
    const rareBonusPointsSource = Array.isArray(entry) ? entry[7] : entry?.rareBonusPoints;
    const rarityBucketSource = Array.isArray(entry) ? entry[8] : entry?.rarityBucket;
    const cultureThemeWordSource = Array.isArray(entry) ? entry[9] : entry?.cultureThemeWord;
    const pts = Number.isFinite(Number(ptsSource)) ? Number(ptsSource) : 0;
    const path = Array.isArray(pathSource)
      ? pathSource.map((idx) => Number(idx)).filter((idx) => Number.isInteger(idx) && idx >= 0)
      : [];
    const meta = {
      path,
      pts,
      usedFakeTwins: !!usedFakeTwinsSource,
      fakeTwinsCompletionWord: !!fakeTwinsCompletionSource,
      fakeTwinsBonusOnly: !!fakeTwinsBonusOnlySource,
      rareBonusWord: !disableRareBonus && !!rareBonusWordSource,
      rareBonusPoints: !disableRareBonus ? Number(rareBonusPointsSource) || 0 : 0,
      rarityBucket: !disableRareBonus ? String(rarityBucketSource || "") : "",
      cultureThemeWord: !!cultureThemeWordSource,
    };
    solved.set(word, meta);
    all.push({ word, ...meta });
  }
  all.sort((a, b) => {
    const ptsDiff = (Number(b?.pts) || 0) - (Number(a?.pts) || 0);
    if (ptsDiff !== 0) return ptsDiff;
    return String(a.word || "").localeCompare(String(b.word || ""), "fr", {
      sensitivity: "base",
    });
  });
  return { solved, all, ready: Array.isArray(payload) || isPackedPayload };
}
