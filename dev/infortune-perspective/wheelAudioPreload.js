// Fetch compressed bytes ahead of the gesture, without creating an AudioContext.
// Copies are handed to decodeAudioData, which may detach its input buffer.
export function wheelAudioAlreadyAllowed(navigator = globalThis.navigator) {
  try {
    if (typeof navigator?.getAutoplayPolicy === "function") return navigator.getAutoplayPolicy("audiocontext") === "allowed";
  } catch { /* Older implementations may not accept the audio-context category. */ }
  return navigator?.userActivation?.hasBeenActive === true;
}

export function createWheelAudioPreload(fetchAudio = globalThis.fetch, timers = globalThis) {
  const entries = new Map(), abort = new AbortController();
  let disposed = false;
  function bytes(url) {
    if (disposed) return Promise.reject(new Error("Soundtrack disposed"));
    if (!entries.has(url)) {
      const request = new AbortController();
      const cancel = () => request.abort(); abort.signal.addEventListener("abort", cancel, { once: true });
      const timeout = timers.setTimeout(cancel, 8000);
      const pending = (async () => {
        try {
          const response = await fetchAudio(url, { signal: request.signal });
          if (!response.ok) throw new Error("Sound unavailable");
          return await response.arrayBuffer();
        } finally { timers.clearTimeout(timeout); abort.signal.removeEventListener("abort", cancel); }
      })();
      entries.set(url, pending);
    }
    return entries.get(url);
  }
  return {
    prime: bytes,
    async fetch(url, options = {}) {
      if (options.signal?.aborted) throw new Error("Sound cancelled");
      const value = await bytes(url);
      if (disposed || options.signal?.aborted) throw new Error("Sound cancelled");
      return { ok: true, arrayBuffer: async () => value.slice(0) };
    },
    dispose() { disposed = true; abort.abort(); entries.clear(); },
  };
}
