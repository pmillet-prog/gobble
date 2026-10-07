import { useEffect, useState } from "react";

export default function useGobblarsHistory(accountId) {
  const [request, setRequest] = useState({ page: 1 });
  const [state, setState] = useState({ entries: [], busy: true, error: "", nextBefore: null, snapshot: null });
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setState({ entries: [], busy: true, error: "", nextBefore: null, snapshot: null });
    const query = new URLSearchParams();
    if (request.before != null) query.set("before", request.before);
    if (request.snapshot != null) query.set("snapshot", request.snapshot);
    void (async () => {
      try {
        const response = await fetch(`/api/gobblars/history?${query}`, { credentials: "include", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload?.ok || String(payload.accountId) !== String(accountId) || !Array.isArray(payload.entries)) throw new Error("history_unavailable");
        if (!disposed) setState({ ...payload, busy: false, error: "" });
      } catch {
        if (!disposed) setState({ entries: [], busy: false, error: "Impossible de charger ton historique de gobblars pour le moment.", nextBefore: null, snapshot: null });
      } finally { clearTimeout(timeout); }
    })();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [accountId, request]);
  return {
    ...state, page: request.page,
    retry: () => setRequest(previous => ({ ...previous })),
    refresh: () => setRequest({ page: 1 }),
    next: () => setRequest({ page: request.page + 1, before: state.nextBefore, snapshot: state.snapshot }),
  };
}
