import React from "react";

export function useGlobalRedAnnouncement() {
  const [announcement, setAnnouncement] = React.useState(null);
  const hideTimerRef = React.useRef(null);
  const clearTimerRef = React.useRef(null);
  const rafRef = React.useRef(null);

  const clearTimers = React.useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const showGlobalRedAnnouncement = React.useCallback(
    (payload = {}, displayMs = 6500) => {
      const body =
        typeof payload?.body === "string" && payload.body.trim()
          ? payload.body.trim()
          : typeof payload?.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : "";
      if (!body) return;

      clearTimers();

      const safeDisplayMs = Math.max(1200, Math.round(Number(displayMs) || 6500));
      const next = {
        id:
          typeof payload?.id === "string" && payload.id.trim()
            ? payload.id.trim()
            : `global-red-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title:
          typeof payload?.title === "string" && payload.title.trim()
            ? payload.title.trim()
            : "Annonce serveur",
        body,
        createdAt: Number.isFinite(payload?.createdAt) ? payload.createdAt : Date.now(),
        author: typeof payload?.author === "string" ? payload.author.trim() : "",
        visible: false,
      };

      setAnnouncement(next);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setAnnouncement((prev) => (prev?.id === next.id ? { ...prev, visible: true } : prev));
      });
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        setAnnouncement((prev) => (prev?.id === next.id ? { ...prev, visible: false } : prev));
      }, safeDisplayMs);
      clearTimerRef.current = setTimeout(() => {
        clearTimerRef.current = null;
        setAnnouncement((prev) => (prev?.id === next.id ? null : prev));
      }, safeDisplayMs + 800);
    },
    [clearTimers]
  );

  React.useEffect(() => clearTimers, [clearTimers]);

  return { announcement, showGlobalRedAnnouncement };
}
