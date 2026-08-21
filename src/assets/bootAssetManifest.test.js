import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOT_ASSET_MANIFEST_BASE,
  buildFileManifest,
  dedupeManifest,
  makeFileKey,
} from "./bootAssetManifest.js";

test("le manifeste de démarrage garde des clés uniques et aucun son", () => {
  const keys = BOOT_ASSET_MANIFEST_BASE.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(BOOT_ASSET_MANIFEST_BASE.some((entry) => entry.type === "sfx"), false);
  assert.equal(
    BOOT_ASSET_MANIFEST_BASE.some(
      (entry) => entry.type === "image" && entry.priority === "critical"
    ),
    true
  );
});

test("les fichiers différés conservent une clé stable et leur URL", () => {
  assert.equal(makeFileKey("/sound/music/Été 01.mp3"), "file_sound_music_t_01_mp3");
  assert.deepEqual(buildFileManifest(["/dico.txt"]), [
    {
      key: "file_dico_txt",
      type: "file",
      candidates: ["/dico.txt"],
      priority: "low",
    },
  ]);
});

test("la dernière définition gagne lors de la déduplication", () => {
  assert.deepEqual(
    dedupeManifest([
      { key: "same", priority: "low" },
      { key: "same", priority: "critical" },
    ]),
    [{ key: "same", priority: "critical" }]
  );
});
