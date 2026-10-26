import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { GOTUS_WAITING_INVITATIONS, getGotusReminderKey, shouldOfferGotus } from "./gotusWaitingPolicy.js";

export function createGotusWaitingController({ now = Date.now, random = Math.random,
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  const store = createFeatureStore({ session: null, busy: false, dialog: null, remindersMuted: false });
  let config = {}, mounted = false, boundSocket = null, generation = 0, pendingEntry = null;
  let reminderLatch = null, joiningLive = false, pendingPresence = null;
  const timers = new Set(), pendingRequests = new Set();
  const schedule = (fn, delay) => {
    const timer = setTimeoutFn(() => { timers.delete(timer); fn(); }, delay);
    timers.add(timer);
    return timer;
  };
  const cancel = timer => { clearTimeoutFn(timer); timers.delete(timer); };
  const identity = () => ({ ...config.getIdentity?.(), type: "gotus" });
  const room = () => (config.roomsStats || []).find(value => value?.roomId === (store.getState().session?.roomId || identity().roomId));

  function checkReminder() {
    if (!store.getState().session) return;
    const key = getGotusReminderKey(room());
    if (!key) return;
    if (reminderLatch === key) return;
    reminderLatch = key;
    if (!store.getState().remindersMuted) store.set("dialog", { kind: "reminder" });
  }

  function request(event, payload) {
    return new Promise(resolve => {
      let complete = false;
      const finish = response => {
        if (complete) return;
        complete = true;
        cancel(timer);
        pendingRequests.delete(finish);
        resolve(response || { ok: false });
      };
      const timer = schedule(() => finish({ ok: false, error: "timeout" }), 8000);
      pendingRequests.add(finish);
      config.socket?.emit(event, payload, finish);
    });
  }

  async function ensureConnected() {
    if (config.socket?.connected) return true;
    try { return !!(await config.ensureConnection?.()); } catch { return false; }
  }

  function restorePresence() {
    const session = store.getState().session;
    if (!mounted || !session || joiningLive || !config.socket?.connected) return;
    config.socket.emit("training:standalone:presence", { ...identity(), ...session, type: "gotus" }, response => {
      if (!mounted || store.getState().session !== session) return;
      if (config.handleTrainingBlockedResponse?.(response)) close();
    });
  }

  function onConnect() {
    if (!store.getState().session) return;
    const version = generation;
    for (const delay of [900, 2400]) schedule(() => {
      if (version === generation) restorePresence();
    }, delay);
  }

  function configure(next) {
    config = { ...config, ...next };
    const socket = mounted ? config.socket : null;
    if (boundSocket !== socket) {
      boundSocket?.off("connect", onConnect);
      boundSocket = socket;
      boundSocket?.on("connect", onConnect);
    }
    if (config.authenticated === false && store.getState().session) close();
    if (store.getState().session && config.ensureTrainingAllowed?.() === false) close();
    checkReminder();
  }

  async function startTraining() {
    if (!mounted || store.getState().busy) return false;
    store.set("dialog", null);
    if (config.ensureAuthenticated?.() === false) return false;
    if (config.ensureTrainingAllowed?.() === false) return false;
    const version = ++generation;
    pendingEntry = null;
    reminderLatch = null;
    const startedAt = now();
    const session = { roomId: identity().roomId, sessionId: `gotus-training:${startedAt}:${random().toString(36).slice(2)}`, startedAt };
    store.patch({ dialog: null, busy: true });
    const connected = await ensureConnected();
    if (!mounted || version !== generation) return false;
    if (connected) {
      pendingPresence = session;
      const response = await request("training:standalone:presence", { ...identity(), ...session, type: "gotus" });
      if (!mounted || version !== generation) return false;
      pendingPresence = null;
      if (!response?.ok || config.ensureTrainingAllowed?.() === false) {
        store.set("busy", false);
        if (!config.handleTrainingBlockedResponse?.(response)) config.showToast?.("Impossible de lancer Gotus pour le moment. Réessaie dans quelques instants.", 3200);
        config.socket.emit("training:standalone:stop", { ...identity(), roomId: session.roomId, joinLive: false });
        return false;
      }
    } else if (config.canTrainOffline?.() === false) {
      store.set("busy", false);
      config.showToast?.("Connexion nécessaire pour vérifier ton temps de jeu avant de lancer Gotus.", 4000);
      return false;
    }
    config.onPrepareTraining?.();
    store.set("session", session);
    store.set("busy", false);
    if (!connected) config.showToast?.("Gotus est disponible ; la présence dans le live reviendra à la reconnexion.", 3200);
    checkReminder();
    return true;
  }

  function requestEntry(enter) {
    if (!shouldOfferGotus(room())) { enter?.(); return false; }
    pendingEntry = enter;
    const index = Math.min(GOTUS_WAITING_INVITATIONS.length - 1, Math.floor(random() * GOTUS_WAITING_INVITATIONS.length));
    store.set("dialog", { kind: "offer", message: GOTUS_WAITING_INVITATIONS[index] });
    return true;
  }

  function enterAnyway() {
    const enter = pendingEntry;
    pendingEntry = null;
    store.set("dialog", null);
    enter?.();
  }

  function close() {
    ++generation;
    const session = store.getState().session || pendingPresence;
    pendingPresence = null;
    // If a join ACK was lost, reassert observer status before removing presence.
    // Both messages are ordered on the same socket.
    if (session && joiningLive && config.socket?.connected) {
      config.socket.emit("training:standalone:presence", { ...identity(), ...session, type: "gotus" });
    }
    joiningLive = false;
    if (session && config.socket?.connected) config.socket.emit("training:standalone:stop", { ...identity(), roomId: session.roomId, joinLive: false });
    store.patch({ session: null, busy: false, dialog: null });
    reminderLatch = null;
  }

  async function joinLive() {
    if (!store.getState().session || store.getState().busy) return false;
    const version = generation, session = store.getState().session;
    joiningLive = true;
    store.set("busy", true);
    const connected = await ensureConnected();
    if (!mounted || version !== generation) return false;
    const response = connected ? await request("training:standalone:stop", { ...identity(), roomId: session.roomId, joinLive: true }) : null;
    if (!mounted || version !== generation) return false;
    joiningLive = false;
    store.set("busy", false);
    if (config.handleTrainingBlockedResponse?.(response)) { close(); return false; }
    if (!response?.ok || !response.snapshot) {
      restorePresence();
      config.showToast?.("Le live n’a pas pu être rejoint. Vous pouvez réessayer.", 3200);
      return false;
    }
    ++generation;
    store.patch({ session: null, dialog: null });
    config.onJoinLive?.(response.snapshot);
    return true;
  }

  return { store, configure, startTraining, requestEntry, enterAnyway, close, joinLive,
    dismissDialog() { pendingEntry = null; store.set("dialog", null); },
    muteReminders(value) { store.set("remindersMuted", !!value); },
    start() { mounted = true; configure({}); },
    dispose() {
      close(); mounted = false;
      boundSocket?.off("connect", onConnect); boundSocket = null;
      for (const finish of [...pendingRequests]) finish({ ok: false, error: "disposed" });
      for (const timer of timers) clearTimeoutFn(timer);
      timers.clear();
    },
  };
}
