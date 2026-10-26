import { isMaintenanceResponse, MAINTENANCE_RESPONSE_EVENT } from "./maintenanceResponse.js";

// No heartbeat: checks are driven by existing failed connection attempts or
// an API response carrying our maintenance marker. A plain network loss never
// navigates away from the game. Verify the page itself before reloading, since
// the API can be temporarily unavailable while the frontend is still running.
export function createMaintenanceRecovery({
  socket, windowObject = window, documentObject = document, fetchFn = fetch,
  now = Date.now, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout,
  retryDelayMs = 5000, timeoutMs = 4500,
}) {
  let active = false, pending = null, request = null, lastCheck = -Infinity, navigating = false;

  async function check() {
    pending = null;
    if (!active || navigating || request || documentObject.hidden || windowObject.navigator?.onLine === false) return;
    lastCheck = now();
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeoutFn(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(windowObject.location.href, {
        cache: "no-store", credentials: "same-origin", headers: { Accept: "text/html" }, signal: controller.signal,
      });
      if (response.status < 500) return;
      const body = await response.text();
      if (active && !controller.signal.aborted && isMaintenanceResponse(response.status, body)) {
        navigating = true;
        windowObject.location.reload();
      }
    } catch (_) {
      // Offline, timeout, or an aborted request is not proof of maintenance.
    } finally {
      clearTimeoutFn(timeout);
      if (request === controller) request = null;
    }
  }

  function schedule() {
    if (!active || navigating || pending !== null || request) return;
    pending = setTimeoutFn(check, Math.max(350, retryDelayMs - (now() - lastCheck)));
  }
  function onDisconnect(reason) {
    if (reason === "io client disconnect") cancelPending();
    else schedule();
  }
  function onVisible() {
    if (!documentObject.hidden && !socket.connected && socket.active) schedule();
  }
  function cancelPending() {
    if (pending !== null) clearTimeoutFn(pending);
    pending = null;
    request?.abort();
  }

  return {
    start() {
      if (active) return;
      active = true;
      socket.on("disconnect", onDisconnect);
      socket.on("connect_error", schedule);
      socket.on("connect", cancelPending);
      windowObject.addEventListener(MAINTENANCE_RESPONSE_EVENT, schedule);
      documentObject.addEventListener("visibilitychange", onVisible);
    },
    dispose() {
      active = false;
      cancelPending();
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", schedule);
      socket.off("connect", cancelPending);
      windowObject.removeEventListener(MAINTENANCE_RESPONSE_EVENT, schedule);
      documentObject.removeEventListener("visibilitychange", onVisible);
    },
  };
}
