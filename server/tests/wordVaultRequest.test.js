import assert from "node:assert/strict";
import test from "node:test";

import { postWordVaultAddWithRetry } from "../../src/utils/wordVaultRequest.js";

test("relance une fois un ajout du coffre après HTTP 502", async () => {
  const responses = [
    { ok: false, status: 502 },
    { ok: true, status: 200, data: { ok: true } },
  ];
  let callCount = 0;
  const postAuthJson = async () => responses[callCount++];

  const response = await postWordVaultAddWithRetry(
    postAuthJson,
    "/api/vault/words",
    "TEST",
    { retryDelayMs: 0 }
  );

  assert.equal(callCount, 2);
  assert.equal(response.status, 200);
});

test("relance une fois un ajout du coffre après HTTP 503", async () => {
  let callCount = 0;
  const postAuthJson = async () => ({
    ok: callCount++ > 0,
    status: callCount > 1 ? 200 : 503,
  });

  const response = await postWordVaultAddWithRetry(
    postAuthJson,
    "/api/vault/words",
    "TEST",
    { retryDelayMs: 0 }
  );

  assert.equal(callCount, 2);
  assert.equal(response.status, 200);
});

test("ne relance pas les autres erreurs HTTP", async () => {
  let callCount = 0;
  const postAuthJson = async () => {
    callCount += 1;
    return { ok: false, status: 500 };
  };

  const response = await postWordVaultAddWithRetry(
    postAuthJson,
    "/api/vault/words",
    "TEST",
    { retryDelayMs: 0 }
  );

  assert.equal(callCount, 1);
  assert.equal(response.status, 500);
});

test("conserve la relance après un timeout", async () => {
  let callCount = 0;
  const postAuthJson = async () => {
    callCount += 1;
    if (callCount === 1) throw new Error("request_timeout");
    return { ok: true, status: 200 };
  };

  const response = await postWordVaultAddWithRetry(
    postAuthJson,
    "/api/vault/words",
    "TEST",
    { retryDelayMs: 0 }
  );

  assert.equal(callCount, 2);
  assert.equal(response.status, 200);
});
