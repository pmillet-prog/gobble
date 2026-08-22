import React from "react";

import { useApplicationKernel } from "./ApplicationRuntimeProvider.jsx";

export function useFeatureRuntime(name) {
  const kernel = useApplicationKernel();
  const feature = kernel.features.prepare(name);

  React.useEffect(() => {
    const lease = kernel.features.acquire(name);
    return () => lease.release();
  }, [kernel, name]);
  return feature;
}

export function useFeatureSelector(feature, selector) {
  const selectorRef = React.useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = React.useCallback(
    () => selectorRef.current(feature.store.getState()),
    [feature]
  );
  return React.useSyncExternalStore(
    feature.store.subscribe,
    getSnapshot,
    getSnapshot
  );
}

export function useFeatureFields(feature, fields) {
  const cacheRef = React.useRef(null);
  return useFeatureSelector(feature, (state) => {
    const cached = cacheRef.current;
    if (
      cached &&
      fields.every((field) => Object.is(cached[field], state[field]))
    ) {
      return cached;
    }
    const values = Object.fromEntries(
      fields.map((field) => [field, state[field]])
    );
    cacheRef.current = values;
    return values;
  });
}
