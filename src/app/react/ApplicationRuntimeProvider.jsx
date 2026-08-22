import React from "react";

const ApplicationKernelContext = React.createContext(null);

export function ApplicationRuntimeProvider({ children, kernel }) {
  if (!kernel) {
    throw new Error("ApplicationRuntimeProvider requires an application kernel");
  }
  return (
    <ApplicationKernelContext.Provider value={kernel}>
      {children}
    </ApplicationKernelContext.Provider>
  );
}

export function useApplicationKernel() {
  const kernel = React.useContext(ApplicationKernelContext);
  if (!kernel) {
    throw new Error("useApplicationKernel must be used inside ApplicationRuntimeProvider");
  }
  return kernel;
}

export function useApplicationSelector(selector) {
  const kernel = useApplicationKernel();
  const selectorRef = React.useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = React.useCallback(
    () => selectorRef.current(kernel.getState()),
    [kernel]
  );
  return React.useSyncExternalStore(
    kernel.subscribe,
    getSnapshot,
    getSnapshot
  );
}

export function useApplicationFields(sliceName, fields) {
  const cacheRef = React.useRef(null);
  const selector = React.useCallback(
    (state) => {
      const slice = state?.[sliceName] || {};
      const cached = cacheRef.current;
      if (
        cached &&
        fields.every((field) => Object.is(cached.values[field], slice[field]))
      ) {
        return cached.values;
      }
      const values = Object.fromEntries(
        fields.map((field) => [field, slice[field]])
      );
      cacheRef.current = { values };
      return values;
    },
    [fields, sliceName]
  );
  return useApplicationSelector(selector);
}
