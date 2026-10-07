import React from "react";
import { createPortal } from "react-dom";

export default function TargetQuizTargetLink({ word, onOpenDefinition }) {
  const ref = React.useRef(null);
  const animationRef = React.useRef(null);
  React.useEffect(() => () => { animationRef.current?.cancel(); }, []);
  const [flight, setFlight] = React.useState(null);
  React.useLayoutEffect(() => {
    const destination = ref.current;
    if (!destination || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const source = [...document.querySelectorAll("[data-target-quiz-origin]")].find(node => node.getClientRects().length);
    let origin;
    try { origin = JSON.parse(source?.dataset.targetQuizOrigin || "null"); } catch { return undefined; }
    if (!origin?.width) return undefined;
    const rect = destination.getBoundingClientRect();
    const scale = Math.max(1, Math.min(2.4, origin.height / rect.height));
    setFlight({ left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      x: origin.left + origin.width / 2 - rect.left - rect.width / 2,
      y: origin.top + origin.height / 2 - rect.top - rect.height / 2, scale });
    return undefined;
  }, [word]);
  const flightRef = React.useCallback(node => {
    if (!node || !flight) return;
    animationRef.current?.cancel();
    const animation = node.animate([
      { transform: `translate(${flight.x}px, ${flight.y}px) scale(${flight.scale})` },
      { transform: "translate(0, 0) scale(1)" },
    ], { duration: 650, easing: "cubic-bezier(.22,.8,.28,1)", fill: "both" });
    animation.onfinish = () => setFlight(null);
    animationRef.current = animation;
  }, [flight]);
  if (!word) return null;
  const content = <><span>{word.toUpperCase()}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></svg></>;
  return <>
    <button ref={ref} type="button" className="target-quiz__target-link" style={flight ? { visibility: "hidden" } : undefined}
      onClick={() => onOpenDefinition?.(word)} title="Définition du mot cible" aria-label={`Voir la définition du mot cible : ${word}`}>{content}</button>
    {flight ? createPortal(<div ref={flightRef} className="target-quiz__target-link target-quiz__target-flight" aria-hidden="true"
      style={{ left: flight.left, top: flight.top, width: flight.width, height: flight.height }}>{content}</div>, document.body) : null}
  </>;
}
