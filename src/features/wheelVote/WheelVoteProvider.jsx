import React from 'react';
import { useApplicationSelector } from '../../app/react/ApplicationRuntimeProvider.jsx';
import { createWheelVoteController } from './createWheelVoteController.js';
import WheelVoteDialog, { VoteDialogFrame } from './WheelVoteDialog.jsx';

const VoteContext = React.createContext(null);
export function WheelVoteProvider({ enabled, children }) {
  const [controller] = React.useState(createWheelVoteController);
  const userId = useApplicationSelector(state => state.session.authState.status === 'authenticated' ? state.session.authState.user?.id : null);
  React.useEffect(() => { controller.setAccount(enabled ? userId || null : null); }, [controller, enabled, userId]);
  React.useEffect(() => () => controller.dispose(), [controller]);
  return <VoteContext.Provider value={controller}>{children}<WheelVoteSatellite controller={controller} /></VoteContext.Provider>;
}
function WheelVoteSatellite({ controller }) {
  const state = React.useSyncExternalStore(controller.store.subscribe, controller.store.getState);
  if (!state.userId) return null;
  if (state.loading || state.error && !state.open) return <VoteDialogFrame title="Vote sur l’avenir de la roue">
    <div className="wheel-vote__body">{state.loading ? <p role="status">Chargement…</p> : <p role="alert">{state.error}</p>}</div>
    {!state.loading && <footer><button onClick={controller.retry}>Réessayer</button></footer>}
  </VoteDialogFrame>;
  return state.open ? <WheelVoteDialog key={state.userId} state={state} controller={controller} /> : null;
}
export function ModifyWheelVoteButton({ className, onOpen }) {
  const controller = React.useContext(VoteContext);
  return controller ? <ModifyButton controller={controller} className={className} onOpen={onOpen} /> : null;
}
function ModifyButton({ controller, className, onOpen }) {
  const eligible = React.useSyncExternalStore(controller.store.subscribe, () => controller.store.getState().eligible);
  return eligible ? <button type="button" className={className} onClick={() => { onOpen?.(); controller.edit(); }}>Modifier mon vote</button> : null;
}
