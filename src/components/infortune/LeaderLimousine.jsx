import React from 'react';
import LeaderAvatar from './LeaderAvatar.jsx';
import { LEADER_LIMOUSINE } from '../../features/infortune/leaderSceneAssets.js';
import './leaderLimousine.css';

export default function LeaderLimousine({ leaders, frames, elapsed, duration }) {
  const ref = React.useRef(null), count = Math.max(1, leaders.length), width = 252 + count * 120;
  const [layout, setLayout] = React.useState({ scale: .7, from: 0, to: 0 });
  React.useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width: available, height } = entry.contentRect;
      const scale = Math.max(.22, Math.min(1.15, (height - 12) / 270, count <= 3 ? (available - 12) / width : Math.max(.65, (available - 12) / width)));
      const rendered = width * scale;
      const overflow = rendered > available - 12;
      setLayout({ scale, from: overflow ? available - rendered - 8 : (available - rendered) / 2 - 14,
        to: overflow ? 8 : (available - rendered) / 2 + 14 });
    });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [count, width]);
  return <div ref={ref} className="wheel-leaders__cast wheel-limousine-track" aria-label="La limousine des joueurs en tête">
    <div className="wheel-limousine-motion" style={{ '--limo-from': `${layout.from}px`, '--limo-to': `${layout.to}px`, '--walk-duration': `${duration}ms`, '--walk-delay': `${-elapsed}ms` }}>
      <div className="wheel-limousine" style={{ width, '--limo-scale': layout.scale, '--limo-image': `url("${LEADER_LIMOUSINE}")` }}>
        <div className="wheel-limousine__rear"><i className="wheel-limousine__wheel" /></div>
        {leaders.map((player, index) => <figure className="wheel-limousine__seat" key={player.id} style={{ '--hop-delay': `${-elapsed - index * 170}ms` }}>
          <div className="wheel-limousine__backrest" aria-hidden="true" />
          <div className="wheel-limousine__passenger"><LeaderAvatar poses={frames.get(player.id)} nick={player.nick} /></div>
          <div className="wheel-limousine__door" aria-hidden="true" />
          <figcaption title={player.nick} style={{ fontSize: Math.min(22, 12 / layout.scale) }}>{player.nick}</figcaption>
          <div className="wheel-leaders__coins" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} style={{ '--coin-index': i }}>G</i>)}</div>
        </figure>)}
        <div className="wheel-limousine__front"><i className="wheel-limousine__wheel" /></div>
      </div>
    </div>
  </div>;
}
