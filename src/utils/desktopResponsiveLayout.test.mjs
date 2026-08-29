import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_UI_SCALE_MIN,
  clampDesktopColumnResizeDelta,
  computeDesktopColumnTrackWidth,
  computeDesktopColumnUiScales,
  computeDesktopGridFillMinHeight,
  computeDesktopGridChrome,
  computeDesktopGridResizeMaxTrackWidth,
  computeDesktopResponsiveBaseHeight,
  computeDesktopUiScale,
  computeDesktopViewportHeight,
  shouldUseMobileLayout,
} from "./desktopResponsiveLayout.js";

test("keeps desktop layout when browser zoom narrows a fine-pointer viewport", () => {
  assert.equal(
    shouldUseMobileLayout({
      finePointer: true,
      viewportHeight: 270,
      viewportWidth: 480,
    }),
    false
  );
});

test("keeps compact touch viewports on the mobile layout", () => {
  assert.equal(
    shouldUseMobileLayout({
      coarsePointer: true,
      touchCapable: true,
      viewportHeight: 780,
      viewportWidth: 390,
    }),
    true
  );
});

test("keeps hybrid coarse-pointer phones mobile even when a fine pointer exists", () => {
  assert.equal(
    shouldUseMobileLayout({
      coarsePointer: true,
      finePointer: true,
      touchCapable: true,
      viewportHeight: 780,
      viewportWidth: 390,
    }),
    true
  );
});

test("fits desktop height to the viewport without reintroducing a scroll floor", () => {
  assert.equal(
    computeDesktopViewportHeight({
      bottomInset: 16,
      hostTop: 40,
      viewportHeight: 220,
    }),
    164
  );
  assert.equal(
    computeDesktopViewportHeight({
      bottomInset: 16,
      hostTop: 40,
      viewportHeight: 50,
    }),
    1
  );
});

test("does not treat an unmeasured lazy desktop scene as a one-pixel column", () => {
  assert.equal(
    computeDesktopResponsiveBaseHeight({
      isMobileLayout: false,
      measuredHeight: null,
      minHeight: 1,
    }),
    0
  );
  assert.equal(
    computeDesktopResponsiveBaseHeight({
      isMobileLayout: false,
      measuredHeight: 640,
      minHeight: 1,
    }),
    640
  );
});

test("keeps the full scale when the desktop has enough room", () => {
  assert.equal(computeDesktopUiScale({ hostWidth: 1600, columnHeight: 760 }), 1);
});

test("uses the most constrained axis during browser zoom", () => {
  const scale = computeDesktopUiScale({ hostWidth: 960, columnHeight: 430 });
  assert.equal(scale, 430 / 700);
});

test("clamps extreme zoom to a still legible scale", () => {
  assert.equal(
    computeDesktopUiScale({ hostWidth: 400, columnHeight: 250 }),
    DESKTOP_UI_SCALE_MIN
  );
});

test("uses the narrower daily layout as its reference", () => {
  assert.equal(
    computeDesktopUiScale({ hostWidth: 1100, columnHeight: 700, isDailyPlay: true }),
    1
  );
});

test("shrinks grid chrome with the same factor", () => {
  assert.deepEqual(computeDesktopGridChrome(0.5), {
    columnGap: 6.24,
    columnPadding: 8.32,
    countdownBarHeight: 40,
    previewBarHeight: 32,
    validationBarHeight: 56,
    validationPadding: 8,
  });
});

test("adds a local scale when one resizable column is narrower", () => {
  const scales = computeDesktopColumnUiScales({
    columnDefs: [
      { id: "players", defaultFraction: 1 },
      { id: "grid", defaultFraction: 2 },
      { id: "chat", defaultFraction: 1 },
    ],
    columnFractions: [0.35, 0.55, 0.1],
    columnOrder: ["players", "grid", "chat"],
    gapPx: 24,
    globalScale: 1,
    hostWidth: 1440,
  });

  assert.equal(scales.players, 1);
  assert.equal(scales.grid, 1);
  assert.equal(scales.chat, DESKTOP_UI_SCALE_MIN);
});

test("reserves enough column height for the grid to fill its track width", () => {
  const gridChrome = computeDesktopGridChrome(0.52);
  assert.equal(
    computeDesktopGridFillMinHeight({
      columnFractions: [0.2, 0.4, 0.2, 0.2],
      columnOrder: ["players", "grid", "side", "chat"],
      gapPx: 16,
      gridChrome,
      hostWidth: 960,
    }),
    474
  );
});

test("does not let a custom oversized grid track increase the reserved height", () => {
  const gridChrome = computeDesktopGridChrome(1);
  assert.equal(
    computeDesktopGridFillMinHeight({
      columnFractions: [0.1, 0.7, 0.1, 0.1],
      columnOrder: ["players", "grid", "side", "chat"],
      gapPx: 24,
      gridChrome,
      hostWidth: 1440,
      maxTrackWidth: 500,
    }),
    696
  );
});

test("caps grid track growth to the available column height", () => {
  const gridChrome = computeDesktopGridChrome(1);
  assert.equal(
    computeDesktopGridResizeMaxTrackWidth({
      columnHeight: 700,
      gridChrome,
    }),
    516
  );
});

test("stops a separator when its right-hand grid reaches its maximum width", () => {
  assert.equal(
    clampDesktopColumnResizeDelta({
      delta: -100,
      leftMin: 150,
      leftStart: 240,
      rightMax: 500,
      rightMin: 300,
      rightStart: 460,
    }),
    -40
  );
});

test("computes a track width independently from column order", () => {
  assert.equal(
    computeDesktopColumnTrackWidth({
      columnFractions: [0.25, 0.5, 0.25],
      columnId: "grid",
      columnOrder: ["chat", "grid", "players"],
      gapPx: 20,
      hostWidth: 1040,
    }),
    500
  );
});
