import React from 'react';
import { compactCurrency } from './compactCurrency.js';

export default function CurrencyCounter({ kind, amount, position, hidden = false }) {
  const text = React.useRef(null), previous = React.useRef(amount), badge = React.useRef(null);
  const [expanded, setExpanded] = React.useState(false);
  const expansionTimer = React.useRef(null), expandedRef = React.useRef(false);
  expandedRef.current = expanded;
  const full = Number.isFinite(amount) ? amount.toLocaleString('fr-FR') : '—';
  React.useEffect(() => () => clearTimeout(expansionTimer.current), []);
  React.useEffect(() => { if (hidden) { clearTimeout(expansionTimer.current); setExpanded(false); } }, [hidden]);
  function showExactAmount() {
    clearTimeout(expansionTimer.current);
    setExpanded(true);
    expansionTimer.current = setTimeout(() => setExpanded(false), 2000);
  }
  React.useEffect(() => {
    const start = previous.current; previous.current = amount;
    let frame, animation;
    const node = text.current;
    if (!node) return;
    const jump = !Number.isFinite(start) || !Number.isFinite(amount) || document.hidden
      || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (jump || start === amount) { node.textContent = expandedRef.current ? full : compactCurrency(amount); return; }
    const started = performance.now();
    if (badge.current && amount > start) {
      badge.current.textContent = `+${compactCurrency(amount - start)}`;
      animation = badge.current.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, offset: .2 },
        { opacity: 0, transform: 'translateY(-22px)' }], { duration: 1100, easing: 'ease-out' });
    }
    const tick = now => {
      const progress = Math.min(1, (now - started) / 850);
      node.textContent = expandedRef.current ? full : compactCurrency(Math.round(start + (amount - start) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); animation?.cancel(); };
  }, [amount]);
  const icon = <img src={`/ui/currency/${kind === 'wallet' ? 'gobblar-cartoon-v2' : 'euro-cartoon-v1'}.webp`} width="36" height="36" alt="" />;
  const width = expanded ? `calc(${Math.max(3, full.length)}ch + var(--currency-icon-size) + 14px)` : position?.width;
  const transform = position ? expanded
    ? `translate3d(clamp(8px, calc(${position.x + position.width}px - ${width}), calc(100vw - ${width} - 8px)),${position.y}px,0)`
    : `translate3d(${position.x}px,${position.y}px,0)` : undefined;
  return <button type="button" className={`currency-counter currency-counter--${kind}${position ? ' currency-counter--floating' : ''}`}
    onClick={showExactAmount} disabled={!Number.isFinite(amount)} aria-expanded={expanded} data-expanded={expanded}
    style={{ visibility: hidden ? 'hidden' : undefined, transform, width, height: position?.height, flexBasis: expanded ? width : undefined }}
    title={`${full} ${kind === 'wallet' ? 'gobblars' : '€ de cagnotte'}`}
    aria-label={`${full} ${kind === 'wallet' ? 'gobblars' : 'euros de cagnotte'}`}>
    {kind === 'bank' && icon}<strong ref={text}>{expanded ? full : compactCurrency(amount)}</strong>{kind === 'wallet' && icon}
    <span ref={badge} className="currency-counter__gain" aria-hidden="true" />
  </button>;
}
