import { validateAvatarConfiguration } from "./avatarValidation.js";

export function registerAvatarRoutes({ router, getAuthContext, requireAuth, repository, inventory, onPurchase, thumbnails, onSaved, isMaintenanceModeActive = () => false }) {
  const assertWritable = () => {
    if (isMaintenanceModeActive()) throw Object.assign(new Error("maintenance_mode"), { code: "maintenance_mode" });
  };
  const maintenanceResponse = res => res.status(503).json({ ok: false, error: "maintenance_mode", maintenanceMode: true });
  if (thumbnails) router.get("/avatars/:userId/chat.png", async (req, res) => {
    res.set("Cache-Control", "private, no-cache");
    try {
      const auth = await getAuthContext(req);
      if (!requireAuth(auth, res, req)) return;
      const userId = Number(req.params.userId);
      if (!/^[1-9]\d*$/.test(req.params.userId) || !Number.isSafeInteger(userId)) return res.status(400).end();
      const thumbnail = await thumbnails.get(userId);
      if (!thumbnail) return res.status(204).end();
      const etag = `"avatar-chat-${userId}-${thumbnail.revision}-${thumbnail.renderVersion}"`;
      res.set("ETag", etag);
      if (String(req.query?.v) === String(thumbnail.revision)) {
        res.set("Cache-Control", "private, max-age=86400");
      }
      if (req.headers?.["if-none-match"] === etag) return res.status(304).end();
      return res.type("png").send(thumbnail.png);
    } catch (error) {
      console.warn("[avatar] chat thumbnail unavailable", error?.message);
      return res.status(503).end();
    }
  });
  if (inventory) {
    router.post("/avatar/rewards/ack", async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const auth = await getAuthContext(req);
        if (!requireAuth(auth, res, req)) return;
        if (Number(req.body?.userId) !== auth.user.id) return res.status(409).json({ ok: false, error: "avatar_account_changed" });
        const ok = await inventory.objectives.acknowledge(auth.user.id, req.body?.keys);
        return res.status(ok ? 200 : 400).json({ ok });
      } catch { return res.status(503).json({ ok: false, error: "avatar_unavailable" }); }
    });
    const inventoryHandler = purchasing => async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        assertWritable();
        const auth = await getAuthContext(req);
        if (!requireAuth(auth, res, req)) return;
        assertWritable();
        const userId = auth.user.id;
        if (Number(purchasing ? req.body?.userId : req.query?.userId) !== userId) return res.status(409).json({ ok: false, error: "avatar_account_changed" });
        if (!purchasing) return res.json({ ok: true, inventory: await inventory.get(userId) });
        const result = await inventory.purchase(userId, req.body?.items, { assertWritable });
        if (result.ok) onPurchase?.(userId);
        return res.status(result.ok ? 200 : result.error === "avatar_invalid" ? 400 : 409).json(result);
      } catch (error) {
        if (error?.code === "maintenance_mode") return maintenanceResponse(res);
        console.error("[avatar] inventory unavailable", error?.code || error?.name || "unknown");
        return res.status(503).json({ ok: false, error: "avatar_unavailable" });
      }
    };
    router.get("/avatar/inventory", inventoryHandler(false));
    router.post("/avatar/purchase", inventoryHandler(true));
  }
  // Public appearances for a recap, read in one bounded query when it opens.
  router.get("/avatars", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const auth = await getAuthContext(req);
      if (!requireAuth(auth, res, req)) return;
      const ids = typeof req.query?.userIds === "string" ? req.query.userIds.split(",") : [];
      if (!ids.length || ids.length > 24 || ids.some(id => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) {
        return res.status(400).json({ ok: false, error: "avatar_invalid" });
      }
      const avatars = await repository.getMany([...new Set(ids.map(Number))]);
      return res.json({ ok: true, avatars: inventory ? await inventory.filterAppearances(avatars) : avatars });
    } catch (error) {
      console.error("[avatar] portraits unavailable", error?.code || error?.name || "unknown");
      return res.status(503).json({ ok: false, error: "avatar_unavailable" });
    }
  });
  const handle = save => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (save) assertWritable();
      const auth = await getAuthContext(req);
      if (!requireAuth(auth, res, req)) return;
      if (save) assertWritable();
      const userId = auth.user.id;
      // A tab belonging to an older session must never write to the newly signed-in account.
      const requestedUserId = save ? req.body?.userId : req.query?.userId;
      if (Number(requestedUserId) !== userId) return res.status(409).json({ ok: false, error: "avatar_account_changed" });
      if (!save) {
        await inventory?.ensureEntitlements?.(userId);
        const saved = await repository.get(userId);
        if (inventory && saved.avatar) saved.avatar = await inventory.appearance(userId, saved.avatar);
        return res.json({ ok: true, ...saved, ...(inventory ? { unlocksRequired: true, rewards: await inventory.objectives.pending(userId),
          weeklyAuras: await inventory.weeklyAuras?.ensure() } : {}) });
      }
      const revision = req.body?.expectedRevision;
      if (!Number.isSafeInteger(revision) || revision < 0) return res.status(400).json({ ok: false, error: "avatar_invalid" });
      const avatar = await validateAvatarConfiguration(req.body?.avatar);
      if (!avatar) return res.status(400).json({ ok: false, error: "avatar_invalid" });
      if (inventory && !await inventory.canEquip(userId, avatar)) return res.status(403).json({ ok: false, error: "avatar_locked" });
      // No client-supplied image: the miniature must match the validated, owned pieces.
      const current = thumbnails ? await repository.get(userId) : null;
      if (current && current.revision !== revision) {
        return res.status(409).json({ ok: false, ...current, error: "avatar_conflict" });
      }
      const thumbnail = thumbnails ? await thumbnails.render(avatar) : null;
      assertWritable();
      const { saved, ...snapshot } = await repository.save(userId, avatar, revision, thumbnail, { assertWritable });
      if (saved) {
        try { onSaved?.({ userId, revision: snapshot.revision }); } catch (_) { /* Persistence already succeeded. */ }
      }
      if (inventory?.appearance) snapshot.avatar = await inventory.appearance(userId, snapshot.avatar);
      return res.status(saved ? 200 : 409).json({ ok: saved, ...snapshot, ...(saved ? {} : { error: "avatar_conflict" }) });
    } catch (error) {
      if (error?.code === "maintenance_mode") return maintenanceResponse(res);
      console.error("[avatar] account persistence failed", error?.code || error?.name || "unknown");
      return res.status(503).json({ ok: false, error: "avatar_unavailable" });
    }
  };
  router.get("/avatar", handle(false));
  router.put("/avatar", handle(true));
}
