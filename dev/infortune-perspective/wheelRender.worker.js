// Install the message handler before loading Three and the stage's module graph.
// Import failures must reject the init request, not leave the page waiting for
// a static module worker that never reached its onmessage assignment.
let runtime;
self.onmessage = ({ data }) => {
  if (data.method === 'init' && !runtime) {
    postMessage({ event: 'startup', value: { phase: 'loading', message: 'Chargement du moteur 3D…' } });
    runtime = import('./wheelRenderRuntime.js').then(module => module.handleWheelRenderCommand);
  }
  Promise.resolve(runtime).then(handle => {
    if (!handle) throw new Error('Wheel worker has not been initialized');
    return handle(data);
  }).then(value => {
    if (data.id) postMessage({ id: data.id, value });
  }, error => {
    if (data.id) postMessage({ id: data.id, error: error?.message || String(error) });
    else postMessage({ scene: data.scene, event: 'error', value: error?.message || String(error) });
  });
};
postMessage({ event: 'booted' });
