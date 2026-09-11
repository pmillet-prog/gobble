import assert from "node:assert/strict";
import test from "node:test";

import { getClientDeviceKind } from "../realtime/clientDeviceKind.js";

test("mobile user agents and client hints are recognized", () => {
  assert.equal(getClientDeviceKind({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" }), "mobile");
  assert.equal(getClientDeviceKind({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel)" }), "mobile");
  assert.equal(getClientDeviceKind({ mobileHint: "?1", userAgent: "Mozilla/5.0 (Macintosh)" }), "mobile");
});

test("desktop user agents stay desktop", () => {
  assert.equal(getClientDeviceKind({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }), "desktop");
});
