export function registerGobblarsHistoryRoute(app, { requireIdentity, checkRateLimit, readHistory }) {
  app.get("/api/gobblars/history", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const identity = await requireIdentity(req, res);
      if (!identity || !checkRateLimit(identity.installId, res)) return;
      const history = await readHistory({
        installId: identity.installId,
        before: req.query?.before,
        snapshot: req.query?.snapshot,
      });
      return res.json({ ok: true, accountId: String(identity.userId), ...history });
    } catch (error) {
      const invalid = error?.message === "invalid_cursor";
      if (!invalid) console.warn("Gobblars history unavailable", error);
      return res.status(invalid ? 400 : 503).json({ ok: false, error: invalid ? "invalid_cursor" : "history_unavailable" });
    }
  });
}
