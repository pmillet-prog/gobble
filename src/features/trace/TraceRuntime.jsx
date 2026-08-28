import React from "react";

import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

const TraceRuntimeContext = React.createContext(null);

export function TraceRuntimeProvider({ children }) {
  const feature = useFeatureRuntime("trace");
  return (
    <TraceRuntimeContext.Provider value={feature}>
      {children}
    </TraceRuntimeContext.Provider>
  );
}

export function useTraceRuntime() {
  const feature = React.useContext(TraceRuntimeContext);
  if (!feature) {
    throw new Error("useTraceRuntime must be used inside TraceRuntimeProvider");
  }
  return feature;
}

export function useTraceSnapshot() {
  const feature = useTraceRuntime();
  return React.useSyncExternalStore(
    feature.subscribe,
    feature.getSnapshot,
    feature.getSnapshot
  );
}
