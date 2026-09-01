import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  createInitialOverlaysState,
  createOverlaysFeature,
} from "./createOverlaysFeature.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function profileResponse(profile, { ok = true, status = 200 } = {}) {
  return {
    json: async () => (profile ? { ok: true, profile } : { error: "missing" }),
    ok,
    status,
  };
}

test("overlays satellite loads a player profile", async () => {
  const calls = [];
  const scope = createResourceScope("overlays-profile-success-test");
  const feature = createOverlaysFeature(
    { ports: {}, scope },
    {
      fetchImpl(url, options) {
        calls.push({ options, url });
        return Promise.resolve(profileResponse({ nick: "Étoile", trophies: 42 }));
      },
    }
  );
  feature.start();

  const profile = await feature.openPlayerProfile({ nick: "Étoile bleue", userId: 12 });
  assert.deepEqual(profile, { nick: "Étoile", trophies: 42 });
  assert.equal(
    calls[0].url,
    "/api/player-profile/user/12?nick=%C3%89toile%20bleue"
  );
  assert.deepEqual(feature.store.getState().playerProfileModal, {
    error: "",
    loading: false,
    nick: "Étoile bleue",
    open: true,
    profile: { nick: "Étoile", trophies: 42 },
    userId: 12,
  });
  scope.dispose();
});

test("overlays satellite replaces a profile request and ignores its late response", async () => {
  const calls = [];
  const scope = createResourceScope("overlays-profile-replacement-test");
  const feature = createOverlaysFeature(
    { ports: {}, scope },
    {
      fetchImpl(url, options) {
        const deferred = createDeferred();
        calls.push({ deferred, options, url });
        return deferred.promise;
      },
    }
  );
  feature.start();

  const firstRequest = feature.openPlayerProfile({ nick: "Ancien", userId: 1 });
  const nextRequest = feature.openPlayerProfile({ nick: "Nouveau", userId: 2 });
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(await firstRequest, null);

  calls[0].deferred.resolve(profileResponse({ nick: "Ancien" }));
  await Promise.resolve();
  assert.equal(feature.store.getState().playerProfileModal.userId, 2);
  calls[1].deferred.resolve(profileResponse({ nick: "Nouveau" }));
  assert.deepEqual(await nextRequest, { nick: "Nouveau" });
  assert.equal(feature.store.getState().playerProfileModal.profile.nick, "Nouveau");
  scope.dispose();
});

test("overlays satellite closes and cancels a pending profile", async () => {
  const deferred = createDeferred();
  let signal = null;
  const scope = createResourceScope("overlays-profile-close-test");
  const feature = createOverlaysFeature(
    { ports: {}, scope },
    {
      fetchImpl(_url, options) {
        signal = options.signal;
        return deferred.promise;
      },
    }
  );
  feature.start();

  const request = feature.openPlayerProfile({ nick: "Patiente", userId: 3 });
  feature.closePlayerProfile();
  assert.equal(signal.aborted, true);
  assert.equal(await request, null);
  assert.deepEqual(feature.store.getState().playerProfileModal, {
    error: "",
    loading: false,
    nick: "Patiente",
    open: false,
    profile: null,
    userId: 3,
  });
  deferred.resolve(profileResponse({ nick: "Trop tard" }));
  await Promise.resolve();
  assert.equal(feature.store.getState().playerProfileModal.open, false);
  scope.dispose();
  assert.deepEqual(feature.store.getState(), createInitialOverlaysState());
});

test("overlays satellite exposes profile fetch errors without stale data", async () => {
  const scope = createResourceScope("overlays-profile-error-test");
  const feature = createOverlaysFeature(
    { ports: {}, scope },
    {
      fetchImpl: () => Promise.resolve(profileResponse(null, { ok: false, status: 404 })),
    }
  );
  feature.start();

  assert.equal(
    await feature.openPlayerProfile({ nick: "Introuvable", userId: 404 }),
    null
  );
  assert.deepEqual(feature.store.getState().playerProfileModal, {
    error: "Profil indisponible",
    loading: false,
    nick: "Introuvable",
    open: true,
    profile: null,
    userId: 404,
  });
  scope.dispose();
});
