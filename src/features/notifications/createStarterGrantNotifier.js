// The server keeps the gift pending until its toast has actually been presented.
export function createStarterGrantNotifier({ userId, request, show, visible = () => true, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let disposed = false, settled = false, inFlight = null, acknowledgement = null, shownKey = null;
  async function refresh() {
    if (disposed || settled || !visible()) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const response = await request();
        if (disposed || !visible() || response?.userId !== userId) return;
        if (!response.grant) { settled = true; return; }
        const grant = response.grant;
        if (!grant.key || !grant.label || !(grant.amount > 0) || shownKey === grant.key) return;
        shownKey = grant.key;
        show(grant.label, 8000, { iconSrc: "/Gobblars.png", iconAlt: "Gobblars" });
        acknowledgement = setTimer(async () => {
          acknowledgement = null;
          if (disposed || !visible()) { shownKey = null; return; }
          try { await request(grant.key); settled = true; }
          catch { shownKey = null; }
        }, 8500);
      } catch { /* Retry on reconnect/focus; never mark an undelivered gift seen. */ }
    })();
    try { await inFlight; } finally { inFlight = null; }
  }
  return { refresh, dispose() { disposed = true; if (acknowledgement) clearTimer(acknowledgement); } };
}
