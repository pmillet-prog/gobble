import test from "node:test";
import assert from "node:assert/strict";
import { getLocalAvatar, saveLocalAvatar, subscribeLocalAvatar, cacheAccountAvatar, readSavedLocalAvatar } from "./avatarStore.js";
import { DEFAULT_AVATAR } from "./avatarState.js";

test("local avatars stay separate between accounts and notify mounted portraits", () => {
  const values = new Map(), events = new Map();
  globalThis.window = {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: name => events.delete(name),
  };
  let updates = 0;
  const unsubscribe = subscribeLocalAvatar(() => updates++);
  try {
    saveLocalAvatar(12, { ...DEFAULT_AVATAR, base: "femme", hair: "bob", headwear: "cap", glasses: "vue_ronde", glassesColor: "#c49c58", glassesScale: 1.08, glassesDy: -7, clothes: "tee_femme", auras: "weekly_gold", headwearDy: 9, mouthWidth: 1.13 });
    assert.equal(updates, 1);
    assert.equal(getLocalAvatar(12).base, "femme");
    assert.equal(getLocalAvatar(13), DEFAULT_AVATAR);
    assert.equal(getLocalAvatar(null), DEFAULT_AVATAR);
    events.get("storage")({ key: "gobble:avatar:v1:12" });
    assert.equal(updates, 2);
    unsubscribe();
    assert.equal(events.size, 0);
    assert.equal(getLocalAvatar(12).hair, "bob", "the saved avatar survives a remount");
    assert.equal(getLocalAvatar(12).headwearDy, 9);
    assert.equal(getLocalAvatar(12).mouthWidth, 1.13);
    assert.equal(getLocalAvatar(12).clothes, "tee_femme");
    assert.equal(getLocalAvatar(12).auras, "weekly_gold");
    assert.equal(getLocalAvatar(12).glasses, "vue_ronde");
    assert.equal(getLocalAvatar(12).glassesColor, "#c49c58");
    assert.equal(getLocalAvatar(12).glassesScale, 1.08);
    assert.equal(getLocalAvatar(12).glassesDy, -7);
  } finally { unsubscribe(); delete globalThis.window; }
});
test("unavailable storage reports a save failure without updating portraits", () => {
  globalThis.window = {
    localStorage: { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("quota"); } },
    addEventListener() {}, removeEventListener() {},
  };
  let updates = 0;
  const unsubscribe = subscribeLocalAvatar(() => updates++);
  try {
    assert.equal(getLocalAvatar(12), DEFAULT_AVATAR);
    assert.throws(() => saveLocalAvatar(12, DEFAULT_AVATAR), /sauvegarde/);
    assert.equal(updates, 0);
  } finally { unsubscribe(); delete globalThis.window; }
});

test("account cache keeps the original device avatar as a backup and avoids unchanged writes", () => {
  const values = new Map();
  let writes = 0;
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); writes++; },
  } };
  try {
    assert.equal(readSavedLocalAvatar(12), null);
    saveLocalAvatar(12, { ...DEFAULT_AVATAR, hairColor: "#112233" });
    const old = values.get("gobble:avatar:v1:12");
    cacheAccountAvatar(12, DEFAULT_AVATAR);
    assert.equal(values.get("gobble:avatar:before-account-sync:12"), old);
    assert.deepEqual(readSavedLocalAvatar(12), DEFAULT_AVATAR);
    const before = writes;
    cacheAccountAvatar(12, DEFAULT_AVATAR);
    assert.equal(writes, before);
    cacheAccountAvatar(12, { ...DEFAULT_AVATAR, hairColor: "#abcdef" });
    assert.equal(values.get("gobble:avatar:before-account-sync:12"), old);
  } finally { delete globalThis.window; }
});
