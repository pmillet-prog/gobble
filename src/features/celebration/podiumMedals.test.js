import test from "node:test";
import assert from "node:assert/strict";
import { createNativeAvatarRenderer, createCanvas, avatarCatalog } from "../../../server/scripts/helpers/avatarCanvasHarness.js";
import { normalizeAvatar } from "../avatar/avatarState.js";
import { drawAvatarMedals } from "../avatar/avatarMedals.js";
import { preparePodiumAvatars, releasePodiumAvatars } from "./preparePodiumAvatars.js";

test("all podium poses leave the full chest and stacked medals above the plinth", async () => {
  const { renderer, restore } = await createNativeAvatarRenderer();
  let actors;
  try {
    const players = [
      { base: "homme", clothes: "bomber_homme", silhouetteWidth: 1.18 },
      { base: "femme", hair: "bob", clothes: "mariniere_femme" },
      { headwear: "tophat", clothes: "costume_cravate_homme" },
    ].map((config, index) => ({ nick: `Joueur ${index}`, avatar: normalizeAvatar(config, avatarCatalog) }));
    actors = await preparePodiumAvatars(players);
    for (const [index, actor] of actors.entries()) {
      const profile = createCanvas(600, 600);
      (await renderer.prepare(players[index].avatar)).draw(profile, "portrait");
      for (const frame of Object.values(actor.frames)) {
        const { crop, ratio, oy } = frame.gobbleViewport;
        assert.ok(crop[1] + (600 - oy) / ratio >= 1024, "the complete bust fits inside the canvas");
        assert.ok(oy < profile.gobbleViewport.oy, "only the podium uses the higher camera");
        const original = frame.toBuffer("image/png");
        const overlay = createCanvas(600, 600), ctx = overlay.getContext("2d");
        drawAvatarMedals(ctx, frame.gobbleViewport, { gold: 4, silver: 2, bronze: 1 });
        const pixels = ctx.getImageData(0, 0, 600, 600).data;
        let count = 0, bottom = 0;
        for (let y = 0; y < 600; y++) for (let x = 0; x < 600; x++) {
          if (pixels[(y * 600 + x) * 4 + 3] < 30) continue;
          count++; bottom = y;
        }
        assert.ok(count > 6000, "all three medal colours are rendered with their counters");
        // A tall hat zooms the bust out. Even on a 146px mobile portrait, the
        // counters must stay above the 9px lip and 5px overlap of the plinth.
        assert.ok((600 - bottom) / 600 * 146 > 14, `medals touch the plinth: avatar ${index}, bottom ${bottom}`);
        assert.deepEqual(frame.toBuffer("image/png"), original, "awards never enter the cached poses");
      }
    }
  } finally { releasePodiumAvatars(actors); restore(); }
});
