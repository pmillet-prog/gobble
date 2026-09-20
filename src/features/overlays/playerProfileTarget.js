export function playerProfileUserId(entry) {
  if (!entry || entry.isBot || entry.isPalier) return null;
  for (const raw of [entry.userId, entry.installId, String(entry.playerKey || "").replace(/^install:/, "")]) {
    const id = Number(raw);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

export function resolvePlayerProfileTarget(entry, sources = []) {
  if (!entry || entry.isBot || entry.isPalier) return null;
  let userId = playerProfileUserId(entry);
  const nick = String(entry.nick || "").trim();
  if (!userId && nick) {
    const key = nick.toLocaleLowerCase("fr");
    for (const source of sources) {
      const known = (source || []).find(player => !player.isBot && String(player.nick || "").trim().toLocaleLowerCase("fr") === key);
      userId = playerProfileUserId(known);
      if (userId) break;
    }
  }
  return userId ? { userId, nick } : null;
}
