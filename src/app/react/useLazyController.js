import React from "react";

import {
  createLazyArrayControllerBridge,
  createLazyObjectControllerBridge,
} from "../core/createLazyControllerBridge.js";

export function useLazyArrayController(factory, runtime, methodCount) {
  const bridgeRef = React.useRef(null);
  if (!bridgeRef.current) {
    bridgeRef.current = createLazyArrayControllerBridge(factory, methodCount);
  }
  bridgeRef.current.update(runtime);
  return bridgeRef.current.methods;
}

export function useLazyObjectController(factory, runtime, methodNames) {
  const bridgeRef = React.useRef(null);
  if (!bridgeRef.current) {
    bridgeRef.current = createLazyObjectControllerBridge(factory, methodNames);
  }
  bridgeRef.current.update(runtime);
  return bridgeRef.current.methods;
}
