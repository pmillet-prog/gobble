import React from 'react';
import { createPortal } from 'react-dom';
import { infortuneLaunchBonus } from '../../../shared/infortuneWheel.js';
import './wheelLaunchReward.css';

export function useWheelLaunchReward(wheel, onLand) {
  const [state, setState] = React.useState(null), callback = React.useRef(onLand), played = React.useRef(null);
  callback.current = onLand;
  const quality = wheel.view.launchQuality;
  const launched = ['spinning', 'finished'].includes(wheel.view.phase);
  React.useLayoutEffect(() => {
    if (!launched || !quality || played.current === quality) return;
    played.current = quality;
    const amount = infortuneLaunchBonus(quality.kind);
    if (!amount) return;
    const scene = wheel.scene.current;
    const source = scene?.querySelector('.launch-feedback__bonus, .wheel-skill__verdict') || scene;
    const counter = scene?.closest('.infortune-game')?.querySelector('.currency-counter--bank')
      || document.querySelector('.currency-layer .currency-counter--bank');
    const from = source?.getBoundingClientRect(), to = counter?.getBoundingClientRect();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const land = () => { setState({ quality, landed: true }); callback.current?.(); };
    if (document.hidden || !from?.width || !to?.width) { land(); return; }
    setState({ quality, amount, landed: false, reduced, x: from.x + from.width / 2, y: from.y + from.height / 2,
      dx: to.x + to.width / 2 - from.x - from.width / 2, dy: to.y + to.height / 2 - from.y - from.height / 2 });
    const timer = setTimeout(land, reduced ? 150 : 1100);
    const visibility = () => { if (document.hidden) { clearTimeout(timer); land(); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [quality, launched, wheel.scene]);
  return { landed: state?.quality === quality && state?.landed, flight: state?.quality === quality && !state?.landed ? state : null };
}

export default function WheelLaunchReward({ flight }) {
  return flight ? createPortal(<div className="wheel-launch-reward" data-reduced={flight.reduced} role="status"
    style={{ left: flight.x, top: flight.y, '--launch-dx': `${flight.dx}px`, '--launch-dy': `${flight.dy}px` }}>
    +{flight.amount} €<small>Bonus de lancer</small>
  </div>, document.body) : null;
}
