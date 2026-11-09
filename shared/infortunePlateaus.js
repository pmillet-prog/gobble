import { INFORTUNE_PRESENTER_KEYS, PRESENTER_IDENTITIES } from "./presenterIdentities.js";

export const INFORTUNE_PLATEAU_VERSION = 1;
export function infortunePlayerKey(player) {
  const userId = Number(player?.userId);
  if (Number.isSafeInteger(userId) && userId > 0) return `user:${userId}`;
  return player?.installId ? `guest:${player.installId}` : null;
}
function shuffle(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Called once on the server, never independently by each viewer. A round owns
// this immutable roster even if connections, names or ranks change afterwards.
export function buildInfortunePlateaus({ roomId, roundId, players, ranking = [], random = Math.random }) {
  const byId = new Map(), byNick = new Map();
  ranking.forEach((entry, index) => {
    if (entry.isBot) return;
    const rank = { order: index, rank: Number(entry.pos) || index + 1 };
    const id = infortunePlayerKey(entry);
    if (id) byId.set(id, rank);
    byNick.set(entry.nick, rank);
  });
  const unique = new Map();
  for (const player of players) {
    const id = infortunePlayerKey(player);
    if (!id || !player.nick || player.isBot || player.connected === false || unique.has(id)) continue;
    const rank = byId.get(id) || byNick.get(player.nick);
    unique.set(id, { id, userId: Number(player.userId) > 0 ? Number(player.userId) : null,
      nick: player.nick, isBot: false, rank: rank?.rank || null, order: rank?.order ?? Infinity });
  }
  const humans = [...unique.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const count = Math.ceil(humans.length / 3);
  if (!count) return Object.freeze([]);
  const groups = Array.from({ length: count }, (_, i) => ({ id: `${roomId}:${roundId}:plateau:${i + 1}`, members: [] }));
  const middleEnd = count + Math.ceil((humans.length - count) / 2);
  const bands = [humans.slice(0, count), humans.slice(count, middleEnd), humans.slice(middleEnd)];
  for (const band of bands) {
    // Spread incomplete bands among the least populated groups: four humans
    // get two human pairs, rather than leaving one alone opposite two bots.
    const slots = shuffle(groups, random).sort((a, b) => a.members.length - b.members.length);
    shuffle(band, random).forEach(({ order, ...player }, i) => slots[i].members.push(Object.freeze(player)));
  }
  for (const group of groups) {
    const presenters = shuffle(INFORTUNE_PRESENTER_KEYS, random);
    while (group.members.length < 3) {
      const presenterKey = presenters.pop();
      group.members.push(Object.freeze({ id: `${group.id}:presenter:${presenterKey}`, userId: null,
        isBot: true, presenterKey, nick: PRESENTER_IDENTITIES[presenterKey].nick, rank: null }));
    }
    Object.freeze(group.members); Object.freeze(group);
  }
  return Object.freeze(groups);
}

export function selectInfortunePlateau(groups, identity) {
  const key = infortunePlayerKey(identity);
  const matches = player => !player.isBot && (key ? player.id === key : identity?.nick && player.nick === identity.nick);
  const group = groups?.find(entry => entry.members?.some(matches));
  if (!group || group.members.length !== 3) return null;
  const self = group.members.find(matches);
  // Rotating the same seating order keeps the plateau reciprocal for everyone.
  const index = group.members.indexOf(self);
  return { id: group.id, self, members: group.members,
    opponents: [group.members[(index + 1) % 3], group.members[(index + 2) % 3]] };
}
