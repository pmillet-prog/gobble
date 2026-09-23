import test from "node:test";
import assert from "node:assert/strict";
import { createAccountAvatarSync } from "./createAccountAvatarSync.js";
import { createBlankAvatar } from "./avatarState.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test("a refund waits for old reads and updates the account, local cache and PNG revision immediately", async t => {
  const oldRead = deferred(), refund = deferred(), accepted = [], cached = [];
  let refundCalls = 0;
  const store = createAccountAvatarSync({ request: () => oldRead.promise,
    requestRefund: async () => { refundCalls++; return refund.promise; },
    readLocal: () => null, cacheLocal: (id, value) => cached.push([id, value]), onAccepted: value => accepted.push(value),
  });
  t.after(store.connect(1));
  const task = store.refundPurchases(1, "receipt");
  assert.equal(refundCalls, 0);
  await assert.rejects(store.save(1, createBlankAvatar(), 0));
  oldRead.resolve({ userId: 1, avatar: createBlankAvatar(), revision: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refundCalls, 1);
  const refresh = store.refresh();
  refund.resolve({ refunded: 500, inventory: { userId: 1, balance: 500 }, avatarSnapshot: { userId: 1, avatar: null, revision: 2 } });
  assert.equal((await task).refunded, 500);
  assert.equal((await refresh).avatar, null);
  assert.deepEqual(store.getSnapshot(), { userId: 1, avatar: null, revision: 2, ready: true });
  assert.deepEqual(cached.at(-1), [1, null]);
  assert.equal(accepted.at(-1).revision, 2);
});

test("an old refund response cannot reset a newly connected account", async t => {
  const refund = deferred();
  const store = createAccountAvatarSync({ request: async userId => ({ userId, avatar: null, revision: 0, unlocksRequired: true }),
    requestRefund: () => refund.promise, readLocal: () => null, cacheLocal() {},
  });
  store.connect(1);
  await store.refresh();
  const task = store.refundPurchases(1, "receipt");
  t.after(store.connect(2));
  await store.refresh();
  refund.resolve({ avatarSnapshot: { userId: 1, avatar: null, revision: 2 } });
  await assert.rejects(task, { code: "avatar_account_changed" });
  assert.equal(store.getSnapshot().userId, 2);
  assert.equal(store.getSnapshot().revision, 0);
});
