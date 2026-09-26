import { accountAvatarStore } from "../avatar/accountAvatarStore.js";
import { preparePodiumAvatars, releasePodiumAvatars } from "./preparePodiumAvatars.js";

export async function prepareTournamentPodium(entrants, { signal } = {}) {
  signal?.throwIfAborted();
  const participants = [...entrants.players, ...(entrants.self ? [entrants.self] : [])];
  const local = accountAvatarStore.getSnapshot();
  const ids = [...new Set(participants.filter(entry => !entry.isBot && !entry.avatar &&
    !(entry.userId === local.userId && local.avatar)).map(entry => entry.userId).filter(Boolean))];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 5000);
  let avatars = {};
  try {
    if (ids.length) {
      const response = await fetch(`/api/auth/avatars?userIds=${ids.join(",")}`, {
        credentials: "include", cache: "no-store", signal: controller.signal,
      });
      if (response.ok) avatars = (await response.json())?.avatars || {};
    }
  } catch { /* A missing appearance uses the existing default portrait. */ }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  signal?.throwIfAborted();
  const decorate = entry => entry && ({ ...entry, avatar: entry.userId && entry.userId === local.userId
    ? local.avatar || avatars[entry.userId] || entry.avatar : avatars[entry.userId] || entry.avatar });
  const players = entrants.players.map(decorate), self = decorate(entrants.self);
  const actors = await preparePodiumAvatars(getPodiumParticipants(players, self), { signal });
  return { players, self, actors, release: () => releasePodiumAvatars(actors) };
}

export function getPodiumParticipants(players, self) {
  return self?.avatar && !players.some(player => player.userId === self.userId)
    ? [...players, { ...self, previewOnly: true }] : players;
}
