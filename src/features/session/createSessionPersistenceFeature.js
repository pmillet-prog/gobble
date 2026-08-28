import { normalizeStoredPlayerIdentityKey } from "../../app/adapters/browserIdentity.js";
import { isLiveSessionFreshForBoot } from "../../utils/liveSessionFreshness.js";

const SESSION_STORAGE_KEY = "gobble_session_v1";
const ACTIVITY_HEARTBEAT_MS = 15_000;
const ACTIVITY_WRITE_MIN_INTERVAL_MS = 5_000;

export function createSessionPersistenceFeature(
  { scope },
  {
    clearIntervalFn = clearInterval,
    now = Date.now,
    setIntervalFn = setInterval,
    storage = globalThis.localStorage,
    windowTarget = globalThis.window,
  } = {}
) {
  const refs = Object.freeze({
    autoResumeEnabled: { current: false },
    session: { current: null },
  });
  let active = false;
  let activityEnabled = false;
  let activityIntervalId = null;
  let bootResumeAttemptKey = "";
  let pageHideListener = null;

  function readStoredSession() {
    try {
      const raw = storage?.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.nick || !parsed?.roomId || !parsed?.installId) return null;
      return {
        ...parsed,
        installId: normalizeStoredPlayerIdentityKey(parsed.installId),
      };
    } catch (_) {
      return null;
    }
  }

  function hydrateStoredSession() {
    const stored = readStoredSession();
    if (stored) {
      refs.session.current = stored;
      refs.autoResumeEnabled.current = isLiveSessionFreshForBoot(stored, now());
    }
    return stored;
  }

  function persistSession(session, { fallbackInstallId = "" } = {}) {
    if (!session?.nick || !session?.roomId) return null;
    const installId = normalizeStoredPlayerIdentityKey(
      session.installId || fallbackInstallId
    );
    if (!installId) return null;
    const timestamp = now();
    const previousLoginAt = Number(
      session?.lastLoginAt ?? refs.session.current?.lastLoginAt
    );
    const payload = {
      nick: String(session.nick || "").trim(),
      roomId: session.roomId,
      installId,
      lastLoginAt:
        Number.isFinite(previousLoginAt) && previousLoginAt > 0
          ? previousLoginAt
          : timestamp,
      lastActiveAt: timestamp,
    };
    refs.session.current = payload;
    refs.autoResumeEnabled.current = true;
    try {
      storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
    return payload;
  }

  function migrateSessionInstallId({ legacyInstallIds = [], nextInstallId = "" } = {}) {
    const normalizedNextInstallId = normalizeStoredPlayerIdentityKey(nextInstallId);
    if (!normalizedNextInstallId) return null;
    const legacyIds = new Set(
      (Array.isArray(legacyInstallIds) ? legacyInstallIds : [])
        .map(normalizeStoredPlayerIdentityKey)
        .filter(Boolean)
    );
    legacyIds.delete(normalizedNextInstallId);
    if (legacyIds.size === 0) return null;
    const session = refs.session.current || readStoredSession();
    if (
      !session?.nick ||
      !session?.roomId ||
      !legacyIds.has(normalizeStoredPlayerIdentityKey(session.installId))
    ) {
      return null;
    }
    return persistSession(
      { ...session, installId: normalizedNextInstallId },
      { fallbackInstallId: normalizedNextInstallId }
    );
  }

  function touchSavedSessionActivity(timestamp = now()) {
    const session = refs.session.current;
    if (!session?.nick || !session?.roomId || !session?.installId) return false;
    const nextActivityAt = Number(timestamp);
    if (!Number.isFinite(nextActivityAt) || nextActivityAt <= 0) return false;
    const previousActivityAt = Number(session.lastActiveAt);
    if (
      Number.isFinite(previousActivityAt) &&
      nextActivityAt - previousActivityAt < ACTIVITY_WRITE_MIN_INTERVAL_MS
    ) {
      return false;
    }
    const payload = { ...session, lastActiveAt: nextActivityAt };
    refs.session.current = payload;
    try {
      storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
    return true;
  }

  function stopActivityHeartbeat() {
    if (activityIntervalId != null) clearIntervalFn(activityIntervalId);
    activityIntervalId = null;
    if (pageHideListener) {
      windowTarget?.removeEventListener?.("pagehide", pageHideListener);
      pageHideListener = null;
    }
  }

  function reconcileActivityHeartbeat() {
    if (!active || !activityEnabled) {
      stopActivityHeartbeat();
      return;
    }
    if (activityIntervalId != null) return;
    touchSavedSessionActivity();
    activityIntervalId = setIntervalFn(
      touchSavedSessionActivity,
      ACTIVITY_HEARTBEAT_MS
    );
    pageHideListener = () => touchSavedSessionActivity();
    windowTarget?.addEventListener?.("pagehide", pageHideListener);
  }

  function configureActivity({ enabled = false } = {}) {
    activityEnabled = !!enabled;
    reconcileActivityHeartbeat();
  }

  function clearSavedSession() {
    refs.session.current = null;
    refs.autoResumeEnabled.current = false;
    bootResumeAttemptKey = "";
    try {
      storage?.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {}
  }

  function hasSavedSession() {
    const session = refs.session.current;
    return Boolean(session?.nick && session?.roomId && session?.installId);
  }

  function claimBootResumeAttempt(key) {
    const nextKey = String(key || "");
    if (!nextKey || bootResumeAttemptKey === nextKey) return false;
    bootResumeAttemptKey = nextKey;
    return true;
  }

  function setAutoResumeEnabled(enabled) {
    refs.autoResumeEnabled.current = !!enabled;
  }

  function start() {
    active = true;
    reconcileActivityHeartbeat();
    scope.add(() => {
      active = false;
      activityEnabled = false;
      stopActivityHeartbeat();
      bootResumeAttemptKey = "";
      refs.autoResumeEnabled.current = false;
      refs.session.current = null;
    });
  }

  return Object.freeze({
    claimBootResumeAttempt,
    clearSavedSession,
    configureActivity,
    hasSavedSession,
    hydrateStoredSession,
    migrateSessionInstallId,
    persistSession,
    readStoredSession,
    refs,
    setAutoResumeEnabled,
    start,
    touchSavedSessionActivity,
  });
}
