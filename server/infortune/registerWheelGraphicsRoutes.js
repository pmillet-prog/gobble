import { recommendWheelGraphics, wheelDiagnosticPreference } from "../../shared/wheelGraphicsRecommendation.js";

export function registerWheelGraphicsRoutes(app, { readAccount, repository }) {
  app.get("/api/infortune/graphics", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.headers["sec-fetch-site"] === "cross-site") return response.status(403).json({ ok: false });
    const device = request.query?.device;
    if (typeof device !== "string" || !/^[\w-]{16,80}$/.test(device)) return response.status(400).json({ ok: false });
    try {
      const account = await readAccount(request);
      if (!account?.id) return response.json({ ok: true, recommendation: null, legacy: [] });
      // Account authorization is mandatory; a browser id is a selector, never
      // a bearer token for reading somebody else's diagnostics.
      const history = await repository.graphicsHistory(account.id);
      const exact = history.find(entry => entry.report.environment?.deviceId === device);
      if (exact) return response.json({ ok: true, reportId: exact.report.id, recommendation: recommendWheelGraphics(exact.report),
        preference: wheelDiagnosticPreference(exact.report), legacy: [] });
      const legacy = history.filter(entry => !entry.report.environment?.deviceId).map(entry => ({
        reportId: entry.report.id, createdAt: entry.createdAt, recommendation: recommendWheelGraphics(entry.report),
        preference: wheelDiagnosticPreference(entry.report),
        environment: { userAgent: entry.report.environment?.userAgent || "Navigateur non renseigné" },
      })).filter(entry => entry.preference || entry.recommendation.profile).slice(0, 3);
      // Old reports need explicit device confirmation instead of guessing from
      // a nickname, user agent, CPU count or screen dimensions.
      return response.json({ ok: true, recommendation: null, legacy });
    } catch { return response.status(503).json({ ok: false }); }
  });
}
