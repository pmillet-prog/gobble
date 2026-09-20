import React from "react";
import { createRoot } from "react-dom/client";
import GobblarsRewardCelebration from "../../src/features/notifications/GobblarsRewardCelebration.jsx";
import { createNotificationsFeature } from "../../src/features/notifications/createNotificationsFeature.js";
import { createResourceScope } from "../../src/app/core/createResourceScope.js";
import AssetManager from "../../src/assets/assetManager.js";
import "./preview.css";

const number = new Intl.NumberFormat("fr-FR");
const LETTERS = "GOBBLARSTRESORJEU".split("");

function Preview() {
  const [mobile, setMobile] = React.useState(true);
  const [sound, setSound] = React.useState(true);
  const [balance, setBalance] = React.useState(1280);
  const balanceRef = React.useRef(1280);
  const [notifications] = React.useState(() => {
    const scope = createResourceScope("gobblars-preview");
    const feature = createNotificationsFeature({ scope });
    feature.start();
    return { ...feature, dispose: scope.dispose };
  });
  const reward = React.useSyncExternalStore(notifications.store.subscribe, () => notifications.store.getState().gobblarsReward);
  const give = (amount, label, unlock = true) => {
    if (unlock && sound) void AssetManager.unlockAudio();
    balanceRef.current += amount;
    setBalance(balanceRef.current);
    notifications.show(label, 0, { gobblarsReward: { amount, balance: balanceRef.current, label } });
  };
  const replay = (unlock = true) => {
    notifications.clear();
    balanceRef.current = 1280;
    give(50, "Médaille d’or", unlock);
  };
  React.useEffect(() => {
    const timer = setTimeout(() => replay(false), 650);
    return () => { clearTimeout(timer); notifications.dispose(); };
  }, [notifications]);

  return <main className="gr-preview">
    <header className="gr-header"><a href="/"><img src="/Gobblars.png" alt="" />Gobble<span>LABO DES RÉCOMPENSES</span></a><span className="gr-local">Aperçu local · solde fictif</span></header>
    <div className="gr-layout">
      <section className="gr-copy"><p className="gr-kicker">PETITES VICTOIRES, GRAND TRÉSOR</p><h1>Chaque gobblar<br /><em>compte.</em></h1><p className="gr-intro">Le gain apparaît, rejoint ton trésor, puis fait grimper le compteur. Un petit moment de victoire, sans interrompre le jeu.</p>
        <div className="gr-actions"><button className="gr-replay" onClick={() => replay()}><span aria-hidden="true">↻</span> Rejouer l’animation</button><button className="gr-burst" aria-pressed={sound} onClick={() => { if (!sound) void AssetManager.unlockAudio(); setSound(value => !value); }}>{sound ? "Son activé" : "Son désactivé"}<span aria-hidden="true">♪</span></button><div className="gr-gains"><button onClick={() => give(1, "Gobble !")}><b>+1</b>Gobble</button><button onClick={() => give(2, "Double gobble !")}><b>+2</b>Double</button><button onClick={() => give(50, "Médaille d’or")}><b>+50</b>Médaille</button><button onClick={() => give(250, "Récompense reçue")}><b>+250</b>Récompense</button></div><button className="gr-burst" onClick={() => { give(1, "Gobble !"); give(2, "Double gobble !"); give(50, "Médaille d’or"); }}>Tester trois gains rapprochés <span aria-hidden="true">→</span></button></div>
        <div className="gr-balance"><img src="/Gobblars.png" alt="" /><span>Solde simulé<strong>{number.format(balance)} gobblars</strong></span></div>
      </section>
      <section className="gr-preview-area" aria-label="Aperçu de l’animation"><div className="gr-view-controls"><span>EN SITUATION</span><div><button aria-pressed={mobile} onClick={() => setMobile(true)}>Téléphone</button><button aria-pressed={!mobile} onClick={() => setMobile(false)}>Ordinateur</button></div></div>
        <div className={`gr-stage ${mobile ? "gr-stage-mobile" : ""}`}>
          <div className="gr-game-heading"><span>GOBBLE</span><small>FIN DE MANCHE</small></div>
          <div className="gr-game-board" aria-hidden="true">{LETTERS.map((letter, index) => <span key={index} className={index < 3 ? "gr-letter-gold" : ""}>{letter}</span>)}</div>
          <div className="gr-result"><span>Bien joué, Tigre !</span><strong>328 <small>points</small></strong><p>24 mots trouvés · Nouveau record</p></div>
          <div className="gr-stage-footer"><span>Classement</span><span>Les mots trouvables</span></div>
          {reward ? <GobblarsRewardCelebration key={reward.id} reward={reward} sound={sound} /> : null}
        </div>
        <p className="gr-hint">Clique sur Rejouer pour entendre le son. L’animation laisse le jeu accessible.</p>
      </section>
    </div>
  </main>;
}

createRoot(document.getElementById("root")).render(<Preview />);
