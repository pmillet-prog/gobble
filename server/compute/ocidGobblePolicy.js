export function computeOcidGobbleAwards(results) {
  const gobbles = new Map();
  const gobbleFlags = new Map();

  for (const entry of Array.isArray(results) ? results : []) {
    const nick = String(entry?.nick || "").trim();
    if (!nick || !entry?.ocid?.exactTarget) continue;
    gobbles.set(nick, 1);
    gobbleFlags.set(nick, { score: false, len: false, ocidTarget: true });
  }

  return { gobbles, gobbleFlags };
}
