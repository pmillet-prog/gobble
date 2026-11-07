import { createFeatureStore } from '../../app/core/createFeatureStore.js';

// Anchors reserve layout space; the two actual counters live in one portal.
export const currencyAnchors = (() => {
  const store = createFeatureStore({ wallet: null, bank: null });
  const entries = new Map();
  let observer = null, frame = null, users = 0;
  function measure() {
    frame = null;
    const next = { wallet: null, bank: null };
    for (const entry of entries.values()) {
      if (!entry.node.isConnected || entry.node.closest('[inert]')) continue;
      const rect = entry.node.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      if (next[entry.kind]?.priority > entry.priority) continue;
      next[entry.kind] = { x: rect.left, y: rect.top, width: rect.width, height: rect.height,
        priority: entry.priority, bank: entry.bank };
    }
    if (JSON.stringify(next) !== JSON.stringify(store.getState())) store.replace(next);
  }
  function refresh() { if (users && frame === null) frame = requestAnimationFrame(measure); }
  return { store, register(node, values) {
    const key = Symbol(); entries.set(key, { node, ...values });
    observer?.observe(node); if (node.parentElement) observer?.observe(node.parentElement); refresh();
    return () => { entries.delete(key); observer?.unobserve(node);
      if (node.parentElement && ![...entries.values()].some(entry => entry.node.parentElement === node.parentElement)) observer?.unobserve(node.parentElement);
      refresh(); };
  }, start() {
    if (++users === 1) {
      observer = new ResizeObserver(refresh);
      for (const entry of entries.values()) { observer.observe(entry.node); if (entry.node.parentElement) observer.observe(entry.node.parentElement); }
      window.addEventListener('resize', refresh); window.visualViewport?.addEventListener('resize', refresh);
      window.visualViewport?.addEventListener('scroll', refresh); refresh();
    }
    return () => { if (--users) return;
      observer.disconnect(); observer = null; cancelAnimationFrame(frame); frame = null;
      window.removeEventListener('resize', refresh); window.visualViewport?.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('scroll', refresh); store.replace({ wallet: null, bank: null });
    };
  } };
})();
