const INPUT_ERRORS = new Set(["username_required", "email_invalid", "support_message_invalid", "password_required", "password_too_short", "password_too_long", "reset_link_invalid"]);

export function registerAccountRecoveryRoutes(router, { recovery, onPasswordReset, publicUrl = process.env.GOBBLE_PUBLIC_URL || "https://gobble.fr" }) {
  function allowedOrigin(req) {
    if (req.get("sec-fetch-site") === "cross-site") return false;
    const origin = req.get("origin");
    if (!origin) return true;
    try {
      const url = new URL(origin);
      const canonical = new URL(publicUrl);
      if (!["https:", "http:"].includes(url.protocol)) return false;
      if (url.origin === canonical.origin) return true;
      // The production reverse proxy normalizes Host to gobble.fr for www too.
      if (canonical.hostname === "gobble.fr" && url.origin === "https://www.gobble.fr") return true;
      return url.host === req.get("host") && (url.protocol === "https:" || process.env.NODE_ENV !== "production");
    } catch (_) { return false; }
  }
  function route(path, handler) {
    router.post(path, async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        // JSON plus same-origin checks also prevent third-party form submissions
        // from turning the support mailbox into a public mail relay.
        if (!req.is("application/json") || !allowedOrigin(req)) {
          return res.status(403).json({ ok: false, error: "recovery_forbidden" });
        }
        const result = await handler(req.body || {}, req.ip);
        return res.json(result);
      } catch (error) {
        const code = error.message;
        if (code === "recovery_rate_limited") {
          res.set("Retry-After", "900");
          return res.status(429).json({ ok: false, error: code });
        }
        if (INPUT_ERRORS.has(code)) return res.status(400).json({ ok: false, error: code });
        const publicCode = ["recovery_busy", "account_busy"].includes(code) ? "recovery_busy"
          : code === "mail_unavailable" ? "mail_unavailable" : "recovery_unavailable";
        return res.status(503).json({ ok: false, error: publicCode });
      }
    });
  }
  route("/request-password-reset", (body, ip) => recovery.requestReset({ username: body.username, ip }));
  route("/account-recovery-support", (body, ip) => recovery.submitSupport({ username: body.username, message: body.message, replyEmail: body.replyEmail, ip }));
  route("/reset-password", (body, ip) => recovery.completeReset({ token: body.token, newPassword: body.newPassword, ip, onReset: onPasswordReset }));
}
