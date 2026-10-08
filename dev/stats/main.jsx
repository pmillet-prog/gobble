import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { createFeatureStore } from "../../src/app/core/createFeatureStore.js";
import { createInitialStatsState } from "../../src/features/stats/createStatsFeature.js";
import StatsApplication from "../../src/features/stats/StatsApplication.jsx";
import DuelWeekRecapOverlay from "../../src/components/DuelWeekRecapOverlay.jsx";
import { getStatsImageUrl } from "../../src/features/stats/statsPresentation.js";
import { WEEKLY_TOP3_ROUND_TYPES } from "../../src/features/stats/statsConfig.js";
import { getStatsNavigation } from "../../src/features/stats/statsNavigation.js";
import "../../src/index.css";

const noop = () => {};
const weekStartTs = Date.parse("2026-10-05T00:00:00+02:00");
const people = ["AlexandreLeCollectionneurDeMotsTrèsLongs", "Camille du bout du monde", "Tigre", "À-la-recherche-du-mot-perdu", "Jeanne", "Lucien", "Léa", "Gobblina"].map((nick, index) => ({ userId: index + 9100, playerKey: `user:${index + 9100}`, nick }));
const hits = [
  ["foukro", "Jean-Bière FouKro", "/bots/foucault/stars.png"],
  ["lepers", "Julien Lechéper", "/bots/presenters/lepers/button.webp"],
  ["pivot", "Bernard Pinot", "/bots/presenters/pivot/button.webp"],
  ["romejko", "Laurent Rhum&Co", "/bots/presenters/romejko/button.webp"],
  ["capello", "Maître Gobbello", "/bots/presenters/capello/button.webp"],
  ["bafouille", "Laurent Bafouille", "/bots/presenters/bafouille/button.webp"],
].map(([presenterId, nick, portraitUrl], index) => ({ presenterId, nick, portraitUrl, hits: 1826 - index * 294 }));
function payload(scenario = "normal") {
  const rows = people.map((person, index) => ({ ...person,
    achievedAt: weekStartTs + (index + 1) * 1230000, total: 42 - index, gold: 20 - index, silver: 12, bronze: 10,
    roundsPlayed: 43 + index, wordsCount: 97 - index, totalScore: 45938 - index * 1050,
    pts: 898 - index * 75, len: 21 - index, ms: 2350 + index * 1537,
    word: ["ANTICONSTITUTIONNELLEMENT", "HEXAKOSIOIHEXEKONTAHEXAPHOBIE"][index % 2],
    gobbles: 512 - index * 12, doubleGobbles: 28 - index * 3,
    vocabCount: 14521 - index * 770, weeklyVocabCount: 851 - index * 50,
    correctCount: 142 - index * 12, points: index < 3 ? 4375 - index * 750 : -(index - 2) * 175,
  }));
  const empty = ["empty", "loading", "error", "old"].includes(scenario);
  const boards = Object.fromEntries(["weeklyVocab", "vocab", "medals", "mostWordsInGame", "totalScore", "bestWord", "longestWord", "bestSpecial3Score", "bestRoundScore", "bestTimeTargetLong", "bestTimeTargetScore", "mostGobbles", "qpugAnswers", "targetQuizPoints"].map(key => [key, empty ? [] : rows]));
  boards.presenterHits = empty ? [] : hits;
  boards.top3 = Object.fromEntries(WEEKLY_TOP3_ROUND_TYPES.map((type, typeIndex) => [type.key, empty ? [] : people.map((person, index) => ({ ...person, top3Count: 8 - index + typeIndex, roundsPlayed: 15 + typeIndex }))]));
  return { weekStartTs, topN: 200, boards,
    allTimeBoards: Object.fromEntries(["qpugAnswers", "targetQuizPoints", "gobbles", "doubleGobbles"].map(key => [key, empty ? [] : rows])),
    top3TrackingStartTs: scenario === "partial" ? weekStartTs + 2 * 86400000 : weekStartTs,
    trackingStartTs: { presenterHits: weekStartTs + 2 * 86400000, qpugAnswers: weekStartTs, targetQuizPoints: weekStartTs + 2 * 86400000 },
  };
}
const store = createFeatureStore({ ...createInitialStatsState(), stats: payload(), vocabWeeklyCount: 751 });
const feature = { store, set: store.set, patch: store.patch };
let profile = null, definition = null, closes = 0;
const kernel = { features: {
  prepare: key => key === "stats" ? feature : { openPlayerProfile: value => { profile = value; } },
  acquire: () => ({ release() {} }),
} };
const rect = el => { const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null; };
function firstLineRect(element) {
  if (!element) return null;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text;
  while ((text = walker.nextNode())) {
    const first = text.textContent.search(/\S/);
    if (first < 0) continue;
    const range = document.createRange();
    range.setStart(text, first); range.setEnd(text, first + 1);
    return rect(range);
  }
  return null;
}

function App() {
  const [open, setOpen] = React.useState(true);
  const [recap, setRecap] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [revision, setRevision] = React.useState(0);
  window.statsFixture = {
    reset(options = {}) {
      const { scenario = "normal", tab = "weekly", category = "vocabulary", boardKey = "weeklyVocab" } = options;
      profile = null; definition = null; closes = 0;
      flushSync(() => {
        store.replace({ ...createInitialStatsState(), stats: payload(scenario), tab, category, boardKey,
          vocabWeeklyCount: 751, loading: scenario === "loading", error: scenario === "error" ? "fixture_error" : "" });
        setOpen(true); setRecap(false); setRevision(value => value + 1);
      });
    },
    recap() { flushSync(() => { setOpen(false); setRecap(true); setPage(1); }); },
    snapshot() {
      const board = document.querySelector(".stats-board-content");
      const scroll = document.querySelector('.stats-panel [data-stats-scroll="true"]');
      const navigation = getStatsNavigation(store.getState());
      return { ...Object.fromEntries(["tab", "category", "boardKey"].map(key => [key, store.getState()[key]])),
        title: document.querySelector("#stats-board-title")?.textContent, text: board?.innerText || "",
        panel: rect(document.querySelector(".stats-panel")), scroll: rect(scroll),
        periods: rect(document.querySelector(".stats-periods")), categories: rect(document.querySelector(".stats-categories")),
        selects: [...document.querySelectorAll('.stats-panel button[role="combobox"]')].map(select => ({
          label: select.getAttribute("aria-label"), value: select.dataset.value, caption: select.textContent.trim(),
          expanded: select.getAttribute("aria-expanded") === "true", controls: select.getAttribute("aria-controls"),
          activeOption: select.getAttribute("aria-activedescendant"), focused: document.activeElement === select,
          rect: rect(select), options: (select.getAttribute("aria-label") === "Type de manche" ? WEEKLY_TOP3_ROUND_TYPES : navigation.boards)
            .map(option => ({ key: option.key, text: option.label })),
          visible: getComputedStyle(select).display !== "none" && getComputedStyle(select).visibility !== "hidden",
        })),
        menus: [...document.querySelectorAll('.stats-overlay [role="listbox"]')].map(menu => {
          const style = getComputedStyle(menu);
          const activeId = document.querySelector(`[aria-controls="${menu.id}"]`)?.getAttribute("aria-activedescendant") || menu.getAttribute("aria-activedescendant");
          return { id: menu.id, label: menu.getAttribute("aria-label"), rect: rect(menu),
            portal: !menu.closest(".stats-panel"), backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage, fontFamily: style.fontFamily, overflowY: style.overflowY,
            scrollTop: menu.scrollTop, scrollHeight: menu.scrollHeight, clientHeight: menu.clientHeight,
            options: [...menu.querySelectorAll('[role="option"]')].map(option => ({
              id: option.id, key: option.dataset.value, text: (option.firstElementChild?.textContent || option.textContent).trim(), rect: rect(option),
              selected: option.getAttribute("aria-selected") === "true",
              active: option.id === activeId || document.activeElement === option,
              fontFamily: getComputedStyle(option).fontFamily,
            })),
          };
        }),
        typewriterLoaded: [...document.fonts].some(face => face.family.replaceAll('"', "") === "GobbleRegisterTypewriter" && face.status === "loaded"),
        chromeFonts: [...document.querySelectorAll('.stats-binder-name strong, #stats-board-title, .stats-periods button, .stats-categories button, .stats-panel [role="combobox"]')].map(element => ({
          text: element.textContent, fontFamily: getComputedStyle(element).fontFamily,
        })),
        cursiveElements: [...document.querySelectorAll(".stats-panel, .stats-panel *")].filter(element => /GobbleRegisterHand|cursive/i.test(getComputedStyle(element).fontFamily)).map(element => element.className),
        rows: [...document.querySelectorAll("[data-stats-row]")].map(row => {
          const nick = row.querySelector(".stats-nick");
          const body = row.querySelector(".stats-row-body");
          const value = row.querySelector(".stats-row-value");
          const number = value?.querySelector("strong");
          const nickStyle = nick ? getComputedStyle(nick) : null;
          return { text: row.innerText, rect: rect(row), nick: rect(nick), body: rect(body), value: rect(value), number: rect(number),
            nickFirstLine: firstLineRect(nick), valueFirstLine: firstLineRect(number),
            valueIsSibling: value?.parentElement === row && body?.parentElement === row,
            valueTextAlign: value ? getComputedStyle(value).textAlign : null,
            nickFont: nickStyle?.fontFamily, valueFont: number ? getComputedStyle(number).fontFamily : null,
            clipped: row.scrollWidth > row.clientWidth + 1 || !!nick && (nick.scrollWidth > nick.clientWidth + 1 || nick.scrollHeight > nick.clientHeight + 1),
            nickTruncated: nickStyle?.textOverflow === "ellipsis" || !!nickStyle && !["none", "0"].includes(nickStyle.webkitLineClamp) };
        }),
        mountedLists: document.querySelectorAll(".stats-leaderboard").length,
        tabs: [...document.querySelectorAll(".stats-categories button")].map(button => ({ text: button.textContent, rect: rect(button), label: rect(button.querySelector("span")),
          labelTransform: getComputedStyle(button.querySelector("span")).transform })),
        typedEffects: { faded: document.querySelectorAll(".stats-panel .stats-typed-faded").length,
          doubled: document.querySelectorAll(".stats-panel .stats-typed-double").length,
          letters: document.querySelector(".stats-panel")?.textContent?.replace(/\s/g, "").length || 0 },
        activeAnimations: document.querySelector(".stats-panel")?.getAnimations({ subtree: true }).map(animation => ({ type: animation.constructor.name, state: animation.playState })) || [],
        scrollWidth: scroll?.scrollWidth, scrollClientWidth: scroll?.clientWidth,
        documentWidth: document.documentElement.scrollWidth, innerWidth, innerHeight, profile, definition, closes };
    },
  };
  return <>
    <main style={{ padding: 24 }}><h1>Statistiques — aperçu local</h1><p>Données fictives en mémoire, sans serveur de jeu.</p><button onClick={() => window.statsFixture.reset()}>Ouvrir les stats</button><button onClick={() => window.statsFixture.recap()}>Récap hebdo</button></main>
    {open ? <StatsApplication key={revision}
      appearance={{ darkMode: true, menuDarkMode: true, isMobileLayout: innerWidth < 700 }}
      blockers={{ keyboardBlocked: false }} identity={{ installId: "9102", selfNick: "Tigre" }}
      navigation={{ onClose: () => { closes++; setOpen(false); } }}
      presentation={{ getImageUrl: getStatsImageUrl, getUserIdFromPlayerProfileTarget: entry => entry.userId || null,
        isCrownedEntry: () => false, openDefinition: value => { definition = value; }, openPlayerProfile: value => { profile = value; },
        playCloseSound: noop, playSwipeSound: noop, renderCrownIcon: () => null,
        renderVocabPanel: () => <div style={{ padding: 20 }}><h3>Ma progression vocabulaire</h3><p>12 981 mots uniques · prochain palier à 15 000 mots.</p></div> }}
      requests={{ fetchWeeklyStats: noop, requestTrophyStatus: noop }}
      statsConfig={{ weeklyBoardDisplayLimit: 50, seasonTargetLimit: 200 }} /> : null}
    <DuelWeekRecapOverlay open={recap} page={page} onNext={() => setPage(value => value + 1)} onClose={() => setRecap(false)}
      formatNumber={value => Number(value).toLocaleString("fr-FR")}
      summary={{ weekId: "2026-W41", weekStartTs, winnerTeam: "red", totalsByTeam: { red: 28600, blue: 25100 },
        weeklyRecords: { medals: payload().boards.medals, mostWordsInGame: payload().boards.mostWordsInGame, totalScore: payload().boards.totalScore },
        presenterHits: hits, presenterHitsTrackingStartTs: weekStartTs + 2 * 86400000 }} />
  </>;
}
createRoot(document.getElementById("root")).render(<ApplicationRuntimeProvider kernel={kernel}><App /></ApplicationRuntimeProvider>);
