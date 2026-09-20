export function registerStarterGrantRoutes({ router, getAuthContext, requireAuth, grants }) {
  const handle = acknowledge => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const auth = await getAuthContext(req);
      if (!requireAuth(auth, res, req)) return;
      const userId = Number(acknowledge ? req.body?.userId : req.query?.userId);
      if (userId !== auth.user.id) return res.status(409).json({ ok: false, error: "account_changed" });
      if (!acknowledge) return res.json({ ok: true, userId, grant: await grants.pending(userId) });
      const ok = await grants.acknowledge(userId, req.body?.key);
      return res.status(ok ? 200 : 400).json({ ok });
    } catch { return res.status(503).json({ ok: false, error: "starter_grant_unavailable" }); }
  };
  router.get("/gobblars/starter-grant", handle(false));
  router.post("/gobblars/starter-grant/ack", handle(true));
}
