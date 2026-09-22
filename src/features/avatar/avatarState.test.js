import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AVATAR, normalizeAvatar, createBlankAvatar, isOwnPlayerProfile } from "./avatarState.js";

test("only an authenticated matching account owns the profile", () => {
  assert.equal(isOwnPlayerProfile(12, "12"), true);
  for (const [viewer, target] of [[null, null], [0, 0], [12, 13], ["Tigre", "Tigre"]]) assert.equal(isOwnPlayerProfile(viewer, target), false);
});
test("stored avatar settings cannot introduce paths, unknown fields or invalid colors", () => {
  const avatar = normalizeAvatar({ eyes: "../../file", hairColor: "url(https://example.test)", base: "other", auras: "../../private", custom: "anything" });
  assert.deepEqual(avatar, DEFAULT_AVATAR);
});
test("animation expressions migrate to the neutral version of the same mouth", () => {
  for (const expression of ["happy", "sad", "surprised", "neutral"]) {
    assert.equal(normalizeAvatar({ mouths: `full_${expression}` }).mouths, "full_neutral");
  }
});
test("slider settings persist and invalid values stay within workshop limits", () => {
  const valid = normalizeAvatar({ irisScale: .73, mouthDy: 12, hairScale: 1.03, noseDx: -5, headwearDy: 9, backdropTint: .27 });
  assert.equal(normalizeAvatar(JSON.parse(JSON.stringify(valid))).headwearDy, 9);
  assert.equal(valid.irisScale, .73);
  assert.equal(valid.mouthDy, 12);
  assert.equal(valid.noseDx, -5);
  const invalid = normalizeAvatar({ irisScale: 400, mouthDy: -300, noseScale: Infinity, headwearScale: 100, backdropTint: -1 });
  assert.equal(invalid.irisScale, 1.3);
  assert.equal(invalid.mouthDy, -20);
  assert.equal(invalid.noseScale, 1);
  assert.equal(invalid.headwearScale, 1.05);
  assert.equal(invalid.backdropTint, 0);
});
test("changing base selects the matching clothing counterpart or the original outfit", () => {
  const families = { clothes: [{ id: "tee_homme", base: "homme", counterpart: "tee_femme" }, { id: "tee_femme", base: "femme", counterpart: "tee_homme" }, { id: "dress_femme", base: "femme" }] };
  assert.equal(normalizeAvatar({ base: "femme", clothes: "tee_homme" }, { families }).clothes, "tee_femme");
  assert.equal(normalizeAvatar({ base: "homme", clothes: "dress_femme" }, { families }).clothes, "");
});
test("female base clears incompatible facial hair and unavailable parts fall back", () => {
  const catalog = { families: Object.fromEntries(["eyes", "brows", "nose", "mouths", "hair", "facialhair", "backdrops"].map(key => [key, [{ id: DEFAULT_AVATAR[key] }]])) };
  const avatar = normalizeAvatar({ base: "femme", facialhair: "naissante", hair: "removed", eyes: "" }, catalog);
  assert.equal(avatar.facialhair, "");
  assert.equal(avatar.hair, DEFAULT_AVATAR.hair);
  assert.equal(avatar.eyes, "");
});

test("a new blank avatar has no preselected pieces and round-trips without adding any", () => {
  for (const base of ["femme", "homme"]) {
    const empty = createBlankAvatar(base);
    assert.equal(empty.base, base);
    for (const family of ["eyes", "nose", "mouths", "brows", "hair", "clothes", "glasses"]) assert.equal(empty[family], "", family);
    assert.deepEqual(empty.accessories, []);
    assert.deepEqual(normalizeAvatar(JSON.parse(JSON.stringify(empty))), empty);
    assert.equal(normalizeAvatar({ ...empty, eyes: "open" }).hair, "");
  }
  assert.deepEqual(normalizeAvatar(DEFAULT_AVATAR), DEFAULT_AVATAR, "existing avatars keep their features");
});
