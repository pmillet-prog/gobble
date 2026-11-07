import React from "react";
import AvatarThumbnail from "../../src/features/avatar/AvatarThumbnail.jsx";
import { PRESENTER_IDENTITIES } from "../../shared/presenterIdentities.js";
import { contestantBankView } from "../../src/features/infortune/contestantBankView.js";
import { flatWheelLayout } from "./flatWheelGeometry.js";
import "./flatWheelStage.css";

const money = value => `${value.toLocaleString("fr-FR")} €`;
const CAPTIONS = { bankrupt: "La cagnotte retombe à zéro", exchange: "À toi de choisir un candidat", pass: "Aucun gain pour ce secteur", bonus: "Le bonus est à toi !" };

const FlatContestant = React.memo(function FlatContestant({ player, economy, onChoose, selected }) {
  const bank = contestantBankView(economy, player.id), Portrait = onChoose ? "button" : "span";
  const presenter = player.isBot && PRESENTER_IDENTITIES[player.presenterKey];
  return <div className="flat-wheel-stage__contestant" data-contestant-id={player.id} data-selected={selected} data-done={economy?.members?.[player.id]?.spin === "done"}>
    <Portrait className="flat-wheel-stage__portrait"
    {...(onChoose ? { type: "button", onClick: () => onChoose(player.id), "aria-pressed": selected,
      "aria-label": `Échanger avec ${player.nick}`, onPointerDown: event => event.stopPropagation(), onPointerUp: event => event.stopPropagation() } : {})}>
      {presenter ? <img src={presenter.buttonUrl} alt="" draggable="false" />
      : player.userId ? <AvatarThumbnail userId={player.userId} size={96} showPlaceholder />
        : <img src="/avatars/default.png" alt="" draggable="false" />}</Portrait>
    <span className="flat-wheel-stage__desk"><strong>{player.nick}</strong>
      <span className="flat-wheel-stage__bank" key={bank.amount} aria-live="polite">{bank.hidden ? <><span aria-hidden="true">◆</span> Cagnotte masquée</> : bank.amount}</span>
      <small>{selected ? "Candidat sélectionné ✓" : bank.status || (player.isBot ? "Présentateur invité" : "Candidat")}</small>
    </span>
  </div>;
});

export default function FlatWheelStage({ wheel, label }) {
  const { contestants = [], banks, selfBank, onChoose, selectedContestant, size } = wheel.flatStage;
  const layout = flatWheelLayout(size.width, size.height);
  const { phase, result } = wheel.view;
  const sequence = wheel.cameraSequence.current;
  const status = phase === "spinning" ? "Le dernier taquet décidera…" : phase === "finished" ? "Le verdict de la roue"
    : phase === "aiming" || phase === "dragging" ? "À toi de jouer" : wheel.inputLocked ? "Bienvenue sur le plateau" : "À toi de lancer";
  return <div ref={wheel.flatPresentation} className="flat-wheel-stage" data-compact={layout.compact} data-short={size.height < 420} data-shallow={layout.shallow} data-phase={phase}
    data-sequence={sequence?.sequence || "intro"} data-playing={String(sequence?.playing || false)}
    style={{ "--wheel-side": `${layout.side}px`, "--wheel-left": `${layout.left}px`, "--wheel-top": `${layout.top}px` }}>
    <div className="flat-wheel-stage__lights" aria-hidden="true" />
    <header className="flat-wheel-stage__marquee"><span>GOBBLE PRÉSENTE</span><strong>LA ROUE <em>DE L’INFORTUNE</em></strong></header>
    <p className="flat-wheel-stage__cue" role="status">{status}</p>
    <div className="flat-wheel-stage__ring" aria-hidden="true" />
    <div className="flat-wheel-stage__canvas" ref={wheel.canvasHost} role="img" aria-label={label} />
    <div className="flat-wheel-stage__contestants" aria-label="Les candidats du plateau">
      {contestants.map(player => <FlatContestant key={player.id} player={player} economy={banks} onChoose={onChoose} selected={selectedContestant === player.id} />)}
    </div>
    {Number.isFinite(selfBank) && <div className="flat-wheel-stage__self"><span>Ta cagnotte</span><strong key={selfBank}>{money(selfBank)}</strong></div>}
    {result && <section className="flat-wheel-stage__result" data-kind={result.kind} aria-label="Résultat du lancer" role="status">
      <span>LA ROUE A PARLÉ</span><strong>{result.label}</strong>
      <p>{CAPTIONS[result.kind] || "Un peu plus dans ta cagnotte !"}</p>
      <i aria-hidden="true">✦</i><i aria-hidden="true">✦</i>
    </section>}
  </div>;
}
