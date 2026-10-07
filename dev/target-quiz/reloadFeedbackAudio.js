import AssetManager from "../../src/assets/assetManager.js";
import { TARGET_QUIZ_FEEDBACK_AUDIO_MANIFEST } from "../../src/features/targetQuiz/targetQuizFeedbackAudio.js";

let reloadSequence = 0;

// Audition the files as edited on disk. The game normally retains decoded SFX
// and uses the HTTP cache; this explicit preview action bypasses both caches.
export async function reloadFeedbackAudio() {
  const version = `${Date.now()}-${++reloadSequence}`;
  const manifest = TARGET_QUIZ_FEEDBACK_AUDIO_MANIFEST.map(entry => ({
    ...entry,
    candidates: entry.candidates.map(url => `${url}${url.includes("?") ? "&" : "?"}preview=${version}`),
  }));
  for (const entry of manifest) AssetManager.release(entry.key);
  AssetManager.registerManifest(manifest);
  await AssetManager.unlockAudio();
  await AssetManager.preload({ keys: manifest.map(entry => entry.key), includeTypes: ["sfx"], concurrency: 2 });
}
