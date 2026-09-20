import test from "node:test";
import assert from "node:assert/strict";
import { playerProfileUserId, resolvePlayerProfileTarget } from "./playerProfileTarget.js";
import { getChatUserMenuPosition } from "../../components/chat/chatUserMenuLayout.js";
import { createChatInteractionController } from "../../components/chat/createChatInteractionController.js";

test("profile identity follows account ID, legacy keys and known roster without treating bots as people", () => {
  assert.equal(playerProfileUserId({ userId: "7" }), 7);
  assert.equal(playerProfileUserId({ installId: "8" }), 8);
  assert.equal(playerProfileUserId({ playerKey: "install:9" }), 9);
  assert.equal(playerProfileUserId({ userId: 7, isBot: true }), null);
  assert.equal(playerProfileUserId({ installId: "dev-bot:Tigre" }), null);
  assert.deepEqual(resolvePlayerProfileTarget({ nick: "TIGRE" }, [[{ nick: "Tigre", userId: 7 }]]), { nick: "TIGRE", userId: 7 });
});
test("large chat actions stay in view near every edge on desktop and phones", () => {
  for (const width of [320, 390, 1440]) for (const height of [568, 900]) {
    for (const left of [0, width - 30]) for (const top of [0, height - 20]) {
      const menu = getChatUserMenuPosition({ left, top, width: 30, height: 20 }, width, height);
      assert.ok(menu.left >= 12 && menu.left + 280 <= width - 12);
      assert.ok(menu.top >= 12 && menu.top + 294 <= height - 12);
    }
  }
});

test("chat menus open for self and userId-only authors while keeping self moderation unavailable", t => {
  const originalWindow = globalThis.window;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
  const menus = [];
  const runtime = Array.from({ length: 39 }, () => () => {});
  runtime[29] = menu => menus.push(menu);
  runtime[33] = value => Number(value) > 0 ? Number(value) : null;
  runtime[34] = "7";
  const openMenu = createChatInteractionController(runtime)[18];
  const event = { preventDefault() {}, stopPropagation() {}, currentTarget: { getBoundingClientRect: () => ({ left: 1300, top: 800, width: 60, height: 24 }) } };
  openMenu(event, { nick: "Moi", userId: 7, installId: "7" });
  openMenu(event, { nick: "Autre", userId: 8 });
  openMenu(event, { nick: "Autre", userId: 8, installId: "8" });
  openMenu(event, { nick: "Bot", installId: "dev-bot:Bot" });
  assert.deepEqual(menus.map(menu => [menu.userId, menu.canModerate]), [[7, false], [8, false], [8, true]]);
});
