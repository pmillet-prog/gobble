import React from 'react';
import { createPortal } from 'react-dom';
import { useApplicationKernel } from '../../app/react/ApplicationRuntimeProvider.jsx';
import socket from '../../socket.js';
import { mobileBackRegistry } from '../mobile/mobileBackRegistry.js';
import { CLIENT_VERSION } from './clientVersion.js';
import { canPromptClientUpdate } from './clientUpdatePolicy.js';
import { createClientUpdate } from './createClientUpdate.js';
import './clientUpdate.css';

const blockBack = () => true;
function hasOtherDialog() {
  return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')]
    .some(element => !element.closest('.client-update') && element.getClientRects().length
      && getComputedStyle(element).visibility !== 'hidden');
}
export default function ClientUpdateSatellite() {
  const kernel = useApplicationKernel();
  const controller = React.useMemo(() => createClientUpdate({ currentVersion: CLIENT_VERSION, socket,
    canPrompt: () => canPromptClientUpdate(kernel.getState(), name => kernel.features.isActive(name)
      ? kernel.features.prepare(name).store.getState() : null,
    (!!mobileBackRegistry.top() && mobileBackRegistry.top() !== blockBack) || hasOtherDialog()),
    subscribeSafePoint(listener) {
      const releases = [kernel.subscribe(listener), mobileBackRegistry.subscribe(listener)];
      return () => releases.forEach(release => release());
    },
  }), [kernel]);
  const state = React.useSyncExternalStore(controller.store.subscribe, controller.store.getState, controller.store.getState);
  const button = React.useRef(null);
  React.useEffect(() => { controller.start(); return () => controller.stop(); }, [controller]);
  React.useEffect(() => {
    if (!state.visible) return;
    const root = document.getElementById('root'), previous = document.activeElement;
    const wasInert = root?.inert;
    if (root) root.inert = true;
    const release = mobileBackRegistry.register(blockBack);
    button.current?.focus({ preventScroll: true });
    const trap = event => {
      if (event.key === 'Tab' || event.key === 'Escape') { event.preventDefault(); button.current?.focus(); }
    };
    document.addEventListener('keydown', trap, true);
    return () => {
      if (root) root.inert = wasInert;
      document.removeEventListener('keydown', trap, true); release();
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, [state.visible]);
  if (!state.visible) return null;
  return createPortal(<div className="client-update-backdrop">
    <section className="client-update" role="alertdialog" aria-modal="true" aria-labelledby="client-update-title" aria-describedby="client-update-description">
      <span className="client-update__icon" aria-hidden="true">↻</span>
      <h2 id="client-update-title">Gobble a été mis à jour</h2>
      <p id="client-update-description">Une nouvelle version est disponible. Recharge le jeu pour continuer avec les dernières nouveautés et corrections.</p>
      <p className="client-update__saved">Ton compte, tes gobblars et tes réglages sont conservés.</p>
      {state.error && <p className="client-update__error" role="alert">{state.error}</p>}
      <button ref={button} type="button" aria-disabled={state.updating} onClick={() => void controller.update()}>
        {state.updating ? 'Chargement de la mise à jour…' : 'Mettre à jour le jeu'}
      </button>
    </section>
  </div>, document.body);
}
