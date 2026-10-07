import { useEffect, useState } from "react";
import { chalkboardSeenKey, hasUnseenChalkboardEntries, readChalkboardSeen } from "./chalkboardSeen.js";

export default function useChalkboardUnread(accountId, enabled = true) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    setUnread(false);
    if (!enabled) return;
    let disposed = false, pending = false, activity = null;
    const controller = new AbortController();
    const update = () => setUnread(hasUnseenChalkboardEntries(activity, readChalkboardSeen(accountId)));
    const refresh = async () => {
      if (disposed || pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const response = await fetch("/api/chalkboard/activity", { credentials: "include", signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        if (!disposed && payload?.ok) { activity = payload; update(); }
      } catch { /* Keep the last known badge; retry on the next visible refresh. */ }
      finally { pending = false; }
    };
    const onStorage = event => { if (event.key === chalkboardSeenKey(accountId) || event.key === null) update(); };
    void refresh();
    // A tiny status response, only while the home screen is mounted/visible.
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      disposed = true; controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [accountId, enabled]);
  return unread;
}
