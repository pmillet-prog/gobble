function safeDispose(dispose) {
  try {
    dispose?.();
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

export function createResourceScope(label = "resource-scope") {
  let disposed = false;
  const disposers = new Set();

  function add(dispose) {
    if (typeof dispose !== "function") return () => {};
    if (disposed) {
      safeDispose(dispose);
      return () => {};
    }
    disposers.add(dispose);
    return () => disposers.delete(dispose);
  }

  function listen(target, eventName, handler, options) {
    if (!target?.addEventListener || typeof handler !== "function") return () => {};
    target.addEventListener(eventName, handler, options);
    return add(() => target.removeEventListener(eventName, handler, options));
  }

  function interval(callback, delayMs) {
    if (disposed || typeof callback !== "function") return null;
    const id = setInterval(callback, delayMs);
    add(() => clearInterval(id));
    return id;
  }

  function timeout(callback, delayMs) {
    if (disposed || typeof callback !== "function") return null;
    const id = setTimeout(() => {
      disposers.delete(cancel);
      if (!disposed) callback();
    }, delayMs);
    const cancel = () => clearTimeout(id);
    add(cancel);
    return id;
  }

  function child(childLabel) {
    const childScope = createResourceScope(`${label}/${childLabel}`);
    add(childScope.dispose);
    return childScope;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const pending = [...disposers].reverse();
    disposers.clear();
    for (const cleanup of pending) safeDispose(cleanup);
  }

  return Object.freeze({
    add,
    child,
    dispose,
    get disposed() {
      return disposed;
    },
    interval,
    label,
    listen,
    timeout,
  });
}
