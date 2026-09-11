export const PRESENTER_HINT_KEYS = Object.freeze({
  romejko: "romejko",
  lepers: "lepers",
  capello: "capello",
  pivot: "pivot",
});

const PRESENTER_KEYS = Object.freeze(Object.values(PRESENTER_HINT_KEYS));
const STUNNED_PRESENTERS_STORAGE_KEY = "gobble.presenter.stunned.v1";
const PRESENTER_KEY_BY_CATEGORY = Object.freeze({
  coach: PRESENTER_HINT_KEYS.capello,
  culture: PRESENTER_HINT_KEYS.lepers,
  detective: PRESENTER_HINT_KEYS.romejko,
  linguist: PRESENTER_HINT_KEYS.pivot,
  statistician: PRESENTER_HINT_KEYS.romejko,
});

function readStunnedPresenterRecord(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(STUNNED_PRESENTERS_STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeStunnedPresenterRecord(storage, record) {
  try {
    storage?.setItem?.(STUNNED_PRESENTERS_STORAGE_KEY, JSON.stringify(record));
  } catch (_) {}
}

function getScopeId(roundId, phaseKey) {
  return `${String(roundId || "")}:${String(phaseKey || "")}`;
}

function getDefaultStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch (_) {
    return null;
  }
}

function createEmptyEntries(stunnedKeys = []) {
  const stunnedSet = new Set(Array.isArray(stunnedKeys) ? stunnedKeys : []);
  return Object.fromEntries(
    PRESENTER_KEYS.map((key) => [
      key,
      Object.freeze({
        hasHint: false,
        pending: false,
        stunned: stunnedSet.has(key),
      }),
    ])
  );
}

export function createPresenterHintsController({
  storage = getDefaultStorage(),
  realtime = null,
  scope = null,
} = {}) {
  let snapshot = Object.freeze({
    phaseKey: "",
    roundId: "",
    entries: Object.freeze(createEmptyEntries()),
  });
  const listeners = new Set();
  const requestListeners = new Map(
    PRESENTER_KEYS.map((key) => [key, new Set()])
  );
  const interruptionListeners = new Map(
    PRESENTER_KEYS.map((key) => [key, new Set()])
  );
  const interventionListeners = new Map(
    PRESENTER_KEYS.map((key) => [key, new Set()])
  );
  const latestInterventions = new Map();
  let interventionHost = null;
  let realtimeUnsubscribe = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const getStoredStunnedKeys = (roundId, phaseKey) => {
    const record = readStunnedPresenterRecord(storage);
    return record?.scopeId === getScopeId(roundId, phaseKey) &&
      Array.isArray(record.keys)
      ? record.keys.filter((key) => PRESENTER_KEYS.includes(key))
      : [];
  };

  const persistStunnedEntries = () => {
    const keys = PRESENTER_KEYS.filter((key) => snapshot.entries[key]?.stunned);
    writeStunnedPresenterRecord(storage, {
      keys,
      scopeId: getScopeId(snapshot.roundId, snapshot.phaseKey),
    });
  };

  const commitEntry = (key, nextEntry) => {
    const current = snapshot.entries[key];
    if (
      current?.hasHint === nextEntry.hasHint &&
      current?.pending === nextEntry.pending &&
      current?.stunned === nextEntry.stunned
    ) {
      return;
    }
    snapshot = Object.freeze({
      ...snapshot,
      entries: Object.freeze({
        ...snapshot.entries,
        [key]: Object.freeze(nextEntry),
      }),
    });
    emit();
  };

  const createScopedEntries = (roundId, phaseKey) => {
    const entries = createEmptyEntries(getStoredStunnedKeys(roundId, phaseKey));
    if (!roundId) return entries;
    for (const [key, event] of latestInterventions.entries()) {
      const eventRoundId = event?.roundId == null ? "" : String(event.roundId);
      if (!eventRoundId || eventRoundId !== roundId) continue;
      const stunned = !!entries[key]?.stunned;
      entries[key] = Object.freeze({
        hasHint: true,
        pending: !stunned,
        stunned,
      });
    }
    return entries;
  };

  const retainIntervention = (rawEvent) => {
    const category = String(rawEvent?.meta?.category || "").trim();
    const key = PRESENTER_KEY_BY_CATEGORY[category] || "";
    const text = String(rawEvent?.text || "").trim();
    if (!key || !text) return false;
    const event = Object.freeze({
      ...rawEvent,
      text,
      roundId: rawEvent?.roundId || rawEvent?.meta?.roundId || null,
      highlights: Array.isArray(rawEvent?.highlights)
        ? rawEvent.highlights
        : Array.isArray(rawEvent?.meta?.highlights)
        ? rawEvent.meta.highlights
        : [],
      ...(typeof rawEvent?.meta?.chatCopyText === "string" &&
      rawEvent.meta.chatCopyText.trim()
        ? { chatCopyText: rawEvent.meta.chatCopyText.trim() }
        : null),
    });
    const previous = latestInterventions.get(key);
    if (event.id && previous?.id === event.id) return false;
    latestInterventions.set(key, event);
    const eventRoundId = event.roundId == null ? "" : String(event.roundId);
    if (eventRoundId && eventRoundId === snapshot.roundId) {
      const stunned = !!snapshot.entries[key]?.stunned;
      commitEntry(key, { hasHint: true, pending: !stunned, stunned });
    }
    for (const listener of interventionListeners.get(key) || []) {
      listener(event);
    }
    return true;
  };

  const controller = {
    getInterventionHost() {
      return interventionHost;
    },
    getLatestIntervention(key) {
      return latestInterventions.get(key) || null;
    },
    getSnapshot() {
      return snapshot;
    },
    markAvailable(key, roundId = null) {
      if (!requestListeners.has(key)) return false;
      const eventRoundId = roundId == null ? "" : String(roundId);
      if (eventRoundId && snapshot.roundId && eventRoundId !== snapshot.roundId) {
        return false;
      }
      const stunned = !!snapshot.entries[key]?.stunned;
      commitEntry(key, { hasHint: true, pending: !stunned, stunned });
      return true;
    },
    markStunned(key) {
      const current = snapshot.entries[key];
      if (!current) return false;
      commitEntry(key, {
        hasHint: current.hasHint,
        pending: false,
        stunned: true,
      });
      persistStunnedEntries();
      return true;
    },
    hydrateInterventions(events = []) {
      for (const event of Array.isArray(events) ? events : []) {
        retainIntervention(event);
      }
    },
    request(key, request = null) {
      if (!snapshot.entries[key]?.hasHint || snapshot.entries[key]?.stunned) {
        return false;
      }
      commitEntry(key, { hasHint: true, pending: false, stunned: false });
      for (const [otherKey, listeners] of interruptionListeners.entries()) {
        if (otherKey === key) continue;
        for (const listener of listeners) listener({ nextKey: key });
      }
      for (const listener of requestListeners.get(key) || []) listener(request);
      return true;
    },
    setScope(roundId = null, phaseKey = null) {
      const nextRoundId = roundId == null ? "" : String(roundId);
      const nextPhaseKey = phaseKey == null ? "" : String(phaseKey);
      if (
        snapshot.roundId === nextRoundId &&
        snapshot.phaseKey === nextPhaseKey
      ) {
        return;
      }
      snapshot = Object.freeze({
        phaseKey: nextPhaseKey,
        roundId: nextRoundId,
        entries: Object.freeze(createScopedEntries(nextRoundId, nextPhaseKey)),
      });
      emit();
    },
    setRound(roundId = null) {
      const nextRoundId = roundId == null ? "" : String(roundId);
      if (snapshot.roundId === nextRoundId) return;
      snapshot = Object.freeze({
        phaseKey: snapshot.phaseKey,
        roundId: nextRoundId,
        entries: Object.freeze(createScopedEntries(nextRoundId, snapshot.phaseKey)),
      });
      emit();
    },
    setInterventionHost(element, mode = "above") {
      if (!element) return () => {};
      const registration = Object.freeze({ element, mode: String(mode || "above") });
      interventionHost = registration;
      return () => {
        if (interventionHost === registration) interventionHost = null;
      };
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeRequests(key, listener) {
      const keyListeners = requestListeners.get(key);
      if (!keyListeners || typeof listener !== "function") return () => {};
      keyListeners.add(listener);
      return () => keyListeners.delete(listener);
    },
    subscribeInterruptions(key, listener) {
      const keyListeners = interruptionListeners.get(key);
      if (!keyListeners || typeof listener !== "function") return () => {};
      keyListeners.add(listener);
      return () => keyListeners.delete(listener);
    },
    subscribeInterventions(key, listener) {
      const keyListeners = interventionListeners.get(key);
      if (!keyListeners || typeof listener !== "function") return () => {};
      keyListeners.add(listener);
      const latest = latestInterventions.get(key);
      if (latest) listener(latest);
      return () => keyListeners.delete(listener);
    },
    start() {
      if (realtimeUnsubscribe || typeof realtime?.bind !== "function") return;
      realtimeUnsubscribe = realtime.bind({
        presenterIntervention: retainIntervention,
      });
      scope?.add?.(() => {
        realtimeUnsubscribe?.();
        realtimeUnsubscribe = null;
        latestInterventions.clear();
        for (const keyListeners of interventionListeners.values()) {
          keyListeners.clear();
        }
      });
    },
  };
  return Object.freeze(controller);
}

export function createPresenterHintsFeature(context) {
  return createPresenterHintsController({
    realtime: context?.ports?.realtime || null,
    scope: context?.scope || null,
  });
}
