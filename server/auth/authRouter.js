import express from "express";
import {
  AUTH_SESSION_TTL_MS,
  authenticateUser,
  claimLegacyUser,
  issueSocketTicket,
  createSession,
  createUser,
  ensureUserPrimaryInstallId,
  findLegacyReservationByInstallId,
  findUserById,
  listUsersByDeviceInstallId,
  getSessionByToken,
  initAuthService,
  invalidateSessionByToken,
  invalidateSessionsForUser,
  linkDeviceToUser,
  sanitizeEmail,
  sanitizeUsernameDisplay,
  syncLegacyReservations,
  updatePassword,
  validatePassword,
  verifyUserPassword,
} from "./authService.js";

const SESSION_COOKIE_NAME = "gobble_session";
const LOGIN_DELAY_MS = 400;
const LOGIN_MAX_DELAY_MS = 4000;
const failedLogins = new Map();

function parseCookies(rawCookieHeader) {
  const out = {};
  const input = String(rawCookieHeader || "");
  if (!input) return out;
  for (const part of input.split(";")) {
    const [keyRaw, ...valueParts] = part.split("=");
    const key = String(keyRaw || "").trim();
    if (!key) continue;
    const value = valueParts.join("=").trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  const host = String(req.headers.host || "").toLowerCase();
  const isLocalhost =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]") ||
    host.startsWith("::1");
  return !isLocalhost && (req.secure || forwardedProto === "https");
}

function serializeCookie(name, value, req, { maxAgeMs = AUTH_SESSION_TTL_MS, clear = false } = {}) {
  const parts = [`${name}=${clear ? "" : encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (isSecureRequest(req)) parts.push("Secure");
  if (clear) {
    parts.push("Max-Age=0");
    parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  } else {
    const maxAgeSeconds = Math.max(0, Math.floor(maxAgeMs / 1000));
    parts.push(`Max-Age=${maxAgeSeconds}`);
    parts.push(`Expires=${new Date(Date.now() + maxAgeMs).toUTCString()}`);
  }
  return parts.join("; ");
}

function sessionPayload(user) {
  return {
    id: user.id,
    usernameDisplay: user.usernameDisplay,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    isLegacyConverted: user.isLegacyConverted,
    mustResetPassword: user.mustResetPassword,
  };
}

async function getAuthContext(req) {
  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return { session: null, user: null, token: "" };
  const auth = await getSessionByToken(token);
  if (!auth?.user) return { session: null, user: null, token };
  return { session: auth.session, user: auth.user, token };
}

function getAttemptKey(req, username) {
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "").trim().toLowerCase();
  const normalized = String(username || "").trim().toLowerCase();
  return `${ip}|${normalized}`;
}

function getLoginThrottle(req, username) {
  const key = getAttemptKey(req, username);
  const entry = failedLogins.get(key);
  if (!entry) return { key, retryAfterMs: 0 };
  const retryAfterMs = Math.max(0, Number(entry.blockedUntil) - Date.now());
  return { key, retryAfterMs };
}

function recordLoginFailure(key) {
  const previous = failedLogins.get(key) || { failures: 0, blockedUntil: 0 };
  const failures = previous.failures + 1;
  const delayMs = Math.min(LOGIN_DELAY_MS * failures, LOGIN_MAX_DELAY_MS);
  failedLogins.set(key, {
    failures,
    blockedUntil: Date.now() + delayMs,
  });
  return delayMs;
}

function clearLoginFailures(key) {
  failedLogins.delete(key);
}

async function maybeAttachDeviceToUser({
  user,
  rawInstallId,
}) {
  if (!user?.id || !rawInstallId) {
    return { ok: true, user };
  }
  await linkDeviceToUser(user.id, rawInstallId);
  await ensureUserPrimaryInstallId(user.id);
  const refreshedUser = await findUserById(user.id);
  return { ok: true, user: refreshedUser };
}

async function findLegacyReservationForInstallPair(rawInstallId, resolvedInstallId) {
  const candidates = [];
  const raw = String(rawInstallId || "").trim();
  const resolved = String(resolvedInstallId || "").trim();
  if (raw) candidates.push(raw);
  if (resolved && resolved !== raw) candidates.push(resolved);
  for (const installId of candidates) {
    const reservation = await findLegacyReservationByInstallId(installId);
    if (reservation) return reservation;
  }
  return null;
}

function buildInstallPair(installId, normalizeInstallIdRaw, resolveCanonicalInstallId) {
  const rawInstallId = normalizeInstallIdRaw(installId);
  return {
    rawInstallId,
    resolvedInstallId: rawInstallId ? resolveCanonicalInstallId(rawInstallId) || rawInstallId : "",
  };
}

function requireAuth(auth, res, req) {
  if (auth?.user) return true;
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, "", req, { clear: true }));
  res.status(401).json({ ok: false, error: "auth_required" });
  return false;
}

export function createAuthRouter({
  normalizeInstallIdRaw,
  resolveCanonicalInstallId,
}) {
  const router = express.Router();

  router.use(async (_req, _res, next) => {
    await initAuthService();
    await syncLegacyReservations().catch(() => {});
    next();
  });

  router.post("/status", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    const rememberedUserId = Number(req.body?.rememberedUserId);
    const { rawInstallId, resolvedInstallId } = buildInstallPair(
      req.body?.installId,
      normalizeInstallIdRaw,
      resolveCanonicalInstallId
    );

    if (auth.user) {
      const linked = await maybeAttachDeviceToUser({
        user: auth.user,
        rawInstallId,
        resolvedInstallId,
      });
      return res.json({
        ok: true,
        status: "authenticated",
        authenticated: true,
        user: sessionPayload(linked.user || auth.user),
      });
    }

    if (rawInstallId) {
      const reservation = await findLegacyReservationForInstallPair(rawInstallId, resolvedInstallId);
      if (reservation && !reservation.claimed_user_id) {
        return res.json({
          ok: true,
          status: "legacy_profile_found",
          authenticated: false,
          legacyProfile: {
            installId: reservation.install_id,
            usernameDisplay: reservation.username_display,
          },
        });
      }

      const recognizedUsers = await listUsersByDeviceInstallId(rawInstallId, resolvedInstallId);
      const rememberedUser =
        Number.isInteger(rememberedUserId) && rememberedUserId > 0
          ? recognizedUsers.find((user) => Number(user?.id) === rememberedUserId) || null
          : null;
      const userToRestore =
        recognizedUsers.length === 1 ? recognizedUsers[0] : rememberedUser;
      if (userToRestore) {
        const attached = await maybeAttachDeviceToUser({
          user: userToRestore,
          rawInstallId,
          resolvedInstallId,
        });
        const session = await createSession(attached.user.id);
        res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, session.token, req));
        return res.json({
          ok: true,
          status: "authenticated",
          authenticated: true,
          user: sessionPayload(attached.user),
        });
      }
    }

    return res.json({
      ok: true,
      status: "no_account",
      authenticated: false,
    });
  });

  router.post("/register", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    if (auth.user) {
      res.status(409);
      return res.json({ ok: false, error: "already_authenticated" });
    }

    const usernameResult = sanitizeUsernameDisplay(req.body?.username);
    const passwordResult = validatePassword(req.body?.password);
    const emailResult = sanitizeEmail(req.body?.email);
    const { rawInstallId, resolvedInstallId } = buildInstallPair(
      req.body?.installId,
      normalizeInstallIdRaw,
      resolveCanonicalInstallId
    );

    if (!usernameResult.ok) {
      res.status(400);
      return res.json({ ok: false, error: usernameResult.error });
    }
    if (!passwordResult.ok) {
      res.status(400);
      return res.json({ ok: false, error: passwordResult.error });
    }
    if (!emailResult.ok) {
      res.status(400);
      return res.json({ ok: false, error: emailResult.error });
    }

    if (rawInstallId) {
      const reservation = await findLegacyReservationForInstallPair(rawInstallId, resolvedInstallId);
      if (reservation && !reservation.claimed_user_id) {
        res.status(409);
        return res.json({
          ok: false,
          error: "legacy_claim_required",
          legacyProfile: {
            usernameDisplay: reservation.username_display,
          },
        });
      }
    }

    const createResult = await createUser({
      usernameDisplay: usernameResult.value,
      password: String(req.body?.password || ""),
      email: emailResult.value,
      primaryInstallId: null,
      isLegacyConverted: false,
    });
    if (!createResult.ok) {
      res.status(
        createResult.error === "username_taken" ||
          createResult.error === "username_reserved" ||
          createResult.error === "device_linked_to_other_account"
          ? 409
          : 400
      );
      return res.json({
        ok: false,
        error: createResult.error,
      });
    }

    const attached = await maybeAttachDeviceToUser({
      user: createResult.user,
      rawInstallId,
      resolvedInstallId,
    });

    const session = await createSession(attached.user.id);
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, session.token, req));
    return res.json({
      ok: true,
      status: "authenticated",
      user: sessionPayload(attached.user),
    });
  });

  router.post("/claim-legacy", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    if (auth.user) {
      res.status(409);
      return res.json({ ok: false, error: "already_authenticated" });
    }

    const passwordResult = validatePassword(req.body?.password);
    const emailResult = sanitizeEmail(req.body?.email);
    const { rawInstallId, resolvedInstallId } = buildInstallPair(
      req.body?.installId,
      normalizeInstallIdRaw,
      resolveCanonicalInstallId
    );
    if (!rawInstallId) {
      res.status(400);
      return res.json({ ok: false, error: "install_id_required" });
    }
    if (!passwordResult.ok) {
      res.status(400);
      return res.json({ ok: false, error: passwordResult.error });
    }
    if (!emailResult.ok) {
      res.status(400);
      return res.json({ ok: false, error: emailResult.error });
    }

    const reservation = await findLegacyReservationForInstallPair(rawInstallId, resolvedInstallId);
    if (!reservation) {
      res.status(404);
      return res.json({ ok: false, error: "legacy_profile_not_found" });
    }

    const claimResult = await claimLegacyUser({
      installId: reservation.install_id,
      password: String(req.body?.password || ""),
      email: emailResult.value,
    });
    if (!claimResult.ok) {
      res.status(
        claimResult.error === "legacy_profile_already_claimed" ? 409 : 404
      );
      return res.json({ ok: false, error: claimResult.error });
    }

    const attached = await maybeAttachDeviceToUser({
      user: claimResult.user,
      rawInstallId,
      resolvedInstallId,
    });

    const session = await createSession(attached.user.id);
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, session.token, req));
    return res.json({
      ok: true,
      status: "authenticated",
      user: sessionPayload(attached.user),
    });
  });

  router.post("/login", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    if (auth.user) {
      res.status(409);
      return res.json({ ok: false, error: "already_authenticated" });
    }

    const username = req.body?.username;
    const throttle = getLoginThrottle(req, username);
    if (throttle.retryAfterMs > 0) {
      res.status(429);
      return res.json({
        ok: false,
        error: "too_many_attempts",
        retryAfterMs: throttle.retryAfterMs,
      });
    }

    const { rawInstallId, resolvedInstallId } = buildInstallPair(
      req.body?.installId,
      normalizeInstallIdRaw,
      resolveCanonicalInstallId
    );

    const loginResult = await authenticateUser(username, String(req.body?.password || ""));
    if (!loginResult.ok) {
      const retryAfterMs = recordLoginFailure(throttle.key);
      res.status(401);
      return res.json({
        ok: false,
        error: loginResult.error,
        retryAfterMs,
      });
    }
    clearLoginFailures(throttle.key);

    const attached = await maybeAttachDeviceToUser({
      user: loginResult.user,
      rawInstallId,
      resolvedInstallId,
    });

    const session = await createSession(attached.user.id);
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, session.token, req));
    return res.json({
      ok: true,
      status: "authenticated",
      user: sessionPayload(attached.user),
    });
  });

  router.post("/logout", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    if (auth.token) {
      await invalidateSessionByToken(auth.token).catch(() => {});
    }
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, "", req, { clear: true }));
    return res.json({ ok: true });
  });

  router.post("/socket-ticket", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    if (!requireAuth(auth, res, req)) return;
    const ticket = await issueSocketTicket(auth.user.id);
    return res.json({ ok: true, ticket });
  });

  router.get("/me", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    if (!requireAuth(auth, res, req)) return;
    return res.json({
      ok: true,
      authenticated: true,
      user: sessionPayload(auth.user),
    });
  });

  router.post("/change-password", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await getAuthContext(req);
    if (!requireAuth(auth, res, req)) return;

    const newPasswordResult = validatePassword(req.body?.newPassword);
    if (!newPasswordResult.ok) {
      res.status(400);
      return res.json({ ok: false, error: newPasswordResult.error });
    }

    if (!auth.user.mustResetPassword) {
      const currentPassword = String(req.body?.currentPassword || "");
      const passwordOk = await verifyUserPassword(auth.user.id, currentPassword);
      if (!passwordOk) {
        res.status(401);
        return res.json({ ok: false, error: "invalid_current_password" });
      }
    }

    await updatePassword({
      userId: auth.user.id,
      newPassword: String(req.body?.newPassword || ""),
      clearMustResetPassword: true,
    });
    await invalidateSessionsForUser(auth.user.id, { exceptSessionId: auth.session?.id || null });
    const refreshedUser = await findUserById(auth.user.id);
    return res.json({
      ok: true,
      user: sessionPayload(refreshedUser),
    });
  });

  router.post("/request-password-reset", (_req, res) => {
    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      message:
        "La récupération de mot de passe se fait manuellement pour le moment. Contacte l’administrateur du jeu.",
    });
  });

  return router;
}
