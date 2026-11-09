import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createClientUpdate } from './createClientUpdate.js';

const oldVersion = 'a'.repeat(20), newVersion = 'b'.repeat(20);
function harness() {
  const windowObject = new EventTarget(), documentObject = new EventTarget(), socket = new EventEmitter();
  Object.assign(windowObject, { location: { href: 'https://gobble.test/?existing=1#home' }, navigator: { onLine: true } });
  documentObject.hidden = false;
  let time = 10000, sequence = 0, allowed = true, remote = newVersion, htmlVersion = newVersion, fetchError = false, defer;
  const jobs = new Map(), requests = [], navigations = [], safePoints = new Set();
  const controller = createClientUpdate({ currentVersion: oldVersion, socket, windowObject, documentObject,
    now: () => time, canPrompt: () => allowed, navigate: url => navigations.push(url),
    subscribeSafePoint: listener => { safePoints.add(listener); return () => safePoints.delete(listener); },
    timers: { setTimeout(callback, ms) { const id = ++sequence; jobs.set(id, { callback, at: time + ms }); return id; }, clearTimeout(id) { jobs.delete(id); } },
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      if (defer) await defer;
      if (fetchError) throw new Error('offline');
      return { ok: true, json: async () => remote, text: async () => `<html><head><meta name="gobble-client-version" content="${htmlVersion}"></head></html>` };
    },
  });
  remote = { schema: 1, version: newVersion };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const notify = () => { for (const listener of safePoints) listener(); };
  return { controller, socket, windowObject, documentObject, jobs, requests, navigations, safePoints, flush,
    async start() { controller.start(); await flush(); },
    allow(value) { allowed = value; notify(); }, setRemote(value) { remote = value; },
    fail(value) { fetchError = value; }, html(value) { htmlVersion = value; }, defer(value) { defer = value; },
    async at(target) {
      for (;;) {
        const next = [...jobs].filter(([, task]) => task.at <= target).sort((a,b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; jobs.delete(next[0]); next[1].callback(); await flush();
      }
      time = target; await flush();
    },
  };
}

test('obsolete clients prompt at a safe point and reload only after validating the published HTML', async () => {
  const h = harness();
  try {
    h.allow(false); await h.start();
    assert.equal(h.controller.store.getState().visible, false);
    assert.equal(h.controller.store.getState().version, newVersion);
    assert.equal(await h.controller.update(), false);
    h.allow(true); assert.equal(h.controller.store.getState().visible, true);
    assert.equal(await h.controller.update(), true);
    assert.equal(h.navigations.length, 1);
    const url = new URL(h.navigations[0]);
    assert.equal(url.origin, 'https://gobble.test');
    assert.equal(url.searchParams.get('gobble-update'), newVersion);
    assert.equal(url.searchParams.get('existing'), '1'); assert.equal(url.hash, '#home');
    assert.ok(h.requests.every(request => request.options.cache === 'no-store'));
    await h.controller.update(); assert.equal(h.navigations.length, 1);
  } finally { h.controller.stop(); }
  assert.equal(h.jobs.size, 0); assert.equal(h.safePoints.size, 0); assert.equal(h.socket.listenerCount('connect'), 0);
});

test('unchanged versions, invalid manifests, offline and maintenance responses never force a refresh', async () => {
  for (const value of [{ schema: 1, version: oldVersion }, { schema: 2, version: newVersion }, { schema: 1, version: 'invalid' }, '<html>Maintenance</html>', null]) {
    const h = harness(); h.setRemote(value);
    try { await h.start(); assert.equal(h.controller.store.getState().visible, false); assert.deepEqual(h.navigations, []); }
    finally { h.controller.stop(); }
  }
  const h = harness(); h.fail(true);
  try { await h.start(); assert.equal(h.controller.store.getState().visible, false); }
  finally { h.controller.stop(); }
});

test('background checks pause; a return, reconnect and periodic checks discover new versions without duplicate requests', async () => {
  const h = harness(); h.setRemote({ schema: 1, version: oldVersion });
  try {
    await h.start(); assert.equal(h.requests.length, 1);
    h.socket.emit('connect'); h.windowObject.dispatchEvent(new Event('pageshow')); await h.flush();
    assert.equal(h.requests.length, 1);
    h.documentObject.hidden = true; h.documentObject.dispatchEvent(new Event('visibilitychange'));
    await h.at(90000); assert.equal(h.requests.length, 1);
    h.setRemote({ schema: 1, version: newVersion });
    h.documentObject.hidden = false; h.documentObject.dispatchEvent(new Event('visibilitychange')); await h.flush();
    assert.equal(h.controller.store.getState().visible, true);
    assert.equal(h.requests.length, 2);
    h.setRemote({ schema: 1, version: oldVersion });
    await h.at(150000); assert.equal(h.controller.store.getState().visible, false, 'rollback cancels the update');
  } finally { h.controller.stop(); }
});

test('a new round or a hidden app during validation cancels navigation', async () => {
  for (const hide of [false, true]) {
    const h = harness();
    try {
      await h.start(); let release;
      h.defer(new Promise(resolve => { release = resolve; }));
      const pending = h.controller.update(); await h.flush();
      if (hide) { h.documentObject.hidden = true; h.documentObject.dispatchEvent(new Event('visibilitychange')); }
      else h.allow(false);
      release(); await pending;
      assert.deepEqual(h.navigations, []);
      assert.equal(h.controller.store.getState().updating, false);
      assert.equal(h.controller.store.getState().visible, false);
    } finally { h.controller.stop(); }
  }
});

test('an incomplete deployment or failed download leaves a retry button without navigating', async () => {
  for (const offline of [false, true]) {
    const h = harness();
    try {
      await h.start(); if (offline) h.fail(true); else h.html(oldVersion);
      assert.equal(await h.controller.update(), false);
      assert.deepEqual(h.navigations, []); assert.equal(h.controller.store.getState().updating, false);
      assert.ok(h.controller.store.getState().error);
      h.fail(false); h.html(newVersion);
      assert.equal(await h.controller.update(), true);
    } finally { h.controller.stop(); }
  }
});

test('disposal ignores a late response and a development build creates no timers or listeners', async () => {
  const h = harness(); let release;
  h.defer(new Promise(resolve => { release = resolve; }));
  h.controller.start(); h.controller.stop(); release(); await h.flush();
  assert.equal(h.controller.store.getState().visible, false); assert.equal(h.jobs.size, 0);
  const controller = createClientUpdate({ currentVersion: null, canPrompt() { throw new Error('dev must stay disabled'); } });
  controller.start(); assert.equal(controller.store.getState().visible, false);
});
