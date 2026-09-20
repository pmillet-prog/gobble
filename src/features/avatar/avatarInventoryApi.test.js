import test from "node:test";
import assert from "node:assert/strict";
import { requestAvatarInventory, purchaseAvatarItems } from "./avatarInventoryApi.js";

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
