import test from "node:test";
import assert from "node:assert/strict";
import { getDisplayModeSnapshot, HOME_DISPLAY_ACTIONS, requestDocumentFullscreen } from "./displayMode.js";

function snapshot({ ua = "Android Chrome", wrapper = false, standalone = false, fullscreen = false, fullscreenDisplay = false, supported = true } = {}) {
  return getDisplayModeSnapshot({
    navigatorObject: { userAgent: ua },
    windowObject: { matchMedia: query => ({ matches: query === "(display-mode: standalone)" ? standalone : fullscreenDisplay }) },
    documentObject: {
      referrer: wrapper ? "android-app://fr.gobble.twa" : "",
      fullscreenElement: fullscreen ? {} : null,
      fullscreenEnabled: supported,
      documentElement: supported ? { requestFullscreen() {} } : {},
    },
  });
}

test("Android wrappers and installed apps never offer a fullscreen button", () => {
  for (const options of [{ wrapper: true }, { standalone: true }, { wrapper: true, standalone: true }]) {
    assert.equal(snapshot(options).homeAction, HOME_DISPLAY_ACTIONS.none);
    assert.equal(snapshot({ ...options, fullscreen: true }).homeAction, HOME_DISPLAY_ACTIONS.none);
    assert.equal(snapshot({ ...options, fullscreenDisplay: true }).homeAction, HOME_DISPLAY_ACTIONS.none);
    assert.equal(snapshot({ ...options, supported: false }).homeAction, HOME_DISPLAY_ACTIONS.none);
  }
  assert.equal(snapshot({ ua: "Mozilla/5.0 (Linux; Android 16; Phone; wv) Version/4.0 Chrome/134.0 Mobile Safari/537.36" }).homeAction, HOME_DISPLAY_ACTIONS.none);
  assert.equal(snapshot().homeAction, HOME_DISPLAY_ACTIONS.enterFullscreen);
});

test("desktop and iPhone keep their existing fullscreen and installation actions", () => {
  assert.equal(snapshot({ ua: "Windows Chrome" }).homeAction, HOME_DISPLAY_ACTIONS.enterFullscreen);
  assert.equal(snapshot({ ua: "Windows Chrome", standalone: true }).homeAction, HOME_DISPLAY_ACTIONS.none);
  assert.equal(snapshot({ ua: "iPhone Safari" }).homeAction, HOME_DISPLAY_ACTIONS.iosInstall);
  assert.equal(snapshot({ ua: "iPhone Safari", standalone: true }).homeAction, HOME_DISPLAY_ACTIONS.none);
});

test("fullscreen reports missing APIs and browser refusals without claiming success", async () => {
  assert.equal(await requestDocumentFullscreen({ documentElement: {} }), false);
  const denied = new DOMException("Fullscreen denied", "NotAllowedError");
  await assert.rejects(requestDocumentFullscreen({ documentElement: { requestFullscreen: () => Promise.reject(denied) } }), denied);
});
