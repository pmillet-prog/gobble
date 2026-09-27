export const CHAT_SHOW_BOT_MESSAGES_STORAGE_KEY = "gobble_chat_show_bot_messages_v2";
export const CHAT_BOT_VISIBILITY_STORAGE_KEY = "gobble_chat_bot_visibility_v1";
export const CHAT_BOT_VISIBILITY_OPTIONS = Object.freeze([
  { key: "linguist", nick: "Bernard Pinot" },
  { key: "statistician", nick: "Laurent Rhum&Co" },
  { key: "detective", nick: "Inspecteur Grille" },
  { key: "commentator", nick: "RadioBoggle" },
  { key: "culture", nick: "Julien Lechéper" },
  { key: "narrator", nick: "Oraclettres" },
  { key: "coach", nick: "Maître Gobbello" },
  { key: "record_hunter", nick: "Recordator" },
  { key: "humorist", nick: "Laurent Bafouille" },
  { key: "trend", nick: "Webomètre" },
]);

const BOT_KEY_BY_NICK = Object.freeze({
  ...Object.fromEntries(CHAT_BOT_VISIBILITY_OPTIONS.map((bot) => [bot.nick.toLowerCase(), bot.key])),
  momomotus: "humorist",
});

export function isChatBotMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message.isBot) return true;
  const installId = typeof message.installId === "string" ? message.installId : "";
  if (installId.startsWith("ambient-bot:") || installId.startsWith("dev-bot:")) return true;
  const kind = typeof message.meta?.kind === "string" ? message.meta.kind : "";
  return (
    kind === "ambient_bot_chat" ||
    kind === "presenter_chat_copy" ||
    kind === "dev_bot_chat" ||
    kind === "dev_chat_fill"
  );
}

export function normalizeChatBotVisibility(source) {
  return Object.fromEntries(
    CHAT_BOT_VISIBILITY_OPTIONS.map((bot) => {
      const value = bot.key === "humorist" ? source?.humorist ?? source?.hidden_word : source?.[bot.key];
      return [bot.key, value !== false];
    })
  );
}

export function getChatBotVisibilityKey(message) {
  if (!message || typeof message !== "object") return "";
  const category = typeof message.meta?.category === "string" ? message.meta.category.trim() : "";
  if (category) return category === "hidden_word" ? "humorist" : category;
  const installId = typeof message.installId === "string" ? message.installId : "";
  if (installId.startsWith("ambient-bot:")) {
    const key = installId.slice("ambient-bot:".length).trim();
    return key === "hidden_word" ? "humorist" : key;
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
