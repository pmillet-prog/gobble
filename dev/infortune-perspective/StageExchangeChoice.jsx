import React from "react";
import { createPortal } from "react-dom";
import InfortuneCountdown from "../../src/components/infortune/InfortuneCountdown.jsx";
import "./stageExchangeChoice.css";

function StageAvatarTargets({ wheel, contestants, selectedId, onSelect }) {
  const [targets, setTargets] = React.useState([]);
  const { width, height } = wheel.flatStage.size;
  React.useLayoutEffect(() => {
    if (wheel.flat) return;
    let active = true;
    const update = async () => {
      const next = await Promise.all(contestants.map(async player => ({ player, bounds: (await wheel.getContestantPresentation(player.id))?.avatar })));
      if (active) setTargets(next.filter(({ bounds }) => bounds?.width > 0 && bounds?.height > 0));
    };
    // Projection updates in the owner's effect; read its final size after it.
    const frame = requestAnimationFrame(() => { void update().catch(() => {}); });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [wheel.flat, wheel.getContestantPresentation, width, height, contestants]);
  if (wheel.flat || !wheel.scene.current) return null;
  return createPortal(<div className="stage-exchange-targets">
    {targets.map(({ player, bounds }) => <button key={player.id} type="button" data-stage-contestant={player.id}
      style={bounds} aria-label={`Sélectionner ${player.nick} pour l’échange`} aria-pressed={selectedId === player.id}
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      onClick={() => onSelect(player.id)} />)}
  </div>, wheel.scene.current);
}

function UnfoldingName({ wheel, player }) {
  const title = React.useRef(null);
  React.useLayoutEffect(() => {
    let active = true, animation;
    const node = title.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    Promise.resolve(wheel.getContestantPresentation(player.id)).then(presentation => {
      const origin = presentation?.name;
      if (!active || !origin || !wheel.scene.current) return;
      const stage = wheel.scene.current.getBoundingClientRect(), destination = node.getBoundingClientRect();
      const x = stage.x + origin.x - destination.x - destination.width / 2;
      const y = stage.y + origin.y - destination.y - destination.height / 2;
      const scale = Math.max(.15, Math.min(1, origin.height / destination.height));
      animation = node.animate([
        { transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: .4 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ], { duration: 620, easing: "cubic-bezier(.2,.75,.2,1)" });
    }).catch(() => {});
    return () => { active = false; animation?.cancel(); };
  }, [player.id, wheel.getContestantPresentation, wheel.scene]);
  return <h2 ref={title} className="stage-exchange-choice__name">{player.nick}</h2>;
}

export default function StageExchangeChoice({ wheel, contestants, selectedId, onSelect, onConfirm, onDecline, bank, until }) {
  const player = contestants.find(candidate => candidate.id === selectedId);
  React.useEffect(() => {
    if (!wheel.scene.current?.closest(".infortune-game")) wheel.scene.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [wheel.scene]);
  return <>
    <StageAvatarTargets wheel={wheel} contestants={contestants} selectedId={selectedId} onSelect={onSelect} />
    <section className="stage-exchange-choice" data-selected={Boolean(player)} aria-label="Choisir un échange"
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
      <p className="stage-exchange-choice__eyebrow">{onDecline ? 'À TOI DE CHOISIR' : 'ÉCHANGE'}</p>
      {player ? <>
        <div aria-live="polite" aria-atomic="true"><UnfoldingName key={player.id} wheel={wheel} player={player} /></div>
        <p>{Number.isFinite(bank) ? <>Tes <strong>{bank.toLocaleString("fr-FR")} €</strong> contre sa cagnotte mystère.</> : "Échanger vos deux cagnottes ?"}</p>
      </> : <p className="stage-exchange-choice__instruction">Sélectionne un avatar sur le plateau.</p>}
      <div className="stage-exchange-choice__actions">
        <InfortuneCountdown until={until} label="Sans échange dans" />
        {onDecline && <button type="button" className="stage-exchange-choice__decline" onClick={onDecline}>Ne pas échanger</button>}
        {player && <button type="button" className="stage-exchange-choice__confirm" onClick={onConfirm}>Confirmer l’échange</button>}
      </div>
      {player && <small>Tu peux sélectionner un autre avatar avant de confirmer.</small>}
      {onDecline && <small>Un autre joueur peut toujours choisir ta cagnotte.</small>}
    </section>
  </>;
}
