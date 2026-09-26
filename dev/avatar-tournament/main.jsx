import React from "react";
import { createRoot } from "react-dom/client";
import { createApplicationKernel } from "../../src/app/core/createApplicationKernel.js";
import { createLiveUiFeature } from "../../src/features/live/createLiveUiFeature.js";
import { createChatFeature } from "../../src/features/chat/createChatFeature.js";
import { createIntermissionClockFeature } from "../../src/features/intermission/createIntermissionClockFeature.js";
import { createPresenterHintsFeature } from "../../src/features/presenters/createPresenterHintsController.js";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import TournamentAvatarsProvider from "../../src/features/avatar/TournamentAvatarsProvider.jsx";
import { createTournamentAvatarResources } from "../../src/features/avatar/createTournamentAvatarResources.js";
import AvatarThumbnail from "../../src/features/avatar/AvatarThumbnail.jsx";
import useTournamentAvatarPreparation from "../../src/features/celebration/useTournamentAvatarPreparation.js";
import TournamentFinaleExperience from "../../src/features/celebration/TournamentFinaleExperience.jsx";
import { createCelebrationFixture } from "../../src/features/celebration/demo/celebrationFixtures.js";
import "../../src/index.css";

const fixture = createCelebrationFixture("other", 0);
const entrants = [...fixture.players, fixture.self].map((player, index) => ({ ...player, userId: index + 1 }));
const avatars = Object.fromEntries(entrants.map(player => [player.userId, player.avatar]));
const ranking = entrants.map(({ avatar, ...player }) => ({ ...player, points: player.score }));
const metrics = { requests: [], preparations: [], openedAt: null, playingAt: null, completeAt: null, rankingAt: null };
const nativeFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (String(url).startsWith("/api/")) {
    metrics.requests.push(String(url));
    if (/\/avatars\/\d+\/chat\.png/.test(url)) return nativeFetch("/avatars/default.png", init);
    if (String(url).startsWith("/api/auth/avatars?")) return Response.json({ ok: true, avatars });
    throw new Error(`Unexpected fixture API: ${url}`);
  }
  return nativeFetch(url, init);
};
const resources = createTournamentAvatarResources({ loadPodium: async () => {
  const module = await import("../../src/features/celebration/prepareTournamentPodium.js");
  return { prepareTournamentPodium: async (...args) => {
    const startedAt = performance.now();
    const result = await module.prepareTournamentPodium(...args).catch(error => {
      metrics.preparationError = error.stack || error.message;
      throw error;
    });
    metrics.preparations.push({ startedAt, readyAt: performance.now(), frames: result.actors.reduce((count, actor) => count + new Set(Object.values(actor.frames)).size, 0) });
    return result;
  } };
} });
const kernel = createApplicationKernel();
for (const [name, factory] of Object.entries({ liveUi: createLiveUiFeature, chat: createChatFeature,
  intermission: createIntermissionClockFeature, presenters: createPresenterHintsFeature })) kernel.features.define(name, factory);
const noop = () => {};
const identity = { userId: 4, selfNick: ranking[3].nick, installId: "4", knownPlayers: ranking };
function Fixture() {
  const [tour, setTour] = React.useState(1);
  const [round, setRound] = React.useState(1);
  const [players, setPlayers] = React.useState([1, 2]);
  const [final, setFinal] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [showResults, setShowResults] = React.useState(true);
  const key = `tour-${tour}`;
  const summary = React.useMemo(() => ({ id: key, winnerNick: ranking[0].nick, ranking, records: {} }), [key]);
  useTournamentAvatarPreparation({ enabled: true, tournamentId: key, roomId: "fixture", userId: 4, nick: identity.selfNick,
    phase: final ? "results" : "playing", breakKind: final ? "tournament_end" : null, podiumKey: key, summary, knownPlayers: ranking });
  React.useEffect(() => { window.avatarFixture = { metrics, resources, kernel,
    nextRound: () => setRound(value => value + 1), join: () => setPlayers([1, 2, 3]), results: setShowResults,
    final: () => setFinal(true), open: () => { metrics.openedAt = performance.now(); setOpen(true); },
    nextTournament: () => { setOpen(false); setFinal(false); setTour(value => value + 1); },
  }; });
  if (!open) return <main style={{ padding: 24 }}><h1>{final ? "Résultats de la finale" : `Résultats de manche ${round}`}</h1>
    {showResults ? <div key={round} data-round={round} style={{ display: "flex", gap: 24 }}>{players.map(userId => <div key={userId}>
      <AvatarThumbnail userId={userId} size={48} showPlaceholder /> Joueur {userId}
    </div>)}</div> : <p>Manche en cours</p>}</main>;
  return <TournamentFinaleExperience tournamentKey={key} sound={false} identity={identity} overlays={{}}
    appearance={{ isMobileLayout: innerWidth < 700, chatDesktopFontScale: 1 }}
    chat={{ chatInputRef: { current: null }, getLiveNickClassName: () => "", safeChatTab: "messages", setChatDesktopFontScale: noop,
      renderBlockedListPanel: () => null }}
    finale={{ tournamentFinaleSummary: summary, tournament: { id: key, round: 8 }, tournamentRef: { current: { id: key } },
      tournamentBaselineRef: { current: { rankingMap: new Map(), rankingRound: 7 } }, tournamentDuelDeltaRef: { current: null },
      FINALE_WEEKLY_BOARDS: [], TOURNAMENT_TOTAL_ROUNDS: 8, finalePage: 0, finaleScrollRef: { current: null },
      getTournamentPoints: entry => entry.points, renderTournamentTotalRightLabel: points => String(points),
      renderNickSuffix: () => null, renderRankDelta: () => null, stableCanOpenPlayerProfile: () => false,
      stableOpenPlayerProfile: noop, goToFinalePage: noop, tournamentRanking: ranking, gobbleAwardsForLive: {},
    }} weekly={{ weeklyVocabLookup: new Map(), weeklyBoardData: {}, dedupeWeeklyEntries: () => [] }} />;
}

new MutationObserver(() => {
  if (document.querySelector(".podium-performance.is-playing") && !metrics.playingAt) metrics.playingAt = performance.now();
  if (document.querySelector(".podium-performance.is-complete") && !metrics.completeAt) metrics.completeAt = performance.now();
  if (document.body.textContent.includes("Classement general") && !metrics.rankingAt) metrics.rankingAt = performance.now();
}).observe(document.getElementById("root"), { subtree: true, childList: true, attributes: true });
createRoot(document.getElementById("root")).render(<React.StrictMode><ApplicationRuntimeProvider kernel={kernel}>
  <TournamentAvatarsProvider resources={resources}><Fixture /></TournamentAvatarsProvider>
</ApplicationRuntimeProvider></React.StrictMode>);
