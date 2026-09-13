export function getVocabTickFrequency(wordIndex, { isSeasonNew = false } = {}) {
  if (!Number.isFinite(wordIndex) || wordIndex <= 0) return 0;
  const index = Math.floor(wordIndex);
  const low = 220;
  const mid = 440;
  const high = 660;
  const frequency = index <= 10
    ? low + (mid - low) * (index - 1) / 9
    : index <= 20 ? mid + (high - mid) * (index - 11) / 9 : high;
  return frequency * (isSeasonNew ? 2 : 1);
}
