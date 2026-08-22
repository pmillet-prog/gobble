import assert from "node:assert/strict";
import test from "node:test";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createChatFeature } from "./createChatFeature.js";

function createMemoryStorage() {
  const values = new Map();
  const writes = [];
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
      writes.push({ key, value });
    },
    writes,
  };
}

test("chat persistence ignores transient input and unread state", () => {
  const storage = createMemoryStorage();
  const scope = createResourceScope("chat-test");
  const chat = createChatFeature({ scope }, { storage });
  chat.start();

  chat.set("input", "b");
  chat.set("input", "bo");
  chat.set("mobileUnreadCount", 4);

  assert.equal(storage.writes.length, 0);
  scope.dispose();
});

test("chat preferences persist only when their owned values change", () => {
  const storage = createMemoryStorage();
  const scope = createResourceScope("chat-test");
  const chat = createChatFeature({ scope }, { storage });
  chat.start();

  chat.set("showBotMessages", false);
  chat.set("activeArea", "chat");

  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0].value, "0");
  scope.dispose();
});
