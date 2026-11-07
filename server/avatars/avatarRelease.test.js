import test from "node:test";
import assert from "node:assert/strict";
import { registerAvatarRoutes } from "./registerAvatarRoutes.js";
import { normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { loadCatalog } from "./avatarValidation.js";

test("the major release saves the complete avatar pack and exposes its authenticated image route", async () => {
  const routes = new Map(); let thumbnails = 0, saved;
  registerAvatarRoutes({ router: {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    put(path, handler) { routes.set(`PUT ${path}`, handler); },
  }, getAuthContext: async () => ({ user: { id: 7 } }), requireAuth: () => true,
    repository: { get: async () => ({ revision: 0 }), save: async (...args) => {
      saved = args; return { saved: true, avatar: args[1], revision: 1, userId: 7 };
    } }, thumbnails: {
      assets: {}, get: () => {}, render: () => assert.fail("The major release must generate the complete pack"),
      renderAssets: async () => { thumbnails++; return { png: Buffer.from("thumbnail"), renderVersion: 1, assets: { version: 1 } }; },
    },
  });
  assert.deepEqual([...routes.keys()].sort(), ["GET /avatar", "GET /avatars", "GET /avatars/:userId/chat.png", "GET /avatars/:userId/render/:revision/:version/:kind.png", "PUT /avatar"]);
  let status = 200, result;
  const response = { set() {}, status(code) { status = code; return this; }, json(body) { result = body; } };
  await routes.get("PUT /avatar")({ body: { userId: 7, expectedRevision: 0, avatar: normalizeAvatar({}, await loadCatalog()) } }, response);
  assert.equal(status, 200); assert.equal(result.ok, true);
  assert.equal(thumbnails, 1); assert.equal(saved[3].assets.version, 1);
});
