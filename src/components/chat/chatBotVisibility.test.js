import test from "node:test";
import assert from "node:assert/strict";

import {
  getChatBotVisibilityKey,
  normalizeChatBotVisibility,
  shouldDisplayChatMessageForBotSettings,
} from "./chatBotVisibility.js";

test("chat bot visibility resolves explicit categories and known nicknames", () => {
  assert.equal(getChatBotVisibilityKey({ meta: { category: "coach" } }), "coach");
  assert.equal(getChatBotVisibilityKey({ nick: "Bernard Pinot", isBot: true }), "linguist");
  const visibility = normalizeChatBotVisibility({ linguist: false });
  assert.equal(
    shouldDisplayChatMessageForBotSettings({ nick: "Bernard Pinot", isBot: true }, true, visibility),
    false
  );
  assert.equal(shouldDisplayChatMessageForBotSettings({ nick: "Tigre" }, false, visibility), true);
});

test("Laurent Bafouille inherits MomoMotus visibility while keeping an independent Pinot preference", () => {
  const visibility = normalizeChatBotVisibility({ hidden_word: false, linguist: true });
  assert.equal(visibility.humorist, false);
  assert.equal(visibility.linguist, true);
  assert.equal(normalizeChatBotVisibility({ hidden_word: false, humorist: true }).humorist, true);
  for (const message of [
    { nick: "Laurent Bafouille", isBot: true },
    { nick: "MomoMotus", isBot: true },
    { meta: { category: "humorist", kind: "ambient_bot_chat" } },
    { meta: { category: "hidden_word", kind: "ambient_bot_chat" } },
    { installId: "ambient-bot:hidden_word" },
  ]) {
    assert.equal(getChatBotVisibilityKey(message), "humorist");
    assert.equal(shouldDisplayChatMessageForBotSettings(message, true, visibility), false);
  }
});
