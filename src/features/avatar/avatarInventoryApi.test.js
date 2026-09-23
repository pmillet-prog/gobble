import test from "node:test";
import assert from "node:assert/strict";
import { requestAvatarInventory, purchaseAvatarItems, requestAvatarRefundQuote, refundAvatarPurchases } from "./avatarInventoryApi.js";

test("avatar purchases preserve the actual server debit independently of the inventory read", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [], inventory = { userId: 42, balance: 750, owned: { "accessories:scar": true } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ ok: true, spent: options.method === "POST" ? 500 : undefined, inventory }) };
  };
  assert.deepEqual(await requestAvatarInventory(42), inventory);
  const items = [{ family: "accessories", id: "scar" }];
  const bought = await purchaseAvatarItems(42, items);
  assert.equal(bought.spent, 500);
  assert.equal(bought.inventory.balance, 750);
  assert.deepEqual(JSON.parse(calls[1].options.body), { userId: 42, items });
  assert.equal(calls[1].options.credentials, "include");
  for (const response of [
    { ok: false, error: "insufficient_funds", inventory },
    { ok: true, spent: 500, inventory: { ...inventory, userId: 99 } },
  ]) {
    globalThis.fetch = async () => ({ ok: response.ok, json: async () => response });
    await assert.rejects(purchaseAvatarItems(42, items));
  }
});

test("refunds submit only the account and confirmed receipt token, and surface updated quotes", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [], quote = { amount: 1437, itemCount: 2, token: "receipt" };
  const inventory = { userId: 42, balance: 20000, owned: {} };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => options.method === "GET" ? { ok: true, userId: 42, quote }
      : { ok: true, inventory, refunded: 1437, avatarSnapshot: { userId: 42, avatar: null, revision: 2 } } };
  };
  assert.deepEqual(await requestAvatarRefundQuote(42), quote);
  assert.equal(calls[0].url, "/api/auth/avatar/refund?userId=42");
  assert.equal((await refundAvatarPurchases(42, quote.token)).refunded, 1437);
  assert.equal(calls[1].url, "/api/auth/avatar/refund");
  assert.deepEqual(JSON.parse(calls[1].options.body), { userId: 42, refundToken: "receipt" });
  assert.equal(calls[1].options.credentials, "include");
  const changed = { amount: 2000, itemCount: 3, token: "new" };
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ ok: false, error: "avatar_refund_changed", quote: changed }) });
  await assert.rejects(refundAvatarPurchases(42, "receipt"), error => error.code === "avatar_refund_changed" && error.quote === changed);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, userId: 99, quote }) });
  await assert.rejects(requestAvatarRefundQuote(42), { code: "avatar_account_changed" });
});
