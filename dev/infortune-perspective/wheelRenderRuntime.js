import { PMREMGenerator, WebGLRenderer } from 'three';
import { createWheelScene } from './createWheelScene.js';
import { createProjection, updateProjection } from './projection.js';
import { setRenderHidden } from './wheelRenderPlatform.js';

let renderer, environmentGenerator, canvas, callbackId = 0;
const scenes = new Map(), callbacks = new Map();
const event = (scene, name, value) => postMessage({ scene, event: name, value });
function benchmark(scene, args) {
  return new Promise(resolve => {
    const id = ++callbackId; callbacks.set(id, { scene, resolve });
    postMessage({ scene, event: 'benchmark', id, value: args });
  });
}
function finishCallbacks(scene) {
  for (const [id, item] of callbacks) if (item.scene === scene) {
    callbacks.delete(id); item.resolve('flat');
  }
}
export async function handleWheelRenderCommand({ scene: id, method, args = [] }) {
  if (method === 'init') {
    const [surface, hidden] = args; canvas = surface; setRenderHidden(hidden);
    event(null, 'startup', { phase: 'loading', message: 'Création du contexte graphique…' });
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    event(null, 'startup', { phase: 'loading', message: 'Initialisation des reflets 3D…' });
    environmentGenerator = new PMREMGenerator(renderer);
    return true;
  }
  if (method === 'visibility') { setRenderHidden(args[0]); for (const entry of scenes.values()) entry.scene.draw(); return; }
  if (method === 'benchmarkResult') {
    const pending = callbacks.get(args[0]); callbacks.delete(args[0]); pending?.resolve(args[1]); return;
  }
  if (method === 'create') {
    const [view, options] = args, projection = createProjection(view.width, view.height, view.settings);
    const entry = { projection, scene: null };
    scenes.set(id, entry);
    const elapsed = time => performance.timeOrigin + time;
    entry.scene = createWheelScene(canvas, projection,
      value => event(id, 'error', value), value => event(id, 'status', value), {
        ...options, renderer, environmentGenerator,
        // Driver calls are isolated from DOM/input, including on Firefox.
        canBlockGpu: () => true,
        onFrame: options.diagnostic ? (time, cost, active) => event(id, 'frame', [elapsed(time), cost, active]) : undefined,
        onTimings: options.diagnostic ? value => event(id, 'timings', value) : undefined,
        onStartupSlow: options.diagnostic ? value => { event(id, 'slow', value); return false; } : undefined,
        onBenchmark: options.diagnostic ? (...value) => benchmark(id, value) : undefined,
      });
    return true;
  }
  const entry = scenes.get(id);
  if (!entry) return null;
  if (method === 'batch') {
    for (const [name, values] of args[0]) {
      if (name === 'setProjection') {
        const [view, reflections] = values;
        updateProjection(entry.projection, view.width, view.height, view.settings);
        entry.scene.setProjection(entry.projection, reflections);
      } else entry.scene[name](...values);
    }
    return;
  }
  if (method === 'dispose') {
    finishCallbacks(id); await entry.scene.dispose(); scenes.delete(id); return;
  }
  if (method === 'suspend') { finishCallbacks(id); entry.scene.suspend(); return; }
  if (!['pickContestant', 'getContestantPresentation', 'takeResultPresentation'].includes(method)) throw new Error('Unknown wheel worker command');
  return entry.scene[method](...args);
}
