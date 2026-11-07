import { normalizeWheelDiagnostic } from "../../shared/wheelDiagnostic.js";
import { registerWheelGraphicsRoutes } from "./registerWheelGraphicsRoutes.js";

export function registerWheelDiagnosticRoutes(app, { readAccount, isAllowed, repository, now = Date.now }) {
  registerWheelGraphicsRoutes(app, { readAccount, repository });
  const attempts = new Map();
  app.post("/api/infortune/diagnostics", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.headers["sec-fetch-site"] === "cross-site") return response.status(403).json({ ok: false });
    if (!String(request.headers["content-type"] || "").startsWith("application/json")) return response.status(415).json({ ok: false });
    let report;
    try {
      if (JSON.stringify(request.body).length > 64000) throw new Error("too_large");
      report = normalizeWheelDiagnostic(request.body);
    } catch { return response.status(400).json({ ok: false, error: "invalid_report" }); }
    try {
      const account = await readAccount(request);
      const key = account?.id ? `user:${account.id}` : `guest:${request.ip || "unknown"}`;
      const time = now();
      for (const [id, entry] of attempts) if (time - entry.at >= 3600000) attempts.delete(id);
      const entry = attempts.get(key) || { at: time, ids: new Set() };
      if (!entry.ids.has(report.id) && entry.ids.size >= 8) return response.status(429).json({ ok: false, error: "rate_limited" });
      if (!attempts.has(key) && attempts.size >= 10000) attempts.delete(attempts.keys().next().value);
      entry.ids.add(report.id); attempts.set(key, entry);
      await repository.save(report, account);
      return response.json({ ok: true, id: report.id });
    } catch { return response.status(503).json({ ok: false, error: "diagnostic_unavailable" }); }
  });
  app.get("/api/dev/infortune/diagnostics", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      const account = await readAccount(request);
      if (!account) return response.status(401).json({ ok: false, error: "auth_required" });
      if (!isAllowed(account)) return response.status(403).json({ ok: false, error: "dev_required" });
      const before = request.query?.before === undefined ? Number.MAX_SAFE_INTEGER : Number(request.query.before);
      if (!Number.isSafeInteger(before) || before < 1) return response.status(400).json({ ok: false, error: "invalid_cursor" });
      return response.json({ ok: true, ...await repository.list(before) });
    } catch { return response.status(503).json({ ok: false, error: "diagnostic_unavailable" }); }
  });
}
