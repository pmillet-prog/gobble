import test from "node:test";
import assert from "node:assert/strict";
import { createChatAvatarRevisions } from "./chatAvatarRevisions.js";

test("all messages by one player share a URL; only that player's edit refreshes their images", () => {
  const store = createChatAvatarRevisions();
  let first = 0, duplicate = 0, other = 0;
  const stop = store.subscribe(1, () => first++);
  store.subscribe(1, () => duplicate++);
  store.subscribe(2, () => other++);
  assert.equal(store.url(1), store.url("1"));
  assert.equal(store.url(null), "");
  store.update({ userId: 1, revision: 2 });
  assert.equal(store.url(1), "/api/auth/avatars/1/chat.png?v=2");
  assert.deepEqual([first, duplicate, other], [1, 1, 0]);
  store.update({ userId: 1, revision: 1 });
  store.update({ userId: 1, revision: 2 });
  assert.deepEqual([first, duplicate, other], [1, 1, 0]);
  stop();
  store.update({ userId: 1, revision: 3 });
  assert.deepEqual([first, duplicate, other], [1, 2, 0]);
});

test("reconnecting refreshes only history participants, recovering missed avatar edits", () => {
  const store = createChatAvatarRevisions();
  store.update({ userId: 1, revision: 3 });
  const before = store.url(1), other = store.url(2);
  store.refresh([1, 1]);
  assert.notEqual(store.url(1), before);
  assert.equal(store.url(2), other);
  const after = store.url(1);
  store.refresh([1]);
  assert.notEqual(store.url(1), after);
});
