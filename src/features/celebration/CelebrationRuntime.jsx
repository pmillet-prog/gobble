import React from "react";

import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

const CelebrationRuntimeContext = React.createContext(null);

export function CelebrationRuntimeProvider({ children }) {
  const feature = useFeatureRuntime("celebration");
  return (
    <CelebrationRuntimeContext.Provider value={feature}>
      {children}
    </CelebrationRuntimeContext.Provider>
  );
}

export function useCelebrationRuntime() {
  const feature = React.useContext(CelebrationRuntimeContext);
  if (!feature) {
    throw new Error(
      "useCelebrationRuntime must be used inside CelebrationRuntimeProvider"
    );
  }
  return feature;
}

export function useCelebrationSnapshot() {
  const feature = useCelebrationRuntime();
  return React.useSyncExternalStore(
    feature.subscribe,
    feature.getSnapshot,
    feature.getSnapshot
  );
}
