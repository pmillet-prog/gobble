export const CHAT_MESSAGES_HISTORY_MAX = 200;
export const CHAT_SYSTEM_HISTORY_MAX = 100;
export const CHAT_BUFFER_MAX = CHAT_MESSAGES_HISTORY_MAX + CHAT_SYSTEM_HISTORY_MAX;
export const CHAT_MESSAGES_STORAGE_KEY = "gobble_chat_messages_v1";

const CHAT_LEGACY_EMOTICON_RULES = [
  { regex: /(^|[\s([{<'"])(?:<3)(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "❤️" },
  { regex: /(^|[\s([{<'"])(?::'\()(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "😢" },
  { regex: /(^|[\s([{<'"])(?::-\)|:\))(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "🙂" },
  { regex: /(^|[\s([{<'"])(?:;-\)|;\))(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "😉" },
  { regex: /(^|[\s([{<'"])(?::-?D|X-?D|x-?D)(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "😄" },
  { regex: /(^|[\s([{<'"])(?::-?[Pp]|;-?[Pp])(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "😛" },
  { regex: /(^|[\s([{<'"])(?::-\(|:\()(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "🙁" },
  { regex: /(^|[\s([{<'"])(?::-?[Oo])(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "😮" },
  { regex: /(^|[\s([{<'"])(?::-[\\/]|:[\\/])(?=$|[\s)\]}>,'"!.?;:])/g, emoji: "😕" },
];

const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function isSystemAuthor(rawAuthor) {
  if (!rawAuthor) return false;
  const simplified = String(rawAuthor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return simplified === "system" || simplified === "systeme";
}

export function isSystemChatMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message.type === "system" || message.channel === "system") return true;
  return isSystemAuthor(message.author || message.nick || "");
}

export function formatChatUnreadSuffix(unreadCount) {
  const value = Number(unreadCount) || 0;
  if (value <= 0) return "";
  if (value >= 10) return " (9+)";
  return ` (${value})`;
}

export function getChatMessageSortTime(message) {
  const tsCandidate =
    message?.t ??
    message?.ts ??
    message?.timestamp ??
    message?.createdAt ??
    0;
  const ts = Number(tsCandidate);
  return Number.isFinite(ts) ? ts : 0;
}

export function formatChatMessageTime(message) {
  const ts = getChatMessageSortTime(message);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return CHAT_TIME_FORMATTER.format(new Date(ts));
  } catch (_) {
    return "";
  }
}

export function isEditedChatMessage(message) {
  const editedAt = Number(message?.editedAt);
  return Number.isFinite(editedAt) && editedAt > 0;
}

export function normalizeLegacyChatEmoticons(raw) {
  let text = typeof raw === "string" ? raw : String(raw ?? "");
  if (!text) return "";
  for (const rule of CHAT_LEGACY_EMOTICON_RULES) {
    text = text.replace(rule.regex, (_, prefix = "") => `${prefix}${rule.emoji}`);
  }
  return text;
}

export function normalizeChatReplyPreview(rawReply) {
  if (!rawReply || typeof rawReply !== "object") return null;
  const id = typeof rawReply.id === "string" ? rawReply.id.trim() : "";
  if (!id) return null;
  const installId =
    typeof rawReply.installId === "string" && rawReply.installId.trim()
      ? rawReply.installId.trim()
      : null;
  const nick = String(rawReply.nick || rawReply.author || "Anonyme")
    .trim()
    .slice(0, 40);
  const text = normalizeLegacyChatEmoticons(String(rawReply.text || ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  if (!text) return null;
  const t = Number(rawReply.t ?? rawReply.ts ?? rawReply.timestamp ?? rawReply.createdAt);
  return {
    id,
    installId,
    nick: nick || "Anonyme",
    text,
    t: Number.isFinite(t) && t > 0 ? t : Date.now(),
  };
}

export function normalizeChatReactions(rawReactions) {
  if (!rawReactions || typeof rawReactions !== "object" || Array.isArray(rawReactions)) {
    return {};
  }
  const out = {};
  for (const [rawEmoji, rawUsers] of Object.entries(rawReactions)) {
    const emoji = typeof rawEmoji === "string" ? rawEmoji.trim() : "";
    if (!emoji) continue;
    const users = [];
    const seen = new Set();
    for (const rawUser of Array.isArray(rawUsers) ? rawUsers : []) {
      const installId =
        typeof rawUser?.installId === "string" ? rawUser.installId.trim() : "";
      if (!installId || seen.has(installId)) continue;
      seen.add(installId);
      const nick = typeof rawUser?.nick === "string" ? rawUser.nick.trim().slice(0, 40) : "";
      users.push({
        installId,
        nick: nick || "Anonyme",
      });
    }
    if (users.length) out[emoji] = users;
  }
  return out;
}

export function normalizeChatMessageShape(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "object") return null;
  const message = { ...rawMessage };
  if (typeof rawMessage.text === "string") {
    message.text = normalizeLegacyChatEmoticons(rawMessage.text);
  }
  const replyTo = normalizeChatReplyPreview(rawMessage.replyTo);
  if (replyTo) message.replyTo = replyTo;
  else delete message.replyTo;
  const reactions = normalizeChatReactions(rawMessage.reactions);
  if (Object.keys(reactions).length) message.reactions = reactions;
  else delete message.reactions;
  return message;
}

export function getChatMessageReplyPreview(message) {
  if (!message || typeof message !== "object") return null;
  return normalizeChatReplyPreview(message.replyTo);
}

export function getChatMessageReactionEntries(message) {
  const reactions = normalizeChatReactions(message?.reactions);
  return Object.entries(reactions)
    .map(([emoji, users]) => ({
      emoji,
      users: Array.isArray(users) ? users : [],
      count: Array.isArray(users) ? users.length : 0,
    }))
    .filter((entry) => entry.count > 0);
}

export function patchChatMessageById(messages, updatedMessage) {
  const normalized = normalizeChatMessageShape(updatedMessage);
  if (!normalized?.id) return messages;
  let changed = false;
  const next = (Array.isArray(messages) ? messages : []).map((entry) => {
    if (!entry || entry.id !== normalized.id) return entry;
    changed = true;
    return {
      ...entry,
      ...normalized,
    };
  });
  return changed ? next : messages;
}

export function removeChatMessageById(messages, messageId) {
  const targetId = typeof messageId === "string" ? messageId.trim() : "";
  if (!targetId) return messages;
  const list = Array.isArray(messages) ? messages : [];
  const next = list.filter((entry) => entry?.id !== targetId);
  return next.length === list.length ? messages : next;
}

export function patchChatMessageReactions(messages, patch) {
  const messageId = typeof patch?.messageId === "string" ? patch.messageId.trim() : "";
  if (!messageId) return messages;
  const normalizedReactions = normalizeChatReactions(patch?.reactions);
  let changed = false;
  const next = (Array.isArray(messages) ? messages : []).map((entry) => {
    if (!entry || entry.id !== messageId) return entry;
    changed = true;
    const updated = { ...entry };
    if (Object.keys(normalizedReactions).length) updated.reactions = normalizedReactions;
    else delete updated.reactions;
    if (patch?.updatedAt) {
      const ts = Number(patch.updatedAt);
      if (Number.isFinite(ts) && ts > 0) {
        updated.reactionsUpdatedAt = ts;
      }
    }
    return updated;
  });
  return changed ? next : messages;
}

export function findNewReactionFromOthers(prevMessage, patchReactions, selfInstallId) {
  if (!prevMessage || typeof prevMessage !== "object") return null;
  const previousReactions = normalizeChatReactions(prevMessage.reactions);
  const nextReactions = normalizeChatReactions(patchReactions);
  const selfId = typeof selfInstallId === "string" ? selfInstallId.trim() : "";
  for (const [emoji, users] of Object.entries(nextReactions)) {
    const previousUsers = new Set(
      (Array.isArray(previousReactions[emoji]) ? previousReactions[emoji] : [])
        .map((user) => (typeof user?.installId === "string" ? user.installId.trim() : ""))
        .filter(Boolean)
    );
    const addedByOtherUser = (Array.isArray(users) ? users : []).find((user) => {
      const userInstallId =
        typeof user?.installId === "string" ? user.installId.trim() : "";
      if (!userInstallId || previousUsers.has(userInstallId)) return false;
      return !selfId || userInstallId !== selfId;
    });
    if (addedByOtherUser) {
      const nick =
        typeof addedByOtherUser?.nick === "string" ? addedByOtherUser.nick.trim() : "";
      return {
        emoji,
        actorNick: nick || "Quelqu'un",
      };
    }
  }
  return null;
}

export function dedupeChatMessages(messages) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(messages) ? messages : []) {
    const normalized = normalizeChatMessageShape(raw);
    if (!normalized) continue;
    const id = typeof normalized.id === "string" ? normalized.id : "";
    const key = id
      ? `id:${id}`
      : `fallback:${getChatMessageSortTime(normalized)}:${normalized.nick || normalized.author || ""}:${normalized.text || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function capChatMessagesByType(messages) {
  const deduped = dedupeChatMessages(messages);
  const system = [];
  const user = [];
  for (let i = deduped.length - 1; i >= 0; i -= 1) {
    const msg = deduped[i];
    if (isSystemChatMessage(msg)) {
      if (system.length < CHAT_SYSTEM_HISTORY_MAX) {
        system.push(msg);
      }
      continue;
    }
    if (user.length < CHAT_MESSAGES_HISTORY_MAX) {
      user.push(msg);
    }
  }
  const merged = [...user.reverse(), ...system.reverse()];
  merged.sort((a, b) => {
    const tA = getChatMessageSortTime(a);
    const tB = getChatMessageSortTime(b);
    if (tA !== tB) return tA - tB;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  return merged.slice(-CHAT_BUFFER_MAX);
}

export function readStoredChatMessages() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return capChatMessagesByType(parsed);
  } catch (_) {
    return [];
  }
}
