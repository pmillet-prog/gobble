let snapshot = null;
const listeners = new Set();
export const weeklyAuraStore = {
  getSnapshot: () => snapshot,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  update(value) {
    if (!Number.isFinite(value?.weekStartTs) || !Number.isFinite(value?.expiresAt) || !value.grants) return;
    if (snapshot && value.weekStartTs <= snapshot.weekStartTs) return;
    snapshot = value;
    listeners.forEach(listener => listener());
  },
};
