import React from 'react';
const Results = React.lazy(() => import('./WheelVoteResults.jsx'));

export default function WheelVoteResultsButton({ className }) {
  const [open, setOpen] = React.useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)}>Résultats du vote sur la roue</button>
    {open && <React.Suspense fallback={<p role="status">Chargement des votes…</p>}><Results onClose={() => setOpen(false)} /></React.Suspense>}</>;
}
