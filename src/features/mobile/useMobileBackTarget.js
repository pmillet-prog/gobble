import { useLayoutEffect, useRef } from "react";
import { mobileBackRegistry } from "./mobileBackRegistry.js";

export default function useMobileBackTarget(onBack, enabled = true) {
  const callback = useRef(onBack);
  useLayoutEffect(() => { callback.current = onBack; });
  const available = enabled && typeof onBack === "function";
  useLayoutEffect(() => {
    if (!available) return;
    return mobileBackRegistry.register(() => callback.current?.());
  }, [available]);
}
