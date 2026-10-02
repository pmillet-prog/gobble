(() => {
  if (window.top !== window || location.origin !== 'https://gobble.fr') return;
  let sequence = 0;
  const pending = new Map();
  const port = window.GobbleHostChannel;
  port.onmessage = event => {
    let reply;
    try { reply = JSON.parse(event.data); } catch { return; }
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    clearTimeout(request.timer);
    if (reply.error) request.reject(new Error(reply.error));
    else request.resolve(reply.value);
  };
  const request = (command, value) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Android response timeout')); }, 4000);
    pending.set(id, { resolve, reject, timer });
    port.postMessage(JSON.stringify({ id, command, value }));
  });
  Object.defineProperty(window, 'GobbleNative', { value: Object.freeze({
    protocol: 1,
    ownsAssets: true,
    setOrientation: mode => request('orientation', mode),
    reload: () => request('reload'),
    getDiagnostics: () => request('diagnostics'),
  }) });
})();
