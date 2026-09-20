export function createChatAvatarRevisions() {
  const records = new Map(), listeners = new Map();
  let generation = 0;
  const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  function publish(userId, record) {
    records.set(userId, record);
    if (records.size > 512) {
      for (const id of records.keys()) {
        if (!listeners.has(id)) { records.delete(id); break; }
      }
    }
    listeners.get(userId)?.forEach(listener => listener());
  }
  return {
    update({ userId, revision } = {}) {
      const id = validId(userId);
      if (!id || !Number.isSafeInteger(revision) || revision < 1) return;
      const current = records.get(id);
      if ((current?.revision || 0) >= revision) return;
      publish(id, { revision, generation: current?.generation || 0 });
    },
    refresh(userIds) {
      const stamp = ++generation;
      for (const raw of new Set(userIds)) {
        const id = validId(raw);
        if (id) publish(id, { revision: records.get(id)?.revision || 0, generation: stamp });
      }
    },
    url(userId) {
      const id = validId(userId);
      if (!id) return "";
      const entry = records.get(id);
      const params = new URLSearchParams();
      if (entry?.revision) params.set("v", String(entry.revision));
      if (entry?.generation) params.set("sync", String(entry.generation));
      return `/api/auth/avatars/${id}/chat.png${params.size ? `?${params}` : ""}`;
    },
    subscribe(userId, listener) {
      const id = validId(userId);
      if (!id) return () => {};
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id).add(listener);
      return () => {
        const set = listeners.get(id);
        set?.delete(listener);
        if (!set?.size) listeners.delete(id);
      };
    },
  };
}

export const chatAvatarRevisions = createChatAvatarRevisions();
