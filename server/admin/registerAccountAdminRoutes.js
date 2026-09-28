import { randomBytes } from "node:crypto";
import { contentExclusions, resolveContentReference } from "./contentExclusions.js";

export function registerAccountAdminRoutes(app, { getAuth, isAdmin, accounts, assertOffline, onChanged = () => {} }) {
  const previews = new Map();
  const route = (method, url, handler) => app[method](`/api/admin/${url}`, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const auth = await getAuth(req);
      if (!auth?.user) return res.status(401).json({ ok: false, error: "auth_required" });
      if (!isAdmin(auth.user) || auth.user.mustResetPassword) return res.status(403).json({ ok: false, error: "admin_forbidden" });
      // JSON plus a same-site origin check protects credentialed writes even
      // where the application's public CORS policy accepts other origins.
      if (method === "post") {
        const origin = req.headers.origin;
        if (!req.is("application/json") || (origin && new URL(origin).host !== req.get("host"))) return res.status(403).json({ ok: false, error: "admin_forbidden" });
      }
      return res.json(await handler(req, auth.user));
    } catch (error) {
      const code = String(error?.message || "");
      const known = new Set(["invalid_account", "account_not_found", "same_account", "legacy_progression_pending", "invalid_operation", "cannot_target_self", "account_online", "account_recently_active", "account_busy", "protected_account", "preview_expired", "invalid_content", "content_expired"]);
      if (!known.has(code)) console.warn("Account administration failed", error);
      return res.status(known.has(code) ? 409 : 500).json({ ok: false, error: known.has(code) ? code : "admin_unavailable" });
    }
  });
  route("get", "capabilities", () => ({ ok: true, accountAdmin: true, contentAdmin: true }));
  route("get", "accounts", async req => ({ ok: true, accounts: await accounts.search(req.query.q) }));
  route("post", "accounts/merge-preview", async (req, actor) => {
    const plan = await accounts.preview(req.body.targetId, req.body.sourceId);
    if ([plan.target.id, plan.source.id].includes(actor.id)) throw new Error("cannot_target_self");
    assertOffline([plan.target.id, plan.source.id]);
    for (const [token, preview] of previews) if (preview.expiresAt <= Date.now()) previews.delete(token);
    if (previews.size > 500) previews.delete(previews.keys().next().value);
    const token = randomBytes(24).toString("hex");
    previews.set(token, { targetId: plan.target.id, sourceId: plan.source.id, actorId: actor.id, expiresAt: Date.now() + 5 * 60_000 });
    return { ok: true, ...plan, token };
  });
  route("post", "accounts/reset-password", async (req, actor) => {
    const result = await accounts.operate({ action: "reset-password", targetId: req.body.targetId, actorId: actor.id, operationId: req.body.operationId, assertOffline, assertAllowed: user => { if (isAdmin(user)) throw new Error("protected_account"); } });
    onChanged(result);
    return result;
  });
  route("post", "accounts/merge", async (req, actor) => {
    const preview = previews.get(req.body.token);
    if (!preview || preview.actorId !== actor.id || preview.expiresAt <= Date.now()) throw new Error("preview_expired");
    const result = await accounts.operate({ ...preview, action: "merge", operationId: req.body.operationId, assertOffline, assertAllowed: user => { if (isAdmin(user)) throw new Error("protected_account"); } });
    onChanged(result);
    return result;
  });
  route("post", "content/exclude", (req, actor) => {
    const content = req.body.reference ? resolveContentReference(req.body.reference) : req.body;
    if (!content) throw new Error("content_expired");
    return { ok: true, exclusion: contentExclusions.exclude(content.scope, content.word, actor) };
  });
}
