import { useEffect, useMemo, useState } from "react";
import { getMedalDateId, normalizeDailyMedals } from "../../../shared/dailyMedals.js";

export default function useProfileMedals(snapshot, open = true) {
  const [now, setNow] = useState(Date.now);
  const expiresAt = Number(snapshot?.expiresAt) || 0;
  useEffect(() => {
    if (!open || !expiresAt) return;
    const refresh = () => setNow(Date.now());
    refresh();
    const remaining = expiresAt - Date.now();
    const timer = remaining > 0 ? setTimeout(refresh, Math.min(remaining + 20, 2147483647)) : null;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [expiresAt, open]);
  return useMemo(() => normalizeDailyMedals(
    snapshot?.dateId === getMedalDateId(now) && Number(snapshot.expiresAt) > now ? snapshot : null
  ), [snapshot, now]);
}
