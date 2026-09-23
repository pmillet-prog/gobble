import assert from "node:assert/strict";
import test from "node:test";

import {
  computeChatKeyboardSessionTransition,
  computeChatViewportLayout,
  readChatViewportSnapshot,
} from "./useChatViewport.js";

test("closes the chat instead of expanding it after keyboard dismissal", () => {
  const initial = computeChatKeyboardSessionTransition({
    isChatOpen: true,
    keyboardOpen: false,
    keyboardWasOpen: false,
  });
  assert.deepEqual(initial, {
    keyboardWasOpen: false,
    shouldCloseChat: false,
  });

  const focused = computeChatKeyboardSessionTransition({
    isChatOpen: true,
    keyboardOpen: true,
    keyboardWasOpen: initial.keyboardWasOpen,
  });
  assert.deepEqual(focused, {
    keyboardWasOpen: true,
    shouldCloseChat: false,
  });

  const dismissed = computeChatKeyboardSessionTransition({
    isChatOpen: true,
    keyboardOpen: false,
    keyboardWasOpen: focused.keyboardWasOpen,
  });
  assert.deepEqual(dismissed, {
    keyboardWasOpen: false,
    shouldCloseChat: true,
  });
});

test("reads the visual viewport without mutating the document layout", () => {
  const snapshot = readChatViewportSnapshot(
    {
      innerHeight: 844,
      innerWidth: 390,
      visualViewport: {
        height: 478,
        offsetLeft: 0,
        offsetTop: 42,
        width: 390,
      },
    },
    {
      activeElement: { tagName: "TEXTAREA" },
      documentElement: { clientHeight: 844, clientWidth: 390 },
    }
  );

  assert.deepEqual(snapshot, {
    keyboardFocused: true,
    layoutHeight: 844,
    offsetLeft: 0,
    offsetTop: 42,
    viewportHeight: 478,
    viewportWidth: 390,
  });
});

test("falls back to the resized layout viewport in older Android WebViews", () => {
  const snapshot = readChatViewportSnapshot(
    { innerHeight: 512, innerWidth: 360 },
    {
      activeElement: { tagName: "INPUT" },
      documentElement: { clientHeight: 512, clientWidth: 360 },
    }
  );

  assert.deepEqual(snapshot, {
    keyboardFocused: true,
    layoutHeight: 512,
    offsetLeft: 0,
    offsetTop: 0,
    viewportHeight: 512,
    viewportWidth: 360,
  });
});

test("uses page coordinates when WebKit reports a stale visual offset", () => {
  const snapshot = readChatViewportSnapshot(
    {
      innerHeight: 844,
      innerWidth: 390,
      pageYOffset: 12,
      visualViewport: {
        height: 478,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 54,
        width: 390,
      },
    },
    {
      activeElement: { tagName: "TEXTAREA" },
      documentElement: { clientHeight: 844, clientWidth: 390 },
    }
  );

  assert.equal(snapshot.offsetTop, 42);
  assert.equal(snapshot.offsetLeft, 0);
});

test("keeps the overlay and sheet above keyboards of different heights", () => {
  for (const viewportHeight of [560, 478, 360]) {
    const layout = computeChatViewportLayout({
      baselineHeight: 844,
      keyboardFocused: true,
      offsetTop: 42,
      topInsetPx: 52,
      viewportHeight,
      viewportWidth: 390,
    });

    assert.equal(layout.keyboardOpen, true);
    assert.equal(layout.keyboardVisible, true);
    assert.equal(layout.overlayStyle.top, "42px");
    assert.equal(layout.overlayStyle.height, `${viewportHeight}px`);
    const expectedHeight = Math.min(490, viewportHeight - 52);
    assert.equal(layout.sheetStyle.height, `${expectedHeight}px`);
    assert.equal(layout.keyboardConstrained, viewportHeight - 52 < 490);
    assert.ok(
      42 + 52 + Number.parseInt(layout.sheetStyle.height, 10) <=
        42 + viewportHeight
    );
  }
});

test("never expands the drawer during the first frames of keyboard animation", () => {
  const layout = computeChatViewportLayout({
    baselineHeight: 844,
    keyboardFocused: true,
    offsetTop: 0,
    topInsetPx: 0,
    viewportHeight: 700,
    viewportWidth: 390,
  });

  assert.equal(layout.keyboardVisible, true);
  assert.equal(layout.keyboardConstrained, false);
  assert.equal(layout.sheetStyle.height, "490px");
});

test("keeps the existing nominal drawer height while the keyboard is closed", () => {
  const layout = computeChatViewportLayout({
    baselineHeight: 844,
    keyboardFocused: false,
    offsetTop: 0,
    topInsetPx: 0,
    viewportHeight: 844,
    viewportWidth: 390,
  });

  assert.equal(layout.keyboardOpen, false);
  assert.equal(layout.keyboardVisible, false);
  assert.equal(layout.keyboardConstrained, false);
  assert.equal(layout.keyboardInsetPx, 0);
  assert.equal(layout.sheetStyle.height, "490px");
});

test("keeps the home chat below the iPhone status bar without fullscreen", () => {
  const layout = computeChatViewportLayout({
    baselineHeight: 844, viewportHeight: 797, viewportWidth: 390,
    safeAreaTopPx: 47, topInsetPx: 0,
  });
  assert.equal(layout.overlayStyle.paddingTop, "47px");
  assert.equal(layout.sheetStyle.height, "490px");
  assert.equal(layout.keyboardVisible, false, "a status-bar-sized gap is not a keyboard");
});

test("safe areas and the game header overlap instead of adding two top margins", () => {
  const layout = computeChatViewportLayout({
    baselineHeight: 844, viewportHeight: 844, viewportWidth: 390,
    safeAreaTopPx: 47, topInsetPx: 103,
  });
  assert.equal(layout.overlayStyle.paddingTop, "103px");
});

test("safe-area protection keeps the input above the keyboard throughout viewport panning", () => {
  for (const offsetTop of [0, 24, 47, 80]) {
    for (const viewportHeight of [700, 478, 320]) {
      const layout = computeChatViewportLayout({
        baselineHeight: 844, viewportHeight, viewportWidth: 390,
        keyboardFocused: true, safeAreaTopPx: 47, offsetTop,
      });
      const inset = Number.parseInt(layout.overlayStyle.paddingTop, 10);
      const height = Number.parseInt(layout.sheetStyle.height, 10);
      assert.ok(offsetTop + inset >= 47, "the header stays below the status bar");
      assert.ok(inset + height <= viewportHeight, "the input stays in the visible viewport");
      assert.ok(height <= 490, "keyboard animation never expands the drawer");
    }
  }
});

test("a browser that already reserves the status bar gets no additional top margin", () => {
  const layout = computeChatViewportLayout({
    baselineHeight: 797, viewportHeight: 797, viewportWidth: 390,
    safeAreaTopPx: 0,
  });
  assert.equal(layout.overlayStyle.paddingTop, "0px");
});
