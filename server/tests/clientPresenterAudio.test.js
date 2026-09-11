import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import test from "node:test";
import { createServer } from "vite";

function hasExactPublicPath(url) {
  let directory = new URL("../../public/", import.meta.url);
  const parts = new URL(url, "http://localhost").pathname.split("/").filter(Boolean);
  for (const part of parts) {
    // Check every segment, including on Windows where stat alone ignores case.
    if (!readdirSync(directory).includes(part)) return false;
    directory = new URL(encodeURIComponent(part), directory);
    if (statSync(directory).isDirectory()) directory = new URL(`${directory.href}/`);
  }
  return statSync(directory).isFile() && statSync(directory).size > 0;
}

test("the Lepers activation buzzer and each random bonus voice resolve to packaged audio", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false },
  });
  try {
    const [audio, assets, lepers] = await Promise.all([
      vite.ssrLoadModule("/src/audio/audioAssets.js"),
      vite.ssrLoadModule("/src/assets/assetKeys.js"),
      vite.ssrLoadModule("/src/components/lepers/lepersAnimation.js"),
    ]);
    assert.equal(
      lepers.LEPERS_INTERVENTION_CONFIG.manualAppearanceSfxKey,
      assets.SFX_KEYS.lepersBuzzer
    );
    assert.equal(lepers.LEPERS_INTERVENTION_CONFIG.appearanceSfxKey, undefined);
    assert.equal(new Set(assets.LEPERS_BONUS_SFX_KEYS).size, 4);
    const sounds = audio.buildSfxManifest(audio.REGISTERED_SFX_MANIFEST);
    for (const key of [
      assets.SFX_KEYS.presenterAppearance,
      lepers.LEPERS_INTERVENTION_CONFIG.manualAppearanceSfxKey,
      ...assets.LEPERS_BONUS_SFX_KEYS,
    ]) {
      const sound = sounds.find((entry) => entry.key === key);
      assert.ok(sound, `Missing sound registration: ${key}`);
      assert.ok(sound.candidates.some(hasExactPublicPath), `Missing audio or wrong case: ${key}`);
    }
  } finally {
    await vite.close();
  }
});
