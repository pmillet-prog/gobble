import React from "react";
import useOverlayViewport from "../../hooks/useOverlayViewport.js";
import { lockMobileGameDocument } from "../../features/layout/mobileGameViewport.js";
import "./infortuneGameSurface.css";
import { GameBalanceSlot } from "../../features/gobblars/GameBalances.jsx";
import { useOptionalApplicationKernel } from '../../app/react/ApplicationRuntimeProvider.jsx';
import { useFeatureRuntime, useFeatureSelector } from '../../app/react/useFeatureRuntime.js';
import './infortuneNativeTheme.css';
import { InfortuneSocialDockContext } from './infortuneSurfaceContexts.js';
export const InfortunePreparationContext = React.createContext(false);

// The same viewport surface is used by the game and its local trials.
export default function InfortuneGameSurface(props) {
  const kernel = useOptionalApplicationKernel();
  return props.variant === 'game' && kernel ? <ThemedSurface {...props} /> : <Surface {...props} />;
}
function ThemedSurface(props) {
  const preferences = useFeatureRuntime('preferences');
  const darkMode = useFeatureSelector(preferences, state => !!state.themeApplied?.darkMode);
  return <Surface {...props} darkMode={darkMode} />;
}
function Surface({ title = "La roue de l’infortune", subtitle, headingExtra, bank, wallet, actions, leadingActions, onClose, closeLabel = "Quitter cet essai", children, variant, darkMode = false }) {
  const viewport = useOverlayViewport();
  const preparing = React.useContext(InfortunePreparationContext);
  const socialDock = React.useContext(InfortuneSocialDockContext);
  React.useLayoutEffect(() => { if (!preparing) return lockMobileGameDocument({}); }, [preparing]);
  return <main ref={viewport} className={`infortune-game${socialDock ? ' infortune-game--social' : ''}${variant === 'game' ? ' infortune-game--native' : ''}${darkMode ? ' dark' : ''}`} aria-label={title}>
    <header className="infortune-game__header">
      <GameBalanceSlot kind="wallet" wallet={wallet} priority={120} />
      {leadingActions && <div className="infortune-game__actions infortune-game__actions--leading">{leadingActions}</div>}
      <div className="infortune-game__identity"><div><h1>{title}</h1>{headingExtra}{subtitle && <p>{subtitle}</p>}</div></div>
      <div className="infortune-game__actions">{actions}{onClose && <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}>✕</button>}</div>
      <GameBalanceSlot kind="bank" bank={bank} priority={120} />
    </header>
    <div className="infortune-game__body">{children}</div>
    {socialDock}
  </main>;
}

export function InfortuneGameDialog({ title, onClose, children }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const node = ref.current, previous = document.activeElement;
    node.showModal();
    return () => { node.close(); previous?.isConnected && previous.focus?.({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="infortune-game-dialog" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Fermer">✕</button></header>
    <div className="infortune-game-dialog__content">{children}</div>
  </dialog>;
}
