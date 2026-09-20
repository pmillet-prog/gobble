import { normalizeAvatar } from "./avatarState.js";
import { avatarApiError } from "./avatarApi.js";

const IDLE = Object.freeze({ userId: null, avatar: null, revision: null, ready: false });

// One authenticated account owns requests and listeners; no polling or rendering here.
export function createAccountAvatarSync({ request, readLocal, cacheLocal, prepareLocal = normalizeAvatar, onAccepted = () => {}, onWeeklyAuras = () => {} }) {
  let session = null, snapshot = IDLE;
  const listeners = new Set();
  const rewardListeners = new Set();
  const receiveRewards = payload => {
    if (payload?.userId !== session?.userId || !Array.isArray(payload.rewards)) return;
    for (const listener of rewardListeners) listener(payload);
  };
  const publish = next => { snapshot = next; listeners.forEach(listener => listener()); };
  const assertActive = active => {
    if (active !== session || active.controller.signal.aborted) throw avatarApiError("avatar_account_changed");
  };
  const accept = (active, data) => {
    assertActive(active);
    if (data.userId !== active.userId) throw avatarApiError("avatar_account_changed");
    const value = data.avatar ? normalizeAvatar(data.avatar) : null;
    const avatar = JSON.stringify(snapshot.avatar) === JSON.stringify(value) ? snapshot.avatar : value;
    // The account is authoritative even if local storage is full or disabled.
    if (data.avatar) { try { cacheLocal(active.userId, avatar); } catch { /* Optional cache. */ } }
    publish({ userId: active.userId, avatar, revision: data.revision, ready: true });
    onAccepted(snapshot);
    onWeeklyAuras(data.weeklyAuras);
    receiveRewards({ userId: active.userId, rewards: data.rewards });
    return snapshot;
  };
  const call = (active, options = {}) => {
    assertActive(active);
    return request(active.userId, { ...options, signal: active.controller.signal });
  };

  function refresh() {
    const active = session;
    if (!active) return Promise.reject(avatarApiError("auth_required"));
    if (active.write) return active.write;
    if (active.read) return active.read;
    const task = (async () => {
      let data = await call(active);
      assertActive(active);
      // Import an existing local avatar only into an empty account. Revision 0 is
      // an atomic create: a second device can never replace the first migration.
      const local = !data.avatar && !data.unlocksRequired ? readLocal(active.userId) : null;
      if (local) {
        try { data = await call(active, { avatar: await prepareLocal(local), expectedRevision: 0 }); }
        catch (error) {
          if (error.code !== "avatar_conflict") throw error;
          data = await call(active);
        }
      }
      return accept(active, data);
    })();
    active.read = task;
    const clear = () => { if (active.read === task) active.read = null; };
    task.then(clear, clear);
    return task;
  }

  function save(userId, value, expectedRevision) {
    const active = session;
    if (!active || active.userId !== Number(userId)) return Promise.reject(avatarApiError("avatar_account_changed"));
    if (active.write) return Promise.reject(avatarApiError());
    const read = active.read;
    const task = (async () => {
      // Finish older reads before writing; a delayed GET cannot undo this save.
      if (read) await read;
      const data = await call(active, { avatar: normalizeAvatar(value), expectedRevision });
      return accept(active, data);
    })();
    active.write = task;
    const clear = () => { if (active.write === task) active.write = null; };
    task.then(clear, clear);
    return task;
  }

  return {
    receiveRewards,
    subscribeRewards(listener) { rewardListeners.add(listener); return () => rewardListeners.delete(listener); },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh, save,
    refreshAfterPending() {
      const active = session, pending = active?.write || active?.read;
      if (!pending) return refresh();
      return pending.catch(() => {}).then(() => { assertActive(active); return refresh(); });
    },
    connect(userId) {
      session?.controller.abort();
      const active = { userId: Number(userId), controller: new AbortController(), read: null, write: null };
      session = active;
      publish({ userId: active.userId, avatar: null, revision: null, ready: false });
      void refresh().catch(() => {}); // Opening the editor surfaces failures and offers retry.
      return () => {
        active.controller.abort();
        if (session === active) { session = null; publish(IDLE); }
      };
    },
  };
}
