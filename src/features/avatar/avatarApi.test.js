import test from "node:test";
import assert from "node:assert/strict";
import { requestAccountAvatar } from "./avatarApi.js";
import { DEFAULT_AVATAR } from "./avatarState.js";

test("account transport bypasses caches and sends configuration with the authenticated session", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => ({ ok: true, userId: 42, avatar: DEFAULT_AVATAR, revision: 3 }) };
  };
  await requestAccountAvatar(42);
  await requestAccountAvatar(42, { avatar: DEFAULT_AVATAR, expectedRevision: 2 });
  assert.equal(calls[0].url, "/api/auth/avatar?userId=42");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].body), { userId: 42, avatar: DEFAULT_AVATAR, expectedRevision: 2 });
  for (const call of calls) {
    assert.equal(call.cache, "no-store");
    assert.equal(call.credentials, "include");
  }
});

test("transport reports auth, conflict, wrong-account and invalid responses as failures", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const code of ["auth_required", "avatar_conflict", "avatar_account_changed", "avatar_invalid"]) {
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ ok: false, error: code }) });
    await assert.rejects(requestAccountAvatar(42), { code });
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, userId: 43, avatar: DEFAULT_AVATAR, revision: 1 }) });
  await assert.rejects(requestAccountAvatar(42), { code: "avatar_account_changed" });
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw Error("HTML fallback"); } });
  await assert.rejects(requestAccountAvatar(42), { code: "avatar_unavailable" });
});

test("account disconnect aborts the pending network request", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController();
  let requestSignal;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    requestSignal = signal;
    signal.addEventListener("abort", () => reject(Error("aborted")), { once: true });
  });
  const pending = requestAccountAvatar(42, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending);
  assert.equal(requestSignal.aborted, true);
});
