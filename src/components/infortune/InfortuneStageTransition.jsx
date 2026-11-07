import React from 'react';
import './infortuneStageTransition.css';

// Retain the outgoing mounted scene for the fade, then release its renderer.
// The server's phase and the incoming screen continue immediately underneath.
export default function InfortuneStageTransition({ viewKey, children }) {
  const latest = React.useRef(children);
  const [view, setView] = React.useState({ key: viewKey, previous: null });
  if (view.key !== viewKey) setView({ key: viewKey,
    previous: latest.current ? { key: view.key, content: latest.current } : null });
  else latest.current = children;
  React.useEffect(() => {
    if (!view.previous) return;
    const timer = setTimeout(() => setView(value => ({ ...value, previous: null })), 600);
    return () => clearTimeout(timer);
  }, [view.key, view.previous]);
  if (!children && !view.previous) return null;
  return <div className="infortune-stage-transition">
    {view.previous && <div key={view.previous.key} className="infortune-stage-transition__view" data-leaving="true" inert="" aria-hidden="true">{view.previous.content}</div>}
    {children && <div key={viewKey} className="infortune-stage-transition__view">{children}</div>}
  </div>;
}
