import { AVATAR_ASSET_VARIANTS } from "../../shared/avatarRenderAssets.js";

export function registerAvatarAssetRoutes({ router, getAuthContext, requireAuth, renders }) {
  if (!renders) return;
  router.get("/avatars/:userId/render/:revision/:version/:kind.png", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      if (!requireAuth(await getAuthContext(req), res, req)) return;
      const { userId, revision, version, kind } = req.params;
      if ([userId, revision, version].some(value => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
        || !Object.hasOwn(AVATAR_ASSET_VARIANTS, kind)) return res.status(400).end();
      const asset = await renders.get(Number(userId), Number(revision), Number(version), kind);
      if (!asset) return res.status(404).end();
      const etag = `"avatar-${userId}-${revision}-${version}-${kind}"`;
      res.set("ETag", etag);
      res.set("Cache-Control", "private, max-age=31536000, immutable");
      if (req.headers?.["if-none-match"] === etag) return res.status(304).end();
      return res.type("png").send(asset.png);
    } catch (error) {
      console.warn("[avatar] rendered asset unavailable", error?.message);
      return res.status(503).end();
    }
  });
}
