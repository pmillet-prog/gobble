export async function loadInfortuneContestants(opponents, { signal, fetchImpl = fetch } = {}) {
  const ids = [...new Set(opponents.filter(player => !player.isBot && player.userId).map(player => player.userId))];
  if (!ids.length) return opponents;
  const response = await fetchImpl(`/api/auth/avatars?userIds=${ids.join(",")}`, {
    credentials: "include", cache: "no-store", signal, headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("infortune_avatars_unavailable");
  const body = await response.json();
  if (!body?.ok || !body.avatars || typeof body.avatars !== "object" || Array.isArray(body.avatars)) throw new Error("infortune_avatars_invalid");
  signal?.throwIfAborted();
  return opponents.map(player => player.isBot ? player : { ...player, avatar: body.avatars[player.userId] || null });
}
