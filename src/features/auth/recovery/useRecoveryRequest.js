import { useEffect, useRef, useState } from "react";
import { accountRecoveryRequest } from "./accountRecoveryApi.js";

export function useRecoveryRequest() {
  const pending = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(path, body) {
    if (pending.current) return false;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      await accountRecoveryRequest(path, body, { signal: controller.signal });
      return !controller.signal.aborted;
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message);
      return false;
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return { submit, loading, error, setError };
}
