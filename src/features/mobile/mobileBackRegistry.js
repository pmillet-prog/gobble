// Mounted local dialogs can override the screen's back action without routing
// their private state through GobbleApplication.
export function createMobileBackRegistry() {
  const entries = new Map(), listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  return Object.freeze({
    register(callback) {
      const id = Symbol("mobile-back");
      entries.set(id, callback);
      notify();
      return () => { entries.delete(id); notify(); };
    },
    top: () => [...entries.values()].at(-1) || null,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
}
export const mobileBackRegistry = createMobileBackRegistry();
