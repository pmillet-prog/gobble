import { IMAGE_KEYS, SFX_KEYS, makeScoreSfxKey } from "./assetKeys";

export const ASSET_MANIFEST_BASE = [
  {
    key: IMAGE_KEYS.bigwords.epique,
    type: "image",
    candidates: ["/bigwords/epique.webp", "/bigwords/epique.png"],
    priority: "high",
  },
  {
    key: SFX_KEYS.uiClick,
    type: "sfx",
    candidates: ["/sound/ui/click.m4a", "/sound/ui/click.wav"],
    priority: "critical",
    meta: { eqKey: "swipe" },
  },
  {
    key: SFX_KEYS.invalidWord,
    type: "sfx",
    candidates: ["/sound/game/invalide.m4a", "/sound/game/invalide.wav", "/sound/game/invalide.mp3"],
    priority: "critical",
    meta: { eqKey: "invalidWord" },
  },
  {
    key: makeScoreSfxKey("03"),
    type: "sfx",
    candidates: ["/sound/game/scores/03.m4a", "/sound/game/scores/03.wav"],
    priority: "high",
    meta: { eqKey: "score" },
  },
];

export default ASSET_MANIFEST_BASE;
