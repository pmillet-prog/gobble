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
  const state = React.useSyncExternalStore(
    kernel.subscribe,
    kernel.getState,
    kernel.getState
  );
  return selector(state);
}
