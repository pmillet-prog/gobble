import test from "node:test";
import assert from "node:assert/strict";

import {
  getChatBotVisibilityKey,
  normalizeChatBotVisibility,
  shouldDisplayChatMessageForBotSettings,
} from "./chatBotVisibility.js";

test("chat bot visibility resolves explicit categories and known nicknames", () => {
  assert.equal(getChatBotVisibilityKey({ meta: { category: "coach" } }), "coach");
  assert.equal(getChatBotVisibilityKey({ nick: "GrosRobert", isBot: true }), "linguist");
  const visibility = normalizeChatBotVisibility({ linguist: false });
  assert.equal(
    shouldDisplayChatMessageForBotSettings({ nick: "GrosRobert", isBot: true }, true, visibility),
    false
  );
  assert.equal(shouldDisplayChatMessageForBotSettings({ nick: "Tigre" }, false, visibility), true);
});
