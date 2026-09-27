import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, Image, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { createAvatarRenderer } from "../../../src/features/avatar/avatarRenderer.js";
import { withAvatarAccessories } from "../../../shared/avatarObjectives.js";

export { createCanvas, loadImage, GlobalFonts };
export const avatarAssetRoot = new URL("../../../public/avatars/v1/", import.meta.url);
export const avatarCatalog = withAvatarAccessories(JSON.parse(readFileSync(new URL("catalog.json", avatarAssetRoot))));
GlobalFonts.registerFromPath(fileURLToPath(new URL("../../../public/fonts/caveat/Caveat-VariableFont_wght.ttf", import.meta.url)), "AvatarMarker");

// Use the production compositor without launching a browser or a game server.
// The native canvas loads the same PNG bytes and exposes browser canvas methods.
export async function createNativeAvatarRenderer() {
  const previous = { fetch: globalThis.fetch, Image: globalThis.Image, document: globalThis.document };
  const descriptor = Object.getOwnPropertyDescriptor(Image.prototype, "src");
  globalThis.Image = function BrowserImage() {
    const image = new Image();
    const decoded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    Object.defineProperty(image, "src", { set(url) {
      if (!url.startsWith("/avatars/v1/")) throw Error("Unexpected avatar URL");
      descriptor.set.call(image, readFileSync(new URL(url.slice("/avatars/v1/".length), avatarAssetRoot)));
    } });
    image.decode = () => decoded;
    return image;
  };
  globalThis.document = { createElement: name => {
    if (name !== "canvas") throw Error("Unexpected DOM element");
    return createCanvas(1, 1);
  } };
  globalThis.fetch = async url => {
    if (url !== "/avatars/v1/catalog.json") throw Error("Unexpected network request");
    return { ok: true, json: async () => avatarCatalog };
  };
  const renderer = await createAvatarRenderer();
  return { renderer, restore() {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  } };
}
