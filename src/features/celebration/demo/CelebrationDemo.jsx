import React from "react";
import TournamentPodium from "../TournamentPodium.jsx";
import { createCelebrationFixture } from "./celebrationFixtures.js";
import { PRESENTER_IDENTITIES } from "../../presenters/presenterIdentity.js";
import "./celebrationDemo.css";

export default function CelebrationDemo() {
  const [position, setPosition] = React.useState("winner");
  const [look, setLook] = React.useState(0);
  const [sound, setSound] = React.useState(false);
  const [botKey, setBotKey] = React.useState("pivot");
  const fixture = React.useMemo(() => createCelebrationFixture(position, look, botKey), [position, look, botKey]);
  return <main className="celebration-demo">
    <header className="celebration-demo-toolbar"><a href="/" className="celebration-demo-brand"><img src="/g.png" alt="" /><span>Gobble<small>Atelier des célébrations</small></span></a><span className="celebration-demo-tag">Démo · joueurs fictifs</span>
      <div className="celebration-demo-controls">
        <label>Ta place<select value={position} onChange={event => setPosition(event.target.value)}><option value="winner">Vainqueur</option><option value="second">Deuxième</option><option value="other">Hors podium</option></select></label>
        <label>Bot invité<select value={botKey} onChange={event => setBotKey(event.target.value)}><option value="">Aucun</option>{Object.entries(PRESENTER_IDENTITIES).map(([key, presenter]) => <option key={key} value={key}>{presenter.nick}</option>)}</select></label>
        <button type="button" onClick={() => setLook(value => value + 1)}>Autres avatars</button><button type="button" aria-pressed={sound} onClick={() => setSound(value => !value)}>{sound ? "Son activé" : "Son désactivé"}</button>
      </div>
    </header>
    <TournamentPodium players={fixture.players} self={fixture.self} sound={sound} />
    <footer className="celebration-demo-footer">Une cérémonie de 7 secondes. Les expressions et les tenues viennent de l’atelier d’avatars.<a href="/">Retour au jeu →</a></footer>
  </main>;
}
