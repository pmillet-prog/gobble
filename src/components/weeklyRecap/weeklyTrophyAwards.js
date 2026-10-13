import { TROPHY_REWARDS, TROPHY_BY_ID } from "../../../shared/trophyCatalog.js";

export function buildWeeklyTrophyRows(awards) {
  if (!Array.isArray(awards)) return null;
  const recipientsByReward = new Map();
  for (const award of awards) {
    if (!Object.hasOwn(TROPHY_BY_ID, award?.id)) continue;
    for (const recipient of Array.isArray(award.recipients) ? award.recipients : []) {
      const nick = String(recipient?.nick || "").trim();
      const count = Math.trunc(Number(recipient?.count));
      if (!nick || !Number.isFinite(count) || count <= 0) continue;
      const key = recipient.userId != null ? `user:${recipient.userId}` : `nick:${nick.toLocaleLowerCase("fr")}`;
      if (!recipientsByReward.has(award.id)) recipientsByReward.set(award.id, new Map());
      const recipients = recipientsByReward.get(award.id);
      const previous = recipients.get(key);
      recipients.set(key, { userId: recipient.userId, nick, key, count: count + (previous?.count || 0) });
    }
  }
  return TROPHY_REWARDS.filter(reward => recipientsByReward.has(reward.id)).map(reward => ({
    reward,
    recipients: [...recipientsByReward.get(reward.id).values()]
      .sort((a, b) => a.nick.localeCompare(b.nick, "fr", { sensitivity: "base" })),
  }));
}
