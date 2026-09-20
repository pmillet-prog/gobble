import React from "react";
import PodiumAvatar from "./PodiumAvatar.jsx";
import { PodiumConfetti, PodiumCrown, PodiumLaurels } from "./PodiumDecor.jsx";
import { preparePodiumAvatars, releasePodiumAvatars } from "./preparePodiumAvatars.js";
import { CELEBRATION_DURATION, PODIUM_ARRIVAL, getPodiumPose, startCelebration } from "./celebrationTimeline.js";
import "./tournamentPodium.css";

const number = new Intl.NumberFormat("fr-FR");

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function TournamentPodium({ players, self, roundLabel = "Mini-tournoi", sound = false, onOpenProfile }) {
  const [actors, setActors] = React.useState(null);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [replay, setReplay] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const reduced = useReducedMotion();
  const stopRef = React.useRef(() => {});
  const audioRef = React.useRef(null);
  const soundRef = React.useRef(sound);
  soundRef.current = sound;
  const participants = React.useMemo(() => self?.avatar && !players.some(player => player.userId === self.userId)
    ? [...players, { ...self, previewOnly: true }] : players, [players, self]);

  React.useEffect(() => {
    const controller = new AbortController();
    let prepared;
    setActors(null); setProgress(0); setError(""); setElapsed(0);
    preparePodiumAvatars(participants, { signal: controller.signal, onProgress: setProgress }).then(value => {
      if (controller.signal.aborted) { releasePodiumAvatars(value); return; }
      prepared = value;
      setActors(value);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Les avatars n’ont pas pu rejoindre le podium.");
    });
    return () => { controller.abort(); releasePodiumAvatars(prepared); };
  }, [participants, attempt]);

  React.useEffect(() => {
    if (!actors) return;
    setElapsed(reduced ? CELEBRATION_DURATION : 0);
    const stop = reduced ? () => {} : startCelebration({ onCue: at => {
      setElapsed(at);
      if (at === PODIUM_ARRIVAL[1] && soundRef.current) {
        const audio = new Audio("/sound/game/applause.wav");
        audio.volume = .22;
        audioRef.current = audio;
        void audio.play().catch(() => {});
      }
      if (at === CELEBRATION_DURATION) audioRef.current?.pause();
    } });
    stopRef.current = stop;
    return () => { stop(); audioRef.current?.pause(); audioRef.current = null; };
  }, [actors, replay, reduced]);
  React.useEffect(() => { if (!sound) audioRef.current?.pause(); }, [sound]);

  const skip = () => { stopRef.current(); audioRef.current?.pause(); setElapsed(CELEBRATION_DURATION); };
  const complete = elapsed >= CELEBRATION_DURATION;
  const winner = actors?.find(actor => actor.rank === 1);
  const selfActor = actors?.find(actor => actor.userId === self?.userId);
  const winning = elapsed >= PODIUM_ARRIVAL[1];
  const ordered = actors && [2, 1, 3].map(rank => actors.find(actor => actor.rank === rank)).filter(Boolean);

  return <section className="tournament-podium" aria-label="Célébration du mini-tournoi">
    <div className="podium-atmosphere" aria-hidden="true"><i /><i /><i /></div>
    <div className={`podium-performance ${actors ? "is-playing" : ""} ${complete ? "is-complete" : ""} ${reduced ? "is-reduced" : ""}`} key={`${attempt}-${replay}-${!!actors}`}>
      <header className="podium-heading">
        <span className="podium-eyebrow">{roundLabel} · Les résultats</span>
        <h1>{winning ? <>Bravo, <em>{winner?.nick} !</em></> : <>Les mots ont <em>leurs champions.</em></>}</h1>
        <p>{winning ? "Une belle victoire, des mots bien joués." : "Place aux trois meilleurs du tournoi."}</p>
      </header>
      <div className="podium-stage">
        <div className="podium-halo" aria-hidden="true" />
        <div className="podium-floor" aria-hidden="true" />
        {ordered ? <div className="podium-players">
          {ordered.map(actor => <article key={actor.rank} className={`podium-player podium-place-${actor.rank} ${actor.isBot ? "is-bot" : ""} ${actor.userId === self?.userId ? "is-self" : ""}`} style={{ "--arrival": `${PODIUM_ARRIVAL[actor.rank]}ms` }} aria-label={`${actor.rank === 1 ? "Premier" : actor.rank === 2 ? "Deuxième" : "Troisième"} : ${actor.nick}, ${number.format(actor.score)} points`}>
            <div className="podium-avatar-entrance"><div className="podium-avatar-motion"><PodiumAvatar actor={actor} pose={getPodiumPose(actor.rank, elapsed)} /></div>{actor.rank === 1 ? <div className="podium-winner-crown"><PodiumCrown /></div> : null}</div>
            <div className="podium-plinth"><div className="podium-plinth-top" /><div className="podium-plaque">
              <span className="podium-rank">{actor.rank === 1 ? <PodiumLaurels /> : null}<b>{actor.rank}</b></span>
              <h2>{!actor.isBot && actor.userId && onOpenProfile ? <button type="button" onClick={() => onOpenProfile(actor)} title="Voir le profil">{actor.nick}</button> : actor.nick}</h2><p><strong>{number.format(actor.score)}</strong> pts</p>
              {actor.userId === self?.userId ? <span className="podium-you">C’est toi</span> : null}
            </div></div>
          </article>)}
        </div> : <div className="podium-loading" role={error ? "alert" : "status"}><PodiumCrown /><strong>{error || "Les joueurs se préparent…"}</strong>{error ? <button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button> : <span>{progress} / {participants.length} avatars prêts</span>}</div>}
        <PodiumConfetti />
      </div>
      <div className="podium-afterglow">
        <div className="podium-personal-result" aria-live="polite">
          {complete && self ? <>{selfActor ? <span className="podium-personal-avatar"><PodiumAvatar actor={selfActor} pose="happy" /></span> : null}<span className="podium-personal-rank">{self.rank}<small>{self.rank === 1 ? "er" : "e"}</small></span><div><strong>{self.rank === 1 ? "Le tournoi est à toi !" : self.rank <= 3 ? "Une place sur le podium !" : "Chaque mot compte."}</strong><p>{self.nick} · {number.format(self.score)} points <span>sur {self.totalPlayers} joueurs</span></p></div><span className="podium-personal-star" aria-hidden="true">✦</span></> : <p>{actors ? "Le podium se dévoile…" : "La cérémonie va commencer."}</p>}
        </div>
        <div className="podium-playback">
          <button type="button" className="podium-replay" disabled={!actors} onClick={() => { stopRef.current(); setElapsed(0); setReplay(value => value + 1); }}><span aria-hidden="true">↻</span> Rejouer</button>
          {!complete ? <button type="button" className="podium-skip" disabled={!actors} onClick={skip}>Voir la photo finale <span aria-hidden="true">→</span></button> : <span className="podium-final-caption">{reduced ? "Affichage adapté aux animations réduites" : "Bien joué à tous. Rendez-vous au prochain tournoi !"}</span>}
        </div>
      </div>
    </div>
  </section>;
}
