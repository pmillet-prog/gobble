import React from 'react';
import { createWheelPayoutPresentation } from './createWheelPayoutPresentation.js';

export function useWheelResultExit(phase, capture) {
  const [state, setState] = React.useState({ phase: 'idle' });
  const current = React.useRef(capture), active = React.useRef(null);
  const generation = React.useRef(0), capturing = React.useRef(false);
  current.current = capture;
  const reset = React.useCallback(() => {
    generation.current++; capturing.current = false;
    active.current?.dispose(); active.current = null;
    setState(previous => previous.phase === 'idle' ? previous : { phase: 'idle' });
  }, []);
  React.useEffect(() => { if (phase !== 'finished') reset(); }, [phase, reset]);
  React.useEffect(() => {
    const resume = () => active.current?.advance(document.hidden);
    document.addEventListener('visibilitychange', resume);
    return () => { generation.current++; capturing.current = false; active.current?.dispose(); document.removeEventListener('visibilitychange', resume); };
  }, []);
  const start = React.useCallback(async ({ onLand = () => {}, onComplete = () => {} } = {}) => {
    if (active.current || capturing.current) return;
    capturing.current = true;
    const token = ++generation.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let snapshot = null;
    try { snapshot = document.hidden ? null : await current.current(); } catch { /* Finish the authoritative payout even if its capture failed. */ }
    if (token !== generation.current) return;
    capturing.current = false;
    const controller = createWheelPayoutPresentation({
      change: phase => setState({ phase, snapshot, reduced }), land: onLand, finish: onComplete,
    });
    active.current = controller;
    controller.start({ reduced, hidden: document.hidden || !snapshot });
  }, []);
  return { state, start, reset };
}
