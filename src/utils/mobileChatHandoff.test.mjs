import test from "node:test";
import assert from "node:assert/strict";

import { hasActiveChatDraft } from "./mobileChatHandoff.js";

test("hasActiveChatDraft preserves only a non-empty draft", () => {
  assert.equal(hasActiveChatDraft("un message"), true);
  assert.equal(hasActiveChatDraft("  un message  "), true);
  assert.equal(hasActiveChatDraft(""), false);
  assert.equal(hasActiveChatDraft("   "), false);
  assert.equal(hasActiveChatDraft(null), false);
});
