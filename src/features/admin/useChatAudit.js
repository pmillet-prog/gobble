import { useCallback, useEffect, useRef, useState } from "react";
import { chatAuditError, requestChatAudit } from "./chatAuditClient.js";

export const chatAuditLast24Hours = () => {
  const to = Date.now();
  return { from: to - 24 * 60 * 60 * 1000, to, query: "" };
};

export function useChatAudit(connection) {
  const [state, setState] = useState({ entries: [], busy: false, error: "", nextBefore: null, retentionDays: 30 });
  const filters = useRef(chatAuditLast24Hours());
  const cancel = useRef(null);
  const load = useCallback((nextFilters, before = null) => {
    cancel.current?.();
    filters.current = nextFilters;
    // Bound mounted rows to one page and clear private data on errors/refetch.
    setState(previous => ({ ...previous, entries: [], nextBefore: null, busy: true, error: "" }));
    cancel.current = requestChatAudit(connection, { ...nextFilters, before }, response => {
      setState(previous => response?.ok
        ? { entries: response.entries, nextBefore: response.nextBefore, retentionDays: response.retentionDays, busy: false, error: "" }
        : { ...previous, busy: false, error: chatAuditError(response?.error) });
    });
  }, [connection]);
  useEffect(() => {
    load(filters.current);
    const clear = () => {
      cancel.current?.();
      setState(previous => ({ ...previous, entries: [], nextBefore: null, busy: false, error: chatAuditError("disconnected") }));
    };
    connection.on("disconnect", clear);
    return () => { cancel.current?.(); connection.off("disconnect", clear); };
  }, [connection, load]);
  return { ...state, load, next: () => load(filters.current, state.nextBefore), first: () => load(filters.current) };
}
