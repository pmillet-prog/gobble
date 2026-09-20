import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_AVATAR, normalizeAvatar } from "./avatarState.js";

const PREFIX = "gobble:avatar:v1:";
const listeners = new Set();
const cache = new Map();
const keyFor = userId => Number.isInteger(Number(userId)) && Number(userId) > 0 ? PREFIX + Number(userId) : null;
export function readSavedLocalAvatar(userId) {
  const key = keyFor(userId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" && !Array.isArray(value) ? normalizeAvatar(value) : null;
  } catch { return null; }
}

export function cacheAccountAvatar(userId, avatar) {
  const key = keyFor(userId);
  if (!key || typeof window === "undefined") return;
  try {
    const old = window.localStorage.getItem(key);
    if (old === JSON.stringify(normalizeAvatar(avatar))) return;
    const backupKey = `gobble:avatar:before-account-sync:${Number(userId)}`;
    if (old && !window.localStorage.getItem(backupKey)) window.localStorage.setItem(backupKey, old);
  } catch { /* Backup is best effort, as is this device's cache. */ }
  saveLocalAvatar(userId, avatar);
}
export function getLocalAvatar(userId) {
  const key = keyFor(userId);
  if (!key || typeof window === "undefined") return DEFAULT_AVATAR;
  let raw;
  try { raw = window.localStorage.getItem(key); } catch { return DEFAULT_AVATAR; }
  if (cache.get(key)?.raw === raw) return cache.get(key).value;
  let value = DEFAULT_AVATAR;
  try { if (raw) value = normalizeAvatar(JSON.parse(raw)); } catch { /* Invalid storage uses the default. */ }
  cache.set(key, { raw, value });
  return value;
}
function notify() { listeners.forEach(listener => listener()); }
function onStorage(event) { if (event.key === null || event.key.startsWith(PREFIX)) notify(); }
export function subscribeLocalAvatar(listener) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { window.removeEventListener("storage", onStorage); cache.clear(); }
  };
}
export function useLocalAvatar(userId) {
  return useSyncExternalStore(subscribeLocalAvatar, useCallback(() => getLocalAvatar(userId), [userId]), () => DEFAULT_AVATAR);
}
export function saveLocalAvatar(userId, value) {
  const key = keyFor(userId);
  if (!key) throw Error("Compte indisponible.");
  const avatar = normalizeAvatar(value);
  try { window.localStorage.setItem(key, JSON.stringify(avatar)); }
  catch { throw Error("La sauvegarde sur cet appareil est indisponible. Réessaie en autorisant le stockage du navigateur."); }
  cache.set(key, { raw: JSON.stringify(avatar), value: avatar });
  notify();
}
