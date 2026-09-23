import React from "react";
import { useOptionalApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";

const noopSubscribe = () => () => {};
export function selectMobileConnectionError(state) {
  return state?.navigation?.view === "live" && state?.session?.isLoggedIn
    ? state.session.connectionError || "" : "";
}

export default function MobileConnectionLabel({ fallback = "GOBBLE" }) {
  const kernel = useOptionalApplicationKernel();
  const snapshot = React.useCallback(() => selectMobileConnectionError(kernel?.getState()), [kernel]);
  const error = React.useSyncExternalStore(kernel?.subscribe || noopSubscribe, snapshot, snapshot);
  if (!error) return <>{fallback}</>;
  return <span role="status" aria-live="polite">
    <button type="button" className="text-[11px] font-bold text-amber-700 dark:text-amber-300 underline underline-offset-2"
      aria-label="Connexion interrompue. Réessayer la connexion" title={error}
      onClick={() => kernel?.features.prepare("connection").handleForeground("manual_retry")}>
      Reconnexion…
    </button>
  </span>;
}
