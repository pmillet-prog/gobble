import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeAvatar } from "./avatarState.js";
import { getAvatarRenderState } from "./avatarRenderState.js";
import { withAvatarAccessories } from "../../../shared/avatarObjectives.js";
import { AVATAR_COSTUMES } from "../../../shared/avatarCostumes.js";

const catalog = withAvatarAccessories(JSON.parse(readFileSync(new URL("../../../public/avatars/v1/catalog.json", import.meta.url))));

test("every costume keeps saved features while masking only its covered parts in the render copy", () => {
  for (const base of ["homme", "femme"]) for (const costume of AVATAR_COSTUMES) {
    const original = normalizeAvatar({ base, hair: "longwaves", headwear: "cap", glasses: "vue_ronde",
      clothes: catalog.families.clothes.find(part => part.base === base).id,
      accessories: ["earrings_hoops"], costumes: costume.id }, catalog);
    const snapshot = structuredClone(original);
    const state = getAvatarRenderState(original, catalog);
    assert.equal(state.clothes, "", costume.id);
    assert.equal(state.hair, original.hair, `${costume.id}: the hairstyle remains available beneath the costume`);
    assert.equal(state.headwear, costume.hideHeadwear ? "" : original.headwear, costume.id);
    for (const family of ["eyes", "brows", "mouths", "nose", "glasses", "accessories"]) assert.deepEqual(state[family], original[family], family);
    assert.deepEqual(original, snapshot);
    const restored = getAvatarRenderState({ ...original, costumes: "" }, catalog);
    for (const family of ["hair", "headwear", "clothes"]) assert.equal(restored[family], original[family]);
  }
});
