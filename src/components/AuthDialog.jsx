import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

function fieldClass(darkMode) {
  return `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
    darkMode
      ? "border-white/10 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-blue-400"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
  }`;
}

function panelClass(darkMode) {
  return darkMode
    ? "border-slate-700 bg-slate-900/95 text-slate-100"
    : "border-slate-200 bg-white/95 text-slate-900";
}

function actionClass(primary, darkMode) {
  if (primary) {
    return "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500";
  }
  return `rounded-lg border px-4 py-2 text-sm font-semibold transition ${
    darkMode
      ? "border-white/10 bg-slate-800 text-slate-100 hover:bg-slate-700"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

function renderTitle(mode, mustResetPassword) {
  switch (mode) {
    case "register":
      return "Créer un compte";
    case "claim-legacy":
      return "Sécurise ton profil";
    case "forgot-password":
      return "Mot de passe oublié";
    case "change-password":
      return mustResetPassword ? "Nouveau mot de passe" : "Changer le mot de passe";
    case "login":
    default:
      return "Connexion";
  }
}

function renderLead(mode, mustResetPassword) {
  switch (mode) {
    case "register":
      return "Crée ton compte pour conserver ton profil sur plusieurs appareils.";
    case "claim-legacy":
      return "Ton profil a été reconnu. Choisis un mot de passe pour le sécuriser.";
    case "forgot-password":
      return "La récupération de mot de passe se fait manuellement pour le moment. Contacte l’administrateur du jeu.";
    case "change-password":
      return mustResetPassword
        ? "Choisis un nouveau mot de passe pour continuer."
        : "Mets à jour ton mot de passe depuis tes paramètres.";
    case "login":
    default:
      return "Connecte-toi pour retrouver ton profil.";
  }
}

export default function AuthDialog({
  open,
  mode,
  darkMode,
  form,
  error,
  info,
  loading,
  mustResetPassword = false,
  onClose,
  onSubmit,
  onFieldChange,
  onModeChange,
}) {
  const usernameInputRef = useRef(null);
  const currentPasswordInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const forgotPasswordButtonRef = useRef(null);
  const canRender = !!open && typeof document !== "undefined";

  const title = renderTitle(mode, mustResetPassword);
  const lead = renderLead(mode, mustResetPassword);
  const usernameLocked = mode === "claim-legacy";
  const showUsername = mode === "login" || mode === "register" || mode === "claim-legacy";
  const showPassword = mode !== "forgot-password";
  const showCurrentPassword = mode === "change-password" && !mustResetPassword;
  const showConfirmPassword =
    mode === "register" || mode === "claim-legacy" || mode === "change-password";
  const showEmail =
    mode === "register" || mode === "claim-legacy";

  useEffect(() => {
    if (!canRender) return;
    const target =
      mode === "forgot-password"
        ? forgotPasswordButtonRef.current
        : showUsername && !usernameLocked
        ? usernameInputRef.current
        : showCurrentPassword
        ? currentPasswordInputRef.current
        : passwordInputRef.current;
    target?.focus?.();
    target?.select?.();
  }, [canRender, mode, showCurrentPassword, showUsername, usernameLocked]);

  if (!canRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-[21000] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={loading ? undefined : onClose}
        aria-label="Fermer"
      />
      <div
        role="dialog"
        aria-modal="true"
        data-auth-dialog="true"
        className={`relative w-full max-w-md rounded-2xl border p-5 shadow-2xl ${panelClass(darkMode)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-blue-500">
              Compte
            </div>
            <div className="mt-1 text-xl font-black">{title}</div>
          </div>
          <button
            type="button"
            className={`h-8 w-8 rounded-full border text-lg leading-none ${
              darkMode
                ? "border-white/10 bg-slate-800 text-slate-100"
                : "border-slate-200 bg-white text-slate-700"
            }`}
            onClick={loading ? undefined : onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <p className={`mt-3 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{lead}</p>

        {info ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              darkMode
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {info}
          </div>
        ) : null}
        {error ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              darkMode
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {error}
          </div>
        ) : null}

        {mode === "forgot-password" ? (
          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              className={actionClass(false, darkMode)}
              onClick={() => onModeChange?.("login")}
              ref={forgotPasswordButtonRef}
            >
              Retour
            </button>
            <button type="button" className={actionClass(true, darkMode)} onClick={onClose}>
              Fermer
            </button>
          </div>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit?.();
            }}
          >
            {showUsername ? (
              <label className="block text-sm font-semibold">
                Pseudo
                <input
                  ref={usernameInputRef}
                  type="text"
                  className={fieldClass(darkMode)}
                  value={form.username}
                  onChange={(event) => onFieldChange?.("username", event.target.value)}
                  disabled={loading || usernameLocked}
                  minLength={usernameLocked ? undefined : 3}
                  maxLength={25}
                  autoComplete={mode === "login" ? "username" : "nickname"}
                  autoFocus={!usernameLocked}
                />
              </label>
            ) : null}

            {showCurrentPassword ? (
              <label className="block text-sm font-semibold">
                Mot de passe actuel
                <input
                  ref={currentPasswordInputRef}
                  type="password"
                  className={fieldClass(darkMode)}
                  value={form.currentPassword}
                  onChange={(event) => onFieldChange?.("currentPassword", event.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
              </label>
            ) : null}

            {showPassword ? (
              <label className="block text-sm font-semibold">
                {mode === "change-password" ? "Nouveau mot de passe" : "Mot de passe"}
                <input
                  ref={passwordInputRef}
                  type="password"
                  className={fieldClass(darkMode)}
                  value={form.password}
                  onChange={(event) => onFieldChange?.("password", event.target.value)}
                  disabled={loading}
                  minLength={3}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  autoFocus={usernameLocked || (!showUsername && !showCurrentPassword)}
                />
              </label>
            ) : null}

            {showConfirmPassword ? (
              <label className="block text-sm font-semibold">
                Confirmation
                <input
                  type="password"
                  className={fieldClass(darkMode)}
                  value={form.confirmPassword}
                  onChange={(event) => onFieldChange?.("confirmPassword", event.target.value)}
                  disabled={loading}
                  minLength={3}
                  autoComplete="new-password"
                />
              </label>
            ) : null}

            {showEmail ? (
              <label className="block text-sm font-semibold">
                Adresse email
                <input
                  type="email"
                  className={fieldClass(darkMode)}
                  value={form.email}
                  onChange={(event) => onFieldChange?.("email", event.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
                <div className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Adresse email facultative.
                </div>
              </label>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                className={actionClass(false, darkMode)}
                onClick={loading ? undefined : onClose}
              >
                Annuler
              </button>
              <button type="submit" className={actionClass(true, darkMode)} disabled={loading}>
                {loading
                  ? "En cours..."
                  : mode === "register"
                  ? "Créer le compte"
                  : mode === "claim-legacy"
                  ? "Sécuriser"
                  : mode === "change-password"
                  ? "Mettre à jour"
                  : "Se connecter"}
              </button>
            </div>

            {mode === "login" ? (
              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                <button
                  type="button"
                  className={`font-semibold ${darkMode ? "text-blue-300" : "text-blue-600"}`}
                  onClick={() => onModeChange?.("register")}
                >
                  Créer un compte
                </button>
                <button
                  type="button"
                  className={`font-semibold ${darkMode ? "text-amber-300" : "text-amber-700"}`}
                  onClick={() => onModeChange?.("forgot-password")}
                >
                  Mot de passe oublié
                </button>
              </div>
            ) : null}

            {mode === "register" ? (
              <div className="pt-1 text-xs">
                <button
                  type="button"
                  className={`font-semibold ${darkMode ? "text-blue-300" : "text-blue-600"}`}
                  onClick={() => onModeChange?.("login")}
                >
                  Déjà un compte ? Se connecter
                </button>
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
