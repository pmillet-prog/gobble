import React from 'react';
import { createPortal } from 'react-dom';
import './wheelResultExit.css';

const fragments = Array.from({ length: 40 }, (_, index) => ({ col: index % 8, row: Math.floor(index / 8),
  dx: ((index % 8) - 3.5) * (14 + index % 3 * 8), dy: (Math.floor(index / 8) - 2) * 25 - 18,
  delay: (index * 37 % 170) }));

export default function WheelResultExit({ state }) {
  const { phase, snapshot: shot, reduced } = state;
  if (!shot || phase === 'idle' || phase === 'done') return null;
  const transfer = shot.transfer && shot.target;
  const dx = transfer ? shot.target.x - shot.x : 0, dy = transfer ? shot.target.y - shot.y : -12;
  const halo = shot.halo;
  return createPortal(<div className="wheel-result-exit" data-phase={phase} data-transfer={!!transfer} data-reduced={reduced}
    role="status" aria-label={transfer ? `${shot.label} rejoint ta cagnotte` : shot.label}
    style={{ left: shot.x, top: shot.y, '--gain-dx': `${dx}px`, '--gain-dy': `${dy}px`,
      '--gain-mid-x': `${dx * .35}px`, '--gain-mid-y': `${dy * .4 - 35}px` }}>
    <div className="wheel-result-exit__halo" style={{ width: halo.width, height: halo.height, top: halo.offsetY || 0 }} aria-hidden="true">
      {fragments.map(({ col, row, dx, dy, delay }, index) => <i key={index} style={{
        left: col * halo.width / 8, top: row * halo.height / 5, width: halo.width / 8 + .5, height: halo.height / 5 + .5,
        backgroundImage: halo.image ? `url(${halo.image})` : halo.background,
        backgroundSize: `${halo.width}px ${halo.height}px`, backgroundPosition: `${-col * halo.width / 8}px ${-row * halo.height / 5}px`,
        '--fragment-x': `${dx}px`, '--fragment-y': `${dy}px`, '--fragment-delay': `${delay}ms`,
      }} />)}
    </div>
    {shot.caption && <img className="wheel-result-exit__caption" src={shot.caption.image} alt=""
      style={{ width: shot.caption.width, height: shot.caption.height, top: shot.caption.y }} />}
    <div className="wheel-result-exit__gain" aria-hidden="true" data-amount={!!shot.amountLabel} style={{ width: shot.width, height: shot.height,
      font: shot.font, color: shot.color, letterSpacing: shot.letterSpacing }}>
      <span className="wheel-result-exit__original">{shot.image ? <img src={shot.image} alt="" /> : shot.text}</span>
      {shot.amountLabel && <strong className="wheel-result-exit__amount" style={{ fontSize: shot.fontSize }}>{shot.amountLabel}</strong>}
    </div>
  </div>, document.body);
}
