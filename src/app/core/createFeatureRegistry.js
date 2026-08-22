import { createResourceScope } from "./createResourceScope.js";

export function createFeatureRegistry(context = {}) {
  const definitions = new Map();
  const active = new Map();
  let disposed = false;

  function define(name, factory) {
    const key = String(name || "").trim();
    if (!key || typeof factory !== "function") {
      throw new Error("Feature definitions require a name and a factory");
    }
    if (disposed) throw new Error("Feature registry is disposed");
    if (definitions.has(key)) throw new Error(`Feature already defined: ${key}`);
    definitions.set(key, factory);
  }

  function acquire(name) {
    const key = String(name || "").trim();
    if (disposed) throw new Error("Feature registry is disposed");
    const feature = prepare(key);
    const entry = active.get(key);
    if (!entry.started) {
      entry.started = true;
      feature?.start?.();
    }
    entry.references += 1;
    let released = false;
    return Object.freeze({
      feature: entry.feature,
      release() {
        if (released) return;
        released = true;
        entry.references -= 1;
        if (entry.references > 0) return;
        queueMicrotask(() => {
          if (entry.references > 0 || active.get(key) !== entry) return;
          active.delete(key);
          entry.feature?.stop?.();
          entry.scope.dispose();
        });
      },
    });
  }

  function prepare(name) {
    const key = String(name || "").trim();
    if (disposed) throw new Error("Feature registry is disposed");
    let entry = active.get(key);
    if (entry) return entry.feature;
    const factory = definitions.get(key);
    if (!factory) throw new Error(`Unknown feature: ${key}`);
    const scope = createResourceScope(`feature:${key}`);
    const feature = factory(Object.freeze({ ...context, scope }));
    entry = { feature, references: 0, scope, started: false };
    active.set(key, entry);
    return feature;
  }

  function isActive(name) {
    const entry = active.get(String(name || "").trim());
    return !!entry && entry.references > 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const entry of [...active.values()].reverse()) {
      entry.feature?.stop?.();
      entry.scope.dispose();
    }
    active.clear();
    definitions.clear();
  }

  return Object.freeze({ acquire, define, dispose, isActive, prepare });
}
