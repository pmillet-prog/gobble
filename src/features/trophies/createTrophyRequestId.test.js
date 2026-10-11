import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createTrophyRequestId } from "./createTrophyRequestId.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("native randomUUID remains preferred and receives its Crypto receiver", () => {
  const cryptoApi = {
    randomUUID() {
      assert.equal(this, cryptoApi);
      return "12345678-1234-4234-9234-123456789abc";
    },
    getRandomValues() { assert.fail("native UUID must not invoke the fallback"); },
  };
  assert.equal(createTrophyRequestId(cryptoApi), "12345678-1234-4234-9234-123456789abc");
});

test("HTTP-compatible crypto produces RFC4122 version and variant bits without discarding other random bits", () => {
  const cryptoApi = {
    getRandomValues(bytes) {
      assert.equal(this, cryptoApi);
      assert.ok(bytes instanceof Uint8Array);
      assert.equal(bytes.length, 16);
      return bytes.fill(255);
    },
  };
  assert.equal(cryptoApi.randomUUID, undefined);
  const id = createTrophyRequestId(cryptoApi);
  assert.equal(id, "ffffffff-ffff-4fff-bfff-ffffffffffff");
  assert.match(id, UUID_V4);
  assert.equal(createTrophyRequestId({ getRandomValues: bytes => bytes.map((_, index) => index) }),
    "00010203-0405-4607-8809-0a0b0c0d0e0f");
});

test("fallback obtains new cryptographic bytes for each independent grant", () => {
  const cryptoApi = { getRandomValues: bytes => webcrypto.getRandomValues(bytes) };
  const identifiers = Array.from({ length: 100 }, () => createTrophyRequestId(cryptoApi));
  assert.ok(identifiers.every(id => UUID_V4.test(id)));
  assert.equal(new Set(identifiers).size, identifiers.length);
});

test("absence of browser crypto reports a specific error instead of using a weak identifier", () => {
  for (const cryptoApi of [null, {}]) {
    assert.throws(() => createTrophyRequestId(cryptoApi), error => error.code === "crypto_unavailable");
  }
});
