// Same server-side account allowlist as the dev menu; no gameplay writes.
export function registerWorkshopAccess(app, { readAccount, isAllowed }) {
  app.get("/api/dev/workshops/access", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      const account = await readAccount(request);
      if (!account) return response.status(401).json({ ok: false, allowed: false });
      if (!isAllowed(account)) return response.status(403).json({ ok: false, allowed: false });
      return response.json({ ok: true, allowed: true });
    } catch {
      return response.status(503).json({ ok: false, allowed: false });
    }
  });
}
