import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("auth account owner contains connection and synchronization lifecycle", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const ownerSource = read(
    "../../src/features/auth/useAuthAccountController.js"
  );

  assert.match(applicationSource, /useAuthAccountController/);
  assert.doesNotMatch(applicationSource, /createAuthAccountController/);
  assert.doesNotMatch(applicationSource, /socketConnectPromiseRef/);
  assert.doesNotMatch(
    applicationSource,
    /if \(!isAuthServerUnavailable\) return;[\s\S]{0,160}setTimeout/
  );
  assert.match(ownerSource, /createAuthAccountController/);
  assert.match(ownerSource, /socketConnectPromiseRef = React\.useRef/);
  assert.match(ownerSource, /void refreshAuthStatus\(\)/);
  assert.match(ownerSource, /isAuthServerUnavailable/);
  assert.match(ownerSource, /socket\.disconnect\(\)/);
  assert.match(ownerSource, /legacy_profile_found/);
  assert.match(ownerSource, /mustResetPassword/);
});
