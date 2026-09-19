import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

test("daily hub renders every section without legacy helpers", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const [
      { default: DailyHubScreen },
      { DAILY_MONSTROUS_MODE, DAILY_OVERVIEW_SECTION },
    ] = await Promise.all([
      vite.ssrLoadModule("/src/components/daily/DailyHubScreen.jsx"),
      vite.ssrLoadModule("/src/components/daily/dailyModes.js"),
    ]);
    const noOp = () => {};
    const markup = renderToString(
      React.createElement(DailyHubScreen, {
        actions: {
          closeDailyLaunchDialog: noOp,
          confirmDailyLaunch: noOp,
          openDailyLaunchDialog: noOp,
          openDefinition: noOp,
          setAppView: noOp,
          setDailyHistoryIndex: noOp,
          setDailyRankingView: noOp,
          setDailySection: noOp,
        },
        daily: {
          dailyBoard: { battle: null, error: "", ready: true },
          dailyEntries: [],
          dailyHistory: { crownTotals: [], days: [] },
          dailyHistoryError: "",
          dailyHistoryIndex: 0,
          dailyHistoryLoading: false,
          dailyHistoryScrollRef: { current: null },
          dailyLaunchDialog: { mode: DAILY_MONSTROUS_MODE },
          dailyRankingView: "today",
          dailyResult: null,
          dailySection: DAILY_OVERVIEW_SECTION,
          dailyStartError: "",
          dailyStatus: {
            dateId: "2026-09-04",
            error: "",
            ready: true,
          },
          dailySubmitError: "",
          duelStatus: null,
        },
        identity: { installId: "", selfNick: "" },
        preparation: {
          shouldPrepareDailyOrDuelStandaloneView: true,
          shouldPrepareDailyStandaloneView: true,
        },
        renderers: {
          renderCrownIcon: () => null,
          renderGobbleBadge: () => null,
          renderHumanDot: () => null,
        },
        view: {
          appView: "daily",
          darkMode: false,
          isMobileLayout: false,
          menuDarkMode: false,
        },
      }),
    );

    assert.match(markup, /Grilles du jour/);
    assert.match(markup, /Lancer/);
    assert.match(markup, /Grille monstrueuse/);
    assert.match(markup, /Monstrueuse/);
    assert.match(markup, /Faux jumeaux/);
  } finally {
    await vite.close();
  }
});
