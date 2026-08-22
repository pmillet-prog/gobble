function createControllerCache(factory) {
  let currentRuntime;
  let controller;
  let hasController = false;

  function update(runtime) {
    currentRuntime = runtime;
  }

  function getController() {
    if (!hasController || controller.runtime !== currentRuntime) {
      controller = {
        runtime: currentRuntime,
        value: factory(currentRuntime),
      };
      hasController = true;
    }
    return controller.value;
  }

  function clear() {
    currentRuntime = undefined;
    controller = undefined;
    hasController = false;
  }

  return { clear, getController, update };
}

export function createLazyArrayControllerBridge(factory, methodCount) {
  const cache = createControllerCache(factory);
  const count = Math.max(0, Number(methodCount) || 0);
  const methods = Object.freeze(
    Array.from({ length: count }, (_, index) => (...args) => {
      const method = cache.getController()?.[index];
      if (typeof method !== "function") {
        throw new Error(`Lazy controller method ${index} is unavailable`);
      }
      return method(...args);
    })
  );
  return Object.freeze({ clear: cache.clear, methods, update: cache.update });
}

export function createLazyObjectControllerBridge(factory, methodNames) {
  const cache = createControllerCache(factory);
  const methods = {};
  for (const rawName of methodNames || []) {
    const name = String(rawName || "").trim();
    if (!name || methods[name]) continue;
    methods[name] = (...args) => {
      const method = cache.getController()?.[name];
      if (typeof method !== "function") {
        throw new Error(`Lazy controller method ${name} is unavailable`);
      }
      return method(...args);
    };
  }
  return Object.freeze({
    clear: cache.clear,
    methods: Object.freeze(methods),
    update: cache.update,
  });
}

