import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { createFeatureStore } from "../../src/app/core/createFeatureStore.js";
import { createInitialStatsState } from "../../src/features/stats/createStatsFeature.js";
import StatsApplication from "../../src/features/stats/StatsApplication.jsx";
import * as config from "../../src/features/stats/statsConfig.js";
import "../../src/index.css";

const noop = () => {};
const weekStartTs = Date.parse("2026-10-05T00:00:00+02:00");
const top3Index = () => config.WEEKLY_STATS_BOARDS.findIndex(board => board.key === "top3");
const rows = [
  { playerKey: "user:9101", userId: 9101, nick: "Alice", percentage: 100, top3Count: 3, roundsPlayed: 3 },
  { playerKey: "user:9102", userId: 9102, nick: "Camille", percentage: 75, top3Count: 6, roundsPlayed: 8 },
  { playerKey: "install:fixture-self", nick: "Tigre", percentage: 40, top3Count: 2, roundsPlayed: 5 },
  { playerKey: "user:9104", userId: 9104, nick: "AlexandreTrèsLongPseudonyme", percentage: 0, top3Count: 0, roundsPlayed: 4 },
];
function payload(scenario = "normal") {
  return {
    weekStartTs, topN: 50,
    top3TrackingStartTs: scenario === "old" ? null : weekStartTs + (scenario === "partial" ? 86400000 : 0),
    boards: {
      totalScore: [{ playerKey: "install:fixture-self", nick: "Tigre", totalScore: 2350, roundsPlayed: 5 }],
      vocab: [{ playerKey: "install:fixture-self", nick: "Tigre", vocabCount: 1250 }],
      weeklyVocab: [{ playerKey: "install:fixture-self", nick: "Tigre", weeklyVocabCount: 80 }],
      top3: Object.fromEntries((config.WEEKLY_TOP3_ROUND_TYPES || []).map((type, index) => [type.key,
        ["empty", "loading", "error", "old"].includes(scenario) ? [] : rows.map(row => ({ ...row,
          ...(row.nick === "Tigre" ? { top3Count: index + 2, roundsPlayed: index + 5 } : {}) }))])),
    },
  };
}
const store = createFeatureStore({ ...createInitialStatsState(), stats: payload(), activeIndex: Math.max(0, top3Index()) });
const feature = { store, set: store.set, patch: store.patch };
const kernel = { features: { prepare: key => {
  if (key !== "stats") throw new Error(`Unexpected fixture feature ${key}`);
  return feature;
}, acquire: () => ({ release() {} }) } };
let profile = null;
let closes = 0;
const rect = element => {
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
};
function App() {
  const [open, setOpen] = React.useState(true);
  const [dark, setDark] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  window.weeklyTop3Fixture = {
    reset(scenario = "normal", darkMode = false) {
      profile = null;
      closes = 0;
      flushSync(() => {
        store.replace({ ...createInitialStatsState(), stats: payload(scenario), activeIndex: Math.max(0, top3Index()),
          loading: scenario === "loading", error: scenario === "error" ? "fixture_error" : "" });
        setOpen(true); setDark(darkMode); setRevision(value => value + 1);
      });
    },
    snapshot() {
      const panel = document.querySelector(".stats-panel");
      const select = document.querySelector('select[aria-label="Type de manche"]') || document.querySelector("select");
      const content = select?.closest(".stats-board-content");
      const scroll = content?.querySelector('[data-stats-scroll="true"]');
      return { activeIndex: store.getState().activeIndex, tab: store.getState().tab,
        title: document.querySelector(".fantasy-panel-title")?.textContent, selected: select?.value,
        options: Array.from(select?.options || []).map(option => ({ value: option.value, label: option.text })),
        text: content?.innerText || "", panel: rect(panel), select: rect(select), scroll: rect(scroll),
        rows: Array.from(scroll?.children || []).map(row => ({ text: row.innerText, rect: rect(row) })),
        scrollWidth: scroll?.scrollWidth, scrollClientWidth: scroll?.clientWidth,
        documentWidth: document.documentElement.scrollWidth, innerWidth, innerHeight, profile, closes };
    },
    top3Index,
  };
  return <>
    <main style={{ padding: 24 }}><h1>Top 3 hebdomadaire</h1><p>Données de test en mémoire, aucun serveur de jeu.</p></main>
    {open && <StatsApplication key={revision}
      appearance={{ darkMode: dark, menuDarkMode: dark, isMobileLayout: innerWidth < 700 }}
      blockers={{ keyboardBlocked: false }} identity={{ installId: "fixture-self", selfNick: "Tigre" }}
      navigation={{ onClose: () => { closes++; setOpen(false); } }}
      presentation={{ getImageUrl: key => `/vocab-ranks/${key.replace("img_vocab_", "")}.png`,
        getUserIdFromPlayerProfileTarget: entry => entry.userId || null,
        isCrownedEntry: () => false, openDefinition: noop, openPlayerProfile: value => { profile = value; },
        playCloseSound: noop, playSwipeSound: noop, renderCrownIcon: () => null,
        renderVocabPanel: () => <p>Progression personnelle</p> }}
      requests={{ fetchWeeklyStats: noop, requestTrophyStatus: noop }}
      statsConfig={{ weeklyBoards: config.WEEKLY_STATS_BOARDS, weeklyBoardDisplayLimit: 50, seasonTargetLimit: 200 }} />}
  </>;
}
createRoot(document.getElementById("root")).render(<ApplicationRuntimeProvider kernel={kernel}><App /></ApplicationRuntimeProvider>);
