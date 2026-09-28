import assert from "node:assert/strict";
import test from "node:test";
import { consumePasswordResetLink } from "./passwordResetLink.js";

test("reset secret is consumed and removed before any crash URL can be recorded", () => {
  const token = "a".repeat(64);
  const browser = { location: new URL(`https://gobble.fr/reset-password#token=${token}`), history: { replaceState(_state, _title, url) { browser.location = new URL(url, browser.location); } } };
  assert.deepEqual(consumePasswordResetLink(browser), { active: true, token });
  assert.equal(browser.location.href, "https://gobble.fr/reset-password");
  assert.deepEqual(consumePasswordResetLink(browser), { active: true, token: "" });
});

test("ordinary navigation is untouched; malformed recovery links contain no usable secret", () => {
  assert.deepEqual(consumePasswordResetLink(null), { active: false, token: "" });
  const browser = { location: { pathname: "/", hash: "#something" }, history: { replaceState() { assert.fail("not a reset URL"); } } };
  assert.deepEqual(consumePasswordResetLink(browser), { active: false, token: "" });
  browser.location.pathname = "/reset-password";
  browser.history.replaceState = () => {};
  assert.deepEqual(consumePasswordResetLink(browser), { active: true, token: "" });
});
