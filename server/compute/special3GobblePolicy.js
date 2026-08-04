export function computeSpecial3GobbleAwards(entries, maxPossibleLength) {
  const gobbles = new Map();
  const gobbleFlags = new Map();
  const targetLength = Math.max(0, Math.trunc(Number(maxPossibleLength) || 0));
  if (targetLength <= 0) return { maxPossibleLength: targetLength, gobbles, gobbleFlags };

  for (const entry of Array.isArray(entries) ? entries : []) {
    const nick = String(entry?.nick || "").trim();
    if (!nick) continue;
    const hasLongestPossibleWord = (Array.isArray(entry?.words) ? entry.words : []).some(
      (rawWord) => String(rawWord || "").trim().length === targetLength
    );
    if (!hasLongestPossibleWord) continue;
    gobbles.set(nick, 1);
    gobbleFlags.set(nick, { score: false, len: true });
  }

  return { maxPossibleLength: targetLength, gobbles, gobbleFlags };
}
