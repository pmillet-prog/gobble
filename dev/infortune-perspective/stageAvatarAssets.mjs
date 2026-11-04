import { readFile } from "node:fs/promises";
import { getAvatarRenderState } from "../../src/features/avatar/avatarRenderState.js";
import { getAvatarPartIds } from "../../shared/avatarSelections.js";
import { avatarSkinFile } from "../../shared/avatarSkins.js";
import { STAGE_CONTESTANTS } from "./stageFixtures.js";
import { PRESENTER_IDENTITIES } from "../../shared/presenterIdentities.js";
import { getPresenterPodiumAvatar } from "../../src/features/celebration/presenterPodiumAvatars.js";

export function collectStagePresenterFiles() {
  return new Set(["avatars/default.png", ...Object.entries(PRESENTER_IDENTITIES).flatMap(([presenterKey, presenter]) => [
    presenter.buttonUrl.slice(1), getPresenterPodiumAvatar({ isBot: true, presenterKey }).poses.neutral.slice(1),
  ])]);
}

export function collectStageAvatarFiles(catalog) {
  const files = new Set();
  const add = file => { if (file) files.add(file); };
  for (const fixture of STAGE_CONTESTANTS) {
    const state = getAvatarRenderState(fixture.avatar, catalog, { transparent: true, expression: "happy" });
    for (const base of catalog.bases) { add(base.file); if (state.tone === "custom") add(base.mask); }
    add(avatarSkinFile(state.base, state.skinStyle));
    for (const [family, parts] of Object.entries(catalog.families)) {
      const selected = getAvatarPartIds(state, family);
      for (const part of parts.filter(part => selected.includes(part.id))) {
        add(part.file); add(part.mask);
        for (const file of Object.values(part.layers || {})) add(file);
        for (const file of Object.values(part.masks || {})) add(file);
      }
    }
  }
  return files;
}

// Include only the fixture parts and selectable presenter portraits in the standalone build,
// rather than copying the game's entire public directory.
export function stageAvatarAssets() {
  return { name: "infortune-stage-avatar-assets", apply: "build", async generateBundle() {
    const root = new URL("../../public/avatars/v1/", import.meta.url);
    const catalogSource = await readFile(new URL("catalog.json", root));
    this.emitFile({ type: "asset", fileName: "avatars/v1/catalog.json", source: catalogSource });
    for (const file of collectStageAvatarFiles(JSON.parse(catalogSource))) {
      this.emitFile({ type: "asset", fileName: `avatars/v1/${file}`, source: await readFile(new URL(file, root)) });
    }
    const publicRoot = new URL("../../public/", import.meta.url);
    for (const file of collectStagePresenterFiles()) {
      this.emitFile({ type: "asset", fileName: file, source: await readFile(new URL(file, publicRoot)) });
    }
  } };
}
