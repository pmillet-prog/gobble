export const CHAT_SHOW_BOT_MESSAGES_STORAGE_KEY = "gobble_chat_show_bot_messages";
export const CHAT_BOT_VISIBILITY_STORAGE_KEY = "gobble_chat_bot_visibility_v1";
export const CHAT_BOT_VISIBILITY_OPTIONS = Object.freeze([
  { key: "linguist", nick: "GrosRobert" },
  { key: "statistician", nick: "Statatouille" },
  { key: "detective", nick: "Inspecteur Grille" },
  { key: "commentator", nick: "RadioBoggle" },
  { key: "culture", nick: "WikiMama" },
  { key: "narrator", nick: "Oraclettres" },
  { key: "coach", nick: "CaSuffix" },
  { key: "record_hunter", nick: "Recordator" },
  { key: "hidden_word", nick: "MomoMotus" },
  { key: "trend", nick: "Webomètre" },
]);

const BOT_KEY_BY_NICK = Object.freeze(
  Object.fromEntries(CHAT_BOT_VISIBILITY_OPTIONS.map((bot) => [bot.nick.toLowerCase(), bot.key]))
);

export function isChatBotMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message.isBot) return true;
  const installId = typeof message.installId === "string" ? message.installId : "";
  if (installId.startsWith("ambient-bot:") || installId.startsWith("dev-bot:")) return true;
  const kind = typeof message.meta?.kind === "string" ? message.meta.kind : "";
  return kind === "ambient_bot_chat" || kind === "dev_bot_chat" || kind === "dev_chat_fill";
}

export function normalizeChatBotVisibility(source) {
  return Object.fromEntries(
    CHAT_BOT_VISIBILITY_OPTIONS.map((bot) => [bot.key, source?.[bot.key] !== false])
  );
}

export function getChatBotVisibilityKey(message) {
  if (!message || typeof message !== "object") return "";
  const category = typeof message.meta?.category === "string" ? message.meta.category.trim() : "";
  if (category) return category;
  const installId = typeof message.installId === "string" ? message.installId : "";
  if (installId.startsWith("ambient-bot:")) {
    return installId.slice("ambient-bot:".length).trim();
  }
  const nick = String(message.nick || message.author || "").trim().toLowerCase();
  return BOT_KEY_BY_NICK[nick] || "";
}

export function shouldDisplayChatMessageForBotSettings(
  message,
  showBotMessages,
  botVisibility
) {
  if (!isChatBotMessage(message)) return true;
  if (!showBotMessages) return false;
  const key = getChatBotVisibilityKey(message);
  return !key || botVisibility?.[key] !== false;
}
