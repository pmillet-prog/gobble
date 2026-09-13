import assert from "node:assert/strict";
import test from "node:test";
import { computeDesktopResizeMinimums, resizeDesktopColumns } from "./desktopColumnResize.js";
import { DAILY_DESKTOP_COLUMN_DEFS, LIVE_DESKTOP_COLUMN_DEFS } from "../app/adapters/desktopLayoutStorage.js";

test("an ordinary drag only changes its two neighbouring columns", () => {
  assert.deepEqual(resizeDesktopColumns({
    widths: [260, 420, 300, 300], minimumWidths: [220, 340, 260, 260], separatorIndex: 1, delta: 20,
  }), [260, 440, 280, 300]);
});

test("growing a column pushes past neighbours at their minimum without preparatory drags", () => {
  const widths = [220, 340, 260, 744];
  const minimumWidths = [220, 340, 260, 260];
  assert.deepEqual(resizeDesktopColumns({ widths, minimumWidths, separatorIndex: 0, delta: 80 }), [300, 340, 260, 664]);
  assert.deepEqual(resizeDesktopColumns({ widths, minimumWidths, separatorIndex: 0, delta: 1000 }), [704, 340, 260, 260]);
  assert.deepEqual(resizeDesktopColumns({ widths, minimumWidths, separatorIndex: 0, delta: 0 }), widths);
});

test("the same redistribution works when expanding a column to the left", () => {
  assert.deepEqual(resizeDesktopColumns({
    widths: [350, 220, 300, 250], minimumWidths: [220, 220, 260, 200], separatorIndex: 2, delta: -80,
  }), [310, 220, 260, 330]);
});

test("compact windows use the minimums of their compact UI instead of locking every column", () => {
  const hostWidth = 1003;
  const widths = [1.05, 1.6, .85, 1.05].map(f => f / 4.55 * (hostWidth - 36));
  const minimumWidths = computeDesktopResizeMinimums({
    widths, minimumWidths: [220, 340, 260, 260], hostWidth, columnHeight: 407,
  });
  const next = resizeDesktopColumns({ widths, minimumWidths, separatorIndex: 1, delta: -80 });
  assert.ok(Math.abs(next[2] - widths[2] - 80) < 1e-8);
  assert.ok(minimumWidths[1] < 200);
});

test("a previously saved narrow column does not jump at pointer-down or reverse the requested motion", () => {
  const widths = [180, 320, 190, 310];
  const minimumWidths = computeDesktopResizeMinimums({
    widths, minimumWidths: [220, 340, 260, 260], hostWidth: 1036, columnHeight: 800,
  });
  assert.deepEqual(resizeDesktopColumns({ widths, minimumWidths, separatorIndex: 1, delta: 0 }), widths);
  const next = resizeDesktopColumns({ widths, minimumWidths, separatorIndex: 1, delta: 10 });
  assert.ok(next[1] >= widths[1]);
  assert.ok(next[2] <= widths[2]);
});

test("the grid still stops growing when its height limit is reached", () => {
  const widths = [260, 340, 300, 300];
  const minimumWidths = [200, 250, 250, 250];
  assert.deepEqual(resizeDesktopColumns({ widths, minimumWidths, maximumWidths: [Infinity, 360], separatorIndex: 1, delta: 120 }), [260, 360, 280, 300]);
  assert.deepEqual(resizeDesktopColumns({ widths, minimumWidths, maximumWidths: [Infinity, 320], separatorIndex: 1, delta: 120 }), widths);
});

test("live and daily layouts preserve total width and limits for every separator and reordered columns", () => {
  for (const defs of [LIVE_DESKTOP_COLUMN_DEFS, [...LIVE_DESKTOP_COLUMN_DEFS].reverse(), DAILY_DESKTOP_COLUMN_DEFS]) {
    for (const hostWidth of [640, 1003, 1368, 1920]) {
      const contentWidth = hostWidth - 12 * (defs.length - 1);
      const total = defs.reduce((sum, def) => sum + def.defaultFraction, 0);
      const widths = defs.map(def => def.defaultFraction / total * contentWidth);
      const minimumWidths = computeDesktopResizeMinimums({
        widths, minimumWidths: defs.map(def => def.minWidthPx), hostWidth, columnHeight: 407, isDailyPlay: defs.length === 3,
      });
      for (let separatorIndex = 0; separatorIndex < widths.length - 1; separatorIndex++) {
        for (const delta of [-1000, -80, -1, 0, 1, 80, 1000]) {
          const next = resizeDesktopColumns({ widths, minimumWidths, separatorIndex, delta });
          assert.ok(Math.abs(next.reduce((sum, width) => sum + width, 0) - contentWidth) < 1e-8);
          next.forEach((width, index) => assert.ok(width >= minimumWidths[index] - 1e-8));
          const moved = next.slice(0, separatorIndex + 1).reduce((sum, width, index) => sum + width - widths[index], 0);
          assert.ok(Math.abs(moved) <= Math.abs(delta) + 1e-8);
          assert.ok(delta < 0 ? moved <= 1e-8 : moved >= -1e-8);
        }
      }
    }
  }
});
