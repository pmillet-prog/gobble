import React, { Suspense } from "react";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { accountAvatarStore } from "../avatar/accountAvatarStore.js";
import { getTournamentPodiumEntries } from "./tournamentPodiumModel.js";
import TournamentPodium from "./TournamentPodium.jsx";
import "./tournamentFinaleExperience.css";

const TournamentFinaleScreen = React.lazy(() => import("../../components/finale/TournamentFinaleScreen.jsx"));

function LivePodium({ ranking, identity, sound, onOpenProfile }) {
  // Freeze the ceremony's entrants: duplicate snapshots must not reload canvases
  // or restart the animation. The surrounding component is keyed by tournament.
  const [entrants] = React.useState(() => getTournamentPodiumEntries(ranking, { userId: identity.userId, nick: identity.selfNick, knownPlayers: identity.knownPlayers }));
  const [ready, setReady] = React.useState(null);
  React.useEffect(() => {
    const controller = new AbortController();
    const participants = [...entrants.players, ...(entrants.self ? [entrants.self] : [])];
    const ids = [...new Set(participants.filter(entry => !entry.isBot && !entry.avatar).map(entry => entry.userId).filter(Boolean))];
    const timer = setTimeout(() => controller.abort(), 5000);
    let active = true;
    const fetchAvatars = ids.length ? fetch(`/api/auth/avatars?userIds=${ids.join(",")}`, {
      credentials: "include", cache: "no-store", signal: controller.signal,
    }).then(response => response.ok ? response.json() : null).then(data => data?.avatars || {}).catch(() => ({})) : Promise.resolve({});
    fetchAvatars.then(avatars => {
      if (!active) return;
      const local = accountAvatarStore.getSnapshot();
      const decorate = entry => entry && ({ ...entry, avatar: entry.userId && entry.userId === local.userId
        ? local.avatar || avatars[entry.userId] || entry.avatar : avatars[entry.userId] || entry.avatar });
      setReady({ players: entrants.players.map(decorate), self: decorate(entrants.self) });
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [entrants]);
  return ready ? <TournamentPodium {...ready} sound={sound} onOpenProfile={onOpenProfile} />
    : <div className="tournament-celebration-loading" role="status">Les joueurs rejoignent le podium…</div>;
}

export default function TournamentFinaleExperience(props) {
  const { tournamentKey, finale, identity, overlays, sound } = props;
  const ui = useFeatureRuntime("liveUi");
  const dismissed = useFeatureSelector(ui, state => state.podiumDismissedKey === tournamentKey);
  const closeRef = React.useRef(null);
  const dismiss = () => ui.set("podiumDismissedKey", tournamentKey);
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
        identity={identity} sound={sound} onOpenProfile={finale.stableOpenPlayerProfile} />
    </main>
    {overlays.chatOverlays}
    {overlays.settingsMenuView}
    {overlays.aboutModalView}
    {overlays.globalChatLayer}
  </>;
}
