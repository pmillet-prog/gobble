import test from "node:test";
import assert from "node:assert/strict";
import { createNativeAvatarRenderer, createCanvas, avatarCatalog, avatarAssetRoot, loadImage } from "./helpers/avatarCanvasHarness.js";
import { readFile } from "node:fs/promises";
import { normalizeAvatar, createBlankAvatar } from "../../shared/avatarConfiguration.js";
import { drawAvatarMedals } from "../../src/features/avatar/avatarMedals.js";

test("daily medal overlays can change and clear without touching the rendered portrait", async () => {
  const { renderer, restore } = await createNativeAvatarRenderer();
  try {
    const frame = await renderer.prepare(normalizeAvatar({ headwear: "newsboy" }, avatarCatalog));
    const base = createCanvas(320, 320), overlay = createCanvas(320, 320);
    frame.draw(base, "portrait");
    const original = base.toBuffer("image/png");
    const ctx = overlay.getContext("2d");
    for (const counts of [{ gold: 3 }, { gold: 4, silver: 2 }, null]) {
      ctx.clearRect(0, 0, 320, 320);
      drawAvatarMedals(ctx, base.gobbleViewport, counts);
      const pixels = ctx.getImageData(0, 0, 320, 320).data;
      const visible = pixels.filter((value, index) => index % 4 === 3 && value > 0).length;
      assert.equal(visible > 0, !!counts);
      assert.deepEqual(base.toBuffer("image/png"), original);
    }
  } finally { restore(); }
});

test("profile medals follow the editor's portrait camera without changing the avatar framing", async () => {
  const { renderer, restore } = await createNativeAvatarRenderer();
  try {
    for (const config of [{}, { base: "femme", hair: "bob" }, { headwear: "tophat", clothes: "costume_cravate_homme" }]) {
      const avatar = normalizeAvatar(config, avatarCatalog);
      const before = JSON.stringify(avatar);
      const result = await renderer.prepare(avatar, { transparent: true });
      const canvas = createCanvas(320, 320);
      const editor = createCanvas(320, 320);
      result.draw(editor, "portrait");
      const reference = editor.getContext("2d").getImageData(0, 0, 320, 320).data;
      result.draw(canvas, "portrait", { gold: 3 });
      assert.deepEqual(canvas.gobbleViewport, editor.gobbleViewport);
      const { data } = canvas.getContext("2d").getImageData(0, 0, 320, 320);
      let visible = 0, changed = 0;
      const { crop, ratio, ox, oy } = canvas.gobbleViewport;
      // Canvas shadows use output pixels, not the scaled avatar coordinates.
      const shadowMargin = 4;
      const chest = { left: ox + (510 - crop[0]) * ratio - shadowMargin, right: ox + (860 - crop[0]) * ratio + shadowMargin,
        top: oy + (690 - crop[1]) * ratio - shadowMargin, bottom: oy + (895 - crop[1]) * ratio + shadowMargin };
      for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
        const offset = (y * 320 + x) * 4;
        if (data[offset + 3] > 5) visible++;
        const different = [0, 1, 2, 3].some(channel => data[offset + channel] !== reference[offset + channel]);
        if (different) {
          changed++;
          assert.ok(x >= chest.left && x <= chest.right && y >= chest.top && y <= chest.bottom,
            `profile changed outside the medals at ${x},${y}`);
        }
      }
      assert.ok(visible > 15000, "the actual PNG layers must be decoded, not just the medal overlay");
      assert.ok(changed > 100, "the medals are present on the lower bust");
      assert.equal(JSON.stringify(avatar), before, "daily awards do not enter the saved avatar configuration");
      canvas.width = 0; canvas.height = 0;
      editor.width = 0; editor.height = 0;
    }
  } finally { restore(); }
});

test("every hat and eyebrow thumbnail has all visible pixels inside its centred framing", async () => {
  const canvas = createCanvas(1024, 1024), ctx = canvas.getContext("2d");
  for (const part of [...avatarCatalog.families.headwear, ...avatarCatalog.families.brows]) {
    const image = await loadImage(await readFile(new URL(part.file, avatarAssetRoot)));
    ctx.clearRect(0, 0, 1024, 1024); ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, 1024, 1024);
    let left = 1024, top = 1024, right = 0, bottom = 0;
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
      if (!data[(y * 1024 + x) * 4 + 3]) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
    const [vx, vy, vw, vh] = part.preview.viewBox;
    assert.ok(left > vx && right < vx + vw && top > vy && bottom < vy + vh, part.id);
    assert.ok(Math.abs((left + right) / 2 - (vx + vw / 2)) < .01, `${part.id}: horizontal centring`);
    assert.ok(Math.abs((top + bottom) / 2 - (vy + vh / 2)) < .01, `${part.id}: vertical centring`);
    if (avatarCatalog.families.brows.includes(part)) assert.ok((right - left) / vw > .85, "brows fill the preview width");
  }
  canvas.width = 0; canvas.height = 0;
});

test("participant tag follows the portrait camera on the left chest and carries the player's nickname", async () => {
  const { renderer, restore } = await createNativeAvatarRenderer();
  try {
    const empty = await renderer.prepare(normalizeAvatar({}, avatarCatalog), { transparent: true });
    const equipped = await renderer.prepare(normalizeAvatar({ accessories: "participant_tag" }, avatarCatalog), { transparent: true });
    const before = createCanvas(400, 400), after = createCanvas(400, 400);
    empty.draw(before, "portrait", { gold: 3 });
    equipped.draw(after, "portrait", { gold: 3 }, "Tigre");
    assert.deepEqual(after.gobbleViewport, before.gobbleViewport);
    const original = before.getContext("2d").getImageData(0, 0, 400, 400).data;
    const tagged = after.getContext("2d").getImageData(0, 0, 400, 400).data;
    const { crop, ratio, ox, oy } = after.gobbleViewport;
    let changed = 0, white = 0;
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
      const i = (y * 400 + x) * 4;
      if (![0, 1, 2, 3].some(c => original[i + c] !== tagged[i + c])) continue;
      changed++;
      if (tagged[i] > 220 && tagged[i + 1] > 220 && tagged[i + 2] > 220) white++;
      assert.ok(x >= ox + (216 - crop[0]) * ratio && x <= ox + (450 - crop[0]) * ratio
        && y >= oy + (734 - crop[1]) * ratio && y <= oy + (876 - crop[1]) * ratio, `unexpected changed pixel ${x},${y}`);
    }
    assert.ok(changed > 800, "the tag must be visible");
    assert.ok(white > 500, "the badge has an opaque white centre behind the marker lettering");
    equipped.draw(after, "portrait", { gold: 3 }, "Éléonore la championne");
    assert.notDeepEqual(after.getContext("2d").getImageData(0, 0, 400, 400).data, tagged);
  } finally { restore(); }
});

test("bare heads render without eyes and can receive independent features", async () => {
  const { renderer, restore } = await createNativeAvatarRenderer();
  try {
    for (const base of ["homme", "femme"]) {
      const blank = createBlankAvatar(base), canvas = createCanvas(320, 320);
      const bare = await renderer.prepare(blank, { transparent: true });
      bare.draw(canvas, "portrait");
      const pixels = canvas.getContext("2d").getImageData(0, 0, 320, 320).data;
      assert.ok(pixels.filter((value, index) => index % 4 === 3 && value > 5).length > 12000, "the bare head and bust must be visible");
      for (const feature of [{ eyes: "open" }, { brows: "straight" }, { nose: "short" }, { mouths: "thin_neutral" }, { hair: "quiff" }]) {
        const result = await renderer.prepare({ ...blank, ...feature }, { transparent: true });
        result.draw(canvas, "portrait");
        assert.notDeepEqual(canvas.getContext("2d").getImageData(0, 0, 320, 320).data, pixels, JSON.stringify(feature));
        assert.equal(result.state.eyes, feature.eyes || "");
      }
    }
  } finally { restore(); }
});

test("minimal eyes render on both faces, ignore opening and keep iris size and position controls", async () => {
  const { renderer, restore } = await createNativeAvatarRenderer();
  try {
    const canvas = createCanvas(300, 300);
    for (const base of ["homme", "femme"]) for (const eyes of ["dots", "iris_only"]) {
      const config = { ...createBlankAvatar(base), eyes };
      const capture = async changes => {
        const result = await renderer.prepare({ ...config, ...changes });
        result.draw(canvas, "face");
        return canvas.toBuffer("image/png");
      };
      const regular = await capture({});
      assert.notDeepEqual(regular, await capture({ eyes: "" }));
      assert.deepEqual(regular, await capture({ openness: .3 }));
      assert.notDeepEqual(regular, await capture({ irisScale: .6, spacing: 10, dy: 5 }));
      if (eyes === "iris_only") assert.notDeepEqual(regular, await capture({ irisColor: "#1133ee" }));
    }
  } finally { restore(); }
});

test("the plush uses the portrait camera on the left without changing the face or the saved appearance", async () => {
  const { renderer, restore } = await createNativeAvatarRenderer();
  try {
    const saved = normalizeAvatar({ eyes: "iris_only", accessories: "tiger_plush" }, avatarCatalog);
    const original = JSON.stringify(saved);
    const neutral = await renderer.prepare(saved);
    const happy = await renderer.prepare(saved, { expression: "happy" });
    assert.equal(happy.state.mouths, "thin_happy");
    assert.equal(JSON.stringify(saved), original);
    const plain = await renderer.prepare({ ...saved, accessories: "" });
    const a = createCanvas(320, 320), b = createCanvas(320, 320);
    neutral.draw(a, "face"); plain.draw(b, "face");
    assert.deepEqual(a.toBuffer("image/png"), b.toBuffer("image/png"));
    neutral.draw(a, "portrait"); plain.draw(b, "portrait");
    assert.deepEqual(a.gobbleViewport, b.gobbleViewport);
    const pixels = a.getContext("2d").getImageData(0, 0, 320, 320).data;
    const reference = b.getContext("2d").getImageData(0, 0, 320, 320).data;
    let changed = 0, lastChangedRow = 0;
    for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      if (![0, 1, 2, 3].some(c => pixels[i + c] !== reference[i + c])) continue;
      changed++;
      lastChangedRow = y;
      assert.ok(x >= 30 && x < 126 && y >= 220, `plush outside the lower-left frame: ${x},${y}`);
    }
    assert.ok(changed > 2000);
    assert.ok(lastChangedRow >= 318, "the paws touch the bottom of the portrait");
  } finally { restore(); }
});
