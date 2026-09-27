import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BAFOUILLE_FRAME_URLS, BAFOUILLE_INTERVENTION_CONFIG as config } from "../../src/components/bafouille/bafouilleAnimation.js";
import { PIVOT_INTERVENTION_CONFIG as pivot } from "../../src/components/pivot/pivotAnimation.js";
import { getResultsPresenter } from "../../src/features/presenters/resultsPresenter.js";
import { getPresenterPodiumAvatar } from "../../src/features/celebration/presenterPodiumAvatars.js";
import { PRESENTER_IDENTITIES } from "../../src/features/presenters/presenterIdentity.js";

async function read(url) {
  const image = await loadImage(fileURLToPath(new URL(`../../public${url}`, import.meta.url)));
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
}
function bounds(image, offset = 0, width = image.width) {
  let left = width, right = 0, top = image.height, bottom = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < width; x++) {
    if (image.data[(y * image.width + x + offset) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
  }
  return { left, right, top, bottom, height: bottom - top, width: right - left };
}

test("six isolated, aligned Bafouille poses occupy separate cells with transparent gutters", async () => {
  const atlas = await read(config.spriteUrl);
  assert.equal(atlas.width, 500 * config.frameCount);
  assert.equal(atlas.height, 600);
  for (const [index, url] of BAFOUILLE_FRAME_URLS.entries()) {
    const image = await read(url);
    assert.equal(image.width, 500); assert.equal(image.height, 600);
    for (const rect of [bounds(image), bounds(atlas, index * 500, 500)]) {
      assert.ok(rect.left >= 65 && rect.right <= 435, JSON.stringify(rect));
      assert.ok(rect.top >= 50 && rect.bottom <= 567, JSON.stringify(rect));
      assert.ok(Math.abs(rect.height - 508) <= 4);
    }
  }
  for (const url of Object.values(config.reactionUrls)) {
    const image = await read(url), rect = bounds(image);
    assert.equal(image.width, 500); assert.equal(image.height, 600);
    assert.ok(rect.left >= 8 && rect.right <= 492 && rect.top >= 8 && rect.bottom <= 584);
  }
});

test("Bafouille and Pinot have equivalent button/character dimensions and share one results slot", async () => {
  const head = await read(config.buttonUrl), reference = await read(pivot.buttonUrl);
  assert.deepEqual([head.width, head.height], [reference.width, reference.height]);
  assert.ok(Math.abs(bounds(head).height - bounds(reference).height) <= 4);
  assert.ok(bounds(head).width / bounds(reference).width >= 0.85);
  for (const key of ["frameAspectRatio", "characterHeightPx", "characterHeightMobilePx", "bubbleMaxWidthPx", "bubbleMaxWidthMobilePx"])
  assert.equal(config[key], pivot[key]);
  const selected = getResultsPresenter({ presenterKey: "bafouille" });
  assert.equal(selected.key, "pivot"); assert.equal(selected.config, config);
  assert.equal(selected.buttonScale, getResultsPresenter().buttonScale);
  assert.equal(selected.buttonOffsetY, getResultsPresenter().buttonOffsetY);
});

test("Bafouille enters with the full neutral pose rather than the differently cropped button", async () => {
  assert.equal(config.launchImageUrl, BAFOUILLE_FRAME_URLS[config.neutralFrame]);
  assert.notEqual(config.launchImageUrl, config.buttonUrl);
  const launch = await read(config.launchImageUrl);
  const neutral = await read(BAFOUILLE_FRAME_URLS[config.neutralFrame]);
  assert.deepEqual(launch, neutral);
});

test("all podium reaction anchors match their actual visible artwork without clipping the stars", async () => {
  for (const [key, presenter] of Object.entries(PRESENTER_IDENTITIES)) {
    const portrait = getPresenterPodiumAvatar({ isBot: true, nick: presenter.nick });
    for (const pose of ["hit1", "hit2", "stars"]) {
      const image = await read(portrait.poses[pose]), visible = bounds(image);
      assert.equal(visible.bottom, portrait.reactionBottoms[pose], `${key} ${pose}: measured anchor must follow its asset`);
      const scale = Math.min(490 / portrait.bounds[2], 470 / portrait.bounds[3], 580 / image.width, 580 / image.height);
      assert.ok(590 - visible.height * scale >= 8, `${key} ${pose}: head and stars fit above the plinth`);
    }
  }
});
