import {
  createEmptyAuthForm,
  normalizeAuthUsernameInput,
} from "../../components/auth/authFormModel.js";

const AUTH_STATUS_ENDPOINT = "/api/auth/status";
const AUTH_REQUEST_TIMEOUT_MS = 8000;
const AUTH_STATUS_TIMEOUT_MS = 6500;

export function createAuthAccountController(runtime) {
  const [
    socket,
    socketConnectPromiseRef,
    isAccountAuthenticated,
    authModalModes,
    legacyProfileUsername,
    authState,
    nickname,
    setAuthModalMode,
    setAuthError,
    setAuthInfo,
    setAuthForm,
    setAuthSubmitting,
    authSubmitting,
    deviceInstallId,
    setAuthState,
    setAccountNotice,
    accountServerBusyMessage,
    isAuthStatusPending,
    isAuthServerUnavailable,
    setLoginError,
    setDailyStartError,
    authModalMode,
    authForm,
    accountSessionUnavailableMessage,
    setNickname,
    setIsAccountMenuOpen,
    clearSavedSession,
    isLoggedIn,
    returnToLobby,
  ] = runtime;
  const AUTH_MODAL_MODES = authModalModes;
  const ACCOUNT_SERVER_BUSY_MESSAGE = accountServerBusyMessage;
  const ACCOUNT_SESSION_UNAVAILABLE_MESSAGE = accountSessionUnavailableMessage;

function parsePossiblyDirtyJson(rawText) {
  if (typeof rawText !== "string") return null;
  const raw = rawText.replace(/^\uFEFF/, "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {}
  const firstObj = raw.indexOf("{");
  const lastObj = raw.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    const candidate = raw.slice(firstObj, lastObj + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }
  const firstArr = raw.indexOf("[");
  const lastArr = raw.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    const candidate = raw.slice(firstArr, lastArr + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }
  return null;
}

function isLikelyHtmlPayload(rawText) {
  const raw = String(rawText || "").trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.startsWith("<!doctype html") ||
    raw.startsWith("<html") ||
    raw.includes("<head") ||
    raw.includes("<body")
  );
}

async function readJsonResponseLoose(res) {
  const raw = await res.text();
  const data = parsePossiblyDirtyJson(raw);
  return {
    raw,
    data,
    parseOk: !!(data && typeof data === "object"),
    isLikelyHtml: isLikelyHtmlPayload(raw),
  };
}

function formatAuthError(errorCode) {
  switch (String(errorCode || "")) {
    case "username_required":
      return "Pseudo requis.";
    case "username_too_short":
      return "3 caractères minimum.";
    case "username_too_long":
      return "25 caractères max.";
    case "username_taken":
    case "username_reserved":
      return "Ce pseudo est déjà utilisé.";
    case "password_required":
      return "Mot de passe requis.";
    case "password_too_short":
      return "3 caractères minimum.";
    case "password_too_long":
      return "Mot de passe trop long.";
    case "invalid_credentials":
      return "Pseudo ou mot de passe incorrect.";
    case "invalid_current_password":
      return "Mot de passe actuel incorrect.";
    case "email_invalid":
      return "Adresse email invalide.";
    case "legacy_claim_required":
      return "Ton profil historique a été reconnu. Sécurise-le d'abord.";
    case "legacy_profile_not_found":
      return "Profil historique introuvable.";
    case "legacy_profile_already_claimed":
      return "Ce profil est déjà sécurisé.";
    case "device_linked_to_other_account":
      return "Cet appareil est déjà lié à un autre compte.";
    case "too_many_attempts":
      return "Réessaie dans quelques secondes.";
    case "auth_required":
      return "Connecte-toi pour continuer.";
    case "already_authenticated":
      return "Compte déjà connecté.";
    case "install_id_required":
      return "Identifiant appareil manquant.";
    default:
      return "Une erreur est survenue.";
  }
}

async function postAuthJson(
  url,
  payload = null,
  { method = "POST", timeoutMs = AUTH_REQUEST_TIMEOUT_MS } = {}
) {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    controller && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => controller.abort(), Math.max(1, Math.round(timeoutMs)))
      : null;
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      credentials: "include",
      signal: controller?.signal,
      headers: {
        Accept: "application/json",
        ...(payload !== null ? { "Content-Type": "application/json" } : {}),
      },
      body: payload !== null ? JSON.stringify(payload) : undefined,
    });
    const parsed = await readJsonResponseLoose(res);
    return {
      ok: !!(res.ok && parsed?.data && typeof parsed.data === "object" && parsed.data.ok !== false),
      status: res.status,
      data: parsed?.data && typeof parsed.data === "object" ? parsed.data : null,
      parseOk: !!parsed?.parseOk,
      isLikelyHtml: !!parsed?.isLikelyHtml,
      diagnosticRef: String(res.headers.get("x-gobble-vault-ref") || "").trim(),
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("request_timeout");
    }
    if (err && typeof err === "object") {
      err.requestKind =
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "offline"
          : "network";
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function connectSocketWithAuth() {
  if (socket.connected) return true;
  if (socketConnectPromiseRef.current) {
    return await socketConnectPromiseRef.current;
  }
  const task = (async () => {
    if (isAccountAuthenticated) {
      let ticket = "";
      try {
        const ticketResponse = await postAuthJson("/api/auth/socket-ticket", {});
        ticket = String(ticketResponse?.data?.ticket || "").trim();
      } catch (_) {}
      if (!ticket) {
        const refreshed = await refreshAuthStatus({ silent: true });
        if (refreshed?.status === "authenticated" && refreshed?.user) {
          try {
            const retryResponse = await postAuthJson("/api/auth/socket-ticket", {});
            ticket = String(retryResponse?.data?.ticket || "").trim();
          } catch (_) {}
        }
      }
      if (!ticket) {
        socket.auth = {};
        setTimeout(() => {
          if (typeof socket.emitReserved === "function") {
            socket.emitReserved("connect_error", new Error("auth_required"));
          }
        }, 0);
        return false;
      }
      socket.auth = { socketTicket: ticket };
    } else {
      socket.auth = {};
    }
    return await new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onConnect = () => finish(true);
      const onError = () => finish(false);
      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
      socket.connect();
      setTimeout(() => finish(socket.connected), 5000);
    });
  })();
  socketConnectPromiseRef.current = task;
  try {
    return await task;
  } finally {
    socketConnectPromiseRef.current = null;
  }
}

function buildAuthFormForMode(mode) {
  const defaultUsername =
    mode === AUTH_MODAL_MODES.CLAIM_LEGACY
      ? legacyProfileUsername
      : normalizeAuthUsernameInput(
          authState.user?.usernameDisplay || authState.legacyProfile?.usernameDisplay || nickname || ""
        );
  return createEmptyAuthForm({
    username: defaultUsername,
    email: authState.user?.email || "",
  });
}

function openAuthDialog(mode) {
  setAuthModalMode(mode);
  setAuthError("");
  setAuthInfo("");
  setAuthForm(buildAuthFormForMode(mode));
}

function closeAuthDialog() {
  if (authSubmitting) return;
  setAuthModalMode(null);
  setAuthError("");
  setAuthInfo("");
}

async function refreshAuthStatus({ silent = false } = {}) {
  if (!silent) {
    setAuthState((prev) => ({ ...prev, loading: true }));
  }
  try {
    const response = await postAuthJson(AUTH_STATUS_ENDPOINT, {
      installId: deviceInstallId,
    }, { timeoutMs: AUTH_STATUS_TIMEOUT_MS });
    const payload = response.data || {};
    if (response.ok) {
      setAccountNotice((prev) => (prev === ACCOUNT_SERVER_BUSY_MESSAGE ? "" : prev));
    }
    if (response.ok && payload.status === "authenticated" && payload.user) {
      setAuthState({
        loading: false,
        status: "authenticated",
        user: payload.user,
        legacyProfile: null,
      });
      return payload;
    }
    if (response.ok && payload.status === "legacy_profile_found" && payload.legacyProfile) {
      setAuthState({
        loading: false,
        status: "legacy_profile_found",
        user: null,
        legacyProfile: payload.legacyProfile,
      });
      return payload;
    }
    if (response.ok && payload.status === "login_required") {
      setAuthState({
        loading: false,
        status: "login_required",
        user: payload.user || null,
        legacyProfile: null,
      });
      return payload;
    }
    setAuthState({
      loading: false,
      status: "no_account",
      user: null,
      legacyProfile: null,
    });
    return payload;
  } catch (err) {
    const code = String(err?.message || "");
    const name = String(err?.name || "");
    const transientServerIssue =
      code === "request_timeout" ||
      code === "Failed to fetch" ||
      code === "NetworkError" ||
      name === "TypeError";
    setAuthState((prev) => ({
      loading: false,
      status:
        prev?.status && prev.status !== "loading"
          ? prev.status
          : transientServerIssue
          ? "unavailable"
          : "no_account",
      user: prev?.user || null,
      legacyProfile: prev?.legacyProfile || null,
    }));
    if (transientServerIssue) {
      setAccountNotice(ACCOUNT_SERVER_BUSY_MESSAGE);
    }
    return null;
  }
}

function ensureAuthenticated({ source = "action" } = {}) {
  if (isAuthStatusPending) {
    const message = "Vérification du profil...";
    setAccountNotice(message);
    if (source === "live") {
      setLoginError(message);
    } else if (source === "daily") {
      setDailyStartError(message);
    }
    return false;
  }
  if (isAuthServerUnavailable) {
    setAccountNotice(ACCOUNT_SERVER_BUSY_MESSAGE);
    void refreshAuthStatus({ silent: true });
    if (source === "live") {
      setLoginError(ACCOUNT_SERVER_BUSY_MESSAGE);
    } else if (source === "daily") {
      setDailyStartError(ACCOUNT_SERVER_BUSY_MESSAGE);
    }
    return false;
  }
  if (isAccountAuthenticated) {
    if (authState.user?.mustResetPassword) {
      setAccountNotice("");
      openAuthDialog(AUTH_MODAL_MODES.CHANGE_PASSWORD);
      return false;
    }
    return true;
  }
  const nextMode =
    authState.status === "legacy_profile_found"
      ? AUTH_MODAL_MODES.CLAIM_LEGACY
      : authState.status === "login_required"
      ? AUTH_MODAL_MODES.LOGIN
      : AUTH_MODAL_MODES.REGISTER;
  openAuthDialog(nextMode);
  if (source === "live") {
    setLoginError("Connecte-toi pour continuer.");
  } else if (source === "daily") {
    setDailyStartError("Connecte-toi pour continuer.");
  }
  return false;
}

async function submitAuthDialog() {
  if (!authModalMode) return;
  const username = normalizeAuthUsernameInput(authForm.username);
  const password = String(authForm.password || "");
  const confirmPassword = String(authForm.confirmPassword || "");
  const currentPassword = String(authForm.currentPassword || "");
  const email = String(authForm.email || "").trim();

  if (
    (authModalMode === AUTH_MODAL_MODES.REGISTER ||
      authModalMode === AUTH_MODAL_MODES.CLAIM_LEGACY ||
      authModalMode === AUTH_MODAL_MODES.CHANGE_PASSWORD) &&
    password !== confirmPassword
  ) {
    setAuthError("Les mots de passe ne correspondent pas.");
    return;
  }

  setAuthSubmitting(true);
  setAuthError("");
  setAuthInfo("");
  setAccountNotice("");

  try {
    let response = null;
    if (authModalMode === AUTH_MODAL_MODES.LOGIN) {
      response = await postAuthJson("/api/auth/login", {
        username,
        password,
        installId: deviceInstallId,
      });
    } else if (authModalMode === AUTH_MODAL_MODES.REGISTER) {
      response = await postAuthJson("/api/auth/register", {
        username,
        password,
        email: email || null,
        installId: deviceInstallId,
      });
    } else if (authModalMode === AUTH_MODAL_MODES.CLAIM_LEGACY) {
      response = await postAuthJson("/api/auth/claim-legacy", {
        installId: deviceInstallId,
        password,
        email: email || null,
      });
    } else if (authModalMode === AUTH_MODAL_MODES.CHANGE_PASSWORD) {
      response = await postAuthJson("/api/auth/change-password", {
        currentPassword,
        newPassword: password,
      });
    }

    const payload = response?.data || {};
    if (!response?.ok) {
      if (payload?.error === "already_authenticated") {
        const refreshed = await refreshAuthStatus({ silent: true });
        if (refreshed?.status === "authenticated" && refreshed?.user) {
          setAuthModalMode(null);
          setAuthForm(createEmptyAuthForm());
          return;
        }
      }
      const mappedError = formatAuthError(payload?.error);
      setAuthError(mappedError);
      if (payload?.error === "legacy_claim_required") {
        await refreshAuthStatus({ silent: true });
        setAuthModalMode(AUTH_MODAL_MODES.CLAIM_LEGACY);
        setAuthForm(buildAuthFormForMode(AUTH_MODAL_MODES.CLAIM_LEGACY));
      }
      return;
    }

    if (authModalMode === AUTH_MODAL_MODES.CHANGE_PASSWORD) {
      const nextUser = payload?.user || authState.user;
      setAuthState({
        loading: false,
        status: "authenticated",
        user: nextUser,
        legacyProfile: null,
      });
      setAccountNotice("Mot de passe mis à jour.");
      setAuthModalMode(null);
      setAuthForm(createEmptyAuthForm());
      return;
    }

    if (payload?.user) {
      const refreshed = await refreshAuthStatus({ silent: true });
      if (refreshed && (refreshed.status !== "authenticated" || !refreshed.user)) {
        setAccountNotice(ACCOUNT_SESSION_UNAVAILABLE_MESSAGE);
        setAuthError("Session compte indisponible. Vérifie les cookies du navigateur.");
        return;
      }
      const nextUser = refreshed?.user || payload.user;
      setAuthState({
        loading: false,
        status: "authenticated",
        user: nextUser,
        legacyProfile: null,
      });
      if (socket.connected) {
        socket.disconnect();
      }
      setNickname(nextUser.usernameDisplay || "");
      try {
        localStorage.setItem("boggle_nick", nextUser.usernameDisplay || "");
      } catch (_) {}
    }
    setAuthModalMode(null);
    setAuthForm(createEmptyAuthForm());
    setAccountNotice(
      authModalMode === AUTH_MODAL_MODES.CLAIM_LEGACY
        ? "Profil sécurisé."
        : authModalMode === AUTH_MODAL_MODES.REGISTER
        ? "Compte créé."
        : "Connexion réussie."
    );
  } catch (_) {
    setAuthError("Impossible de joindre le serveur.");
  } finally {
    setAuthSubmitting(false);
  }
}

async function handleAccountLogout() {
  setIsAccountMenuOpen(false);
  try {
    await postAuthJson("/api/auth/logout", {});
  } catch (_) {}
  clearSavedSession();
  socket.auth = {};
  if (socket.connected) {
    socket.disconnect();
  }
  if (isLoggedIn) {
    returnToLobby();
  }
  setAuthState({
    loading: false,
    status: "no_account",
    user: null,
    legacyProfile: null,
  });
  setAccountNotice("Déconnecté.");
  closeAuthDialog();
}


  return [
    parsePossiblyDirtyJson,
    isLikelyHtmlPayload,
    readJsonResponseLoose,
    formatAuthError,
    postAuthJson,
    connectSocketWithAuth,
    buildAuthFormForMode,
    openAuthDialog,
    closeAuthDialog,
    refreshAuthStatus,
    ensureAuthenticated,
    submitAuthDialog,
    handleAccountLogout,
  ];
}
