import React, { Suspense } from "react";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { useTournamentAvatarResources } from "../avatar/TournamentAvatarsProvider.jsx";
import { getTournamentPodiumEntries } from "./tournamentPodiumModel.js";
import TournamentPodium from "./TournamentPodium.jsx";
import { loadTournamentFinaleRanking } from "./loadTournamentFinale.js";
import { PODIUM_RANKING_DELAY_MS } from "./celebrationTimeline.js";
import "./tournamentFinaleExperience.css";

const TournamentFinaleScreen = React.lazy(loadTournamentFinaleRanking);

function LivePodium({ tournamentKey, ranking, identity, sound, onOpenProfile, onComplete }) {
  // Freeze the ceremony's entrants: duplicate snapshots must not reload canvases
  // or restart the animation. The surrounding component is keyed by tournament.
  const [entrants] = React.useState(() => getTournamentPodiumEntries(ranking, { userId: identity.userId, nick: identity.selfNick, knownPlayers: identity.knownPlayers }));
  const resources = useTournamentAvatarResources();
  const [ready, setReady] = React.useState(null);
  const [error, setError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setError(false);
    const preparation = resources.preparePodium(tournamentKey, entrants, { retry: attempt > 0 });
    const accept = value => { if (active && value) setReady(value); };
    if (preparation?.value) accept(preparation.value);
    else preparation?.promise?.then(accept).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [resources, tournamentKey, entrants, attempt]);
  return ready ? <TournamentPodium {...ready} preparedActors={ready.actors} sound={sound} onOpenProfile={onOpenProfile} onComplete={onComplete} />
    : <div className="tournament-celebration-loading" role={error ? "alert" : "status"}>{error ? <>Les avatars n’ont pas pu rejoindre le podium. <button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></> : "Les joueurs rejoignent le podium…"}</div>;
}

export default function TournamentFinaleExperience(props) {
  const { tournamentKey, finale, identity, overlays, sound } = props;
  const ui = useFeatureRuntime("liveUi");
  const resources = useTournamentAvatarResources();
  const dismissed = useFeatureSelector(ui, state => state.podiumDismissedKey === tournamentKey);
  const [completedKey, setCompletedKey] = React.useState(null);
  const closeRef = React.useRef(null);
  const dismiss = React.useCallback(() => ui.set("podiumDismissedKey", tournamentKey), [ui, tournamentKey]);
  const onComplete = React.useCallback(() => setCompletedKey(tournamentKey), [tournamentKey]);
  React.useEffect(() => {
    if (dismissed) { resources?.releasePodium(tournamentKey); return; }
    if (completedKey !== tournamentKey) return;
    const timer = setTimeout(dismiss, PODIUM_RANKING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [completedKey, dismissed, dismiss, resources, tournamentKey]);
  React.useEffect(() => { if (!dismissed) closeRef.current?.focus({ preventScroll: true }); }, [dismissed]);
  if (dismissed) return <Suspense fallback={null}><TournamentFinaleScreen {...props} /></Suspense>;
  return <>
    <main className="tournament-celebration-screen" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
    }}>
      <div className="tournament-celebration-toolbar"><span>Mini-tournoi terminé</span>
        <button ref={closeRef} type="button" onClick={dismiss} aria-label="Fermer la célébration et voir le classement complet">
          Voir le classement complet <span aria-hidden="true">×</span>
        </button>
      </div>
      <LivePodium key={tournamentKey} ranking={finale.tournamentFinaleSummary.ranking}
        tournamentKey={tournamentKey} identity={identity} sound={sound} onOpenProfile={finale.stableOpenPlayerProfile} onComplete={onComplete} />
    </main>
    {overlays.chatOverlays}
    {overlays.settingsMenuView}
    {overlays.aboutModalView}
    {overlays.globalChatLayer}
  </>;
}
