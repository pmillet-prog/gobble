import React from "react";

import { useLazyArrayController } from "../../app/react/useLazyController.js";
import { createAuthAccountController } from "./createAuthAccountController.js";

export const ACCOUNT_SESSION_UNAVAILABLE_MESSAGE =
  "Session compte indisponible sur cette machine. Vérifie les cookies du navigateur.";
export const ACCOUNT_SERVER_BUSY_MESSAGE =
  "Le serveur met plus de temps que prévu à répondre. Ce n'est pas ta connexion : on réessaie automatiquement.";

export const AUTH_MODAL_MODES = Object.freeze({
  LOGIN: "login",
  REGISTER: "register",
  CLAIM_LEGACY: "claim-legacy",
  FORGOT_PASSWORD: "forgot-password",
  CHANGE_PASSWORD: "change-password",
});

export default function useAuthAccountController({
  account,
  daily,
  identity,
  live,
  overlays,
  socket,
}) {
  const socketConnectPromiseRef = React.useRef(null);
  const {
    authState,
    isAccountAuthenticated,
    isAuthServerUnavailable,
    isAuthStatusPending,
    nickname,
    setAuthState,
    setNickname,
  } = account;
  const { setDailyStartError } = daily;
  const { deviceInstallId } = identity;
  const {
    clearSavedSession,
    isLoggedIn,
    isLoggedInRef,
    returnToLobby,
    setLoginError,
  } = live;
  const {
    authForm,
    authModalMode,
    authSubmitting,
    setAccountNotice,
    setAuthError,
    setAuthForm,
    setAuthInfo,
    setAuthModalMode,
    setAuthSubmitting,
    setIsAccountMenuOpen,
  } = overlays;
  const legacyProfileUsername =
    authState.legacyProfile?.usernameDisplay || "";

  const [
    ,
    ,
    readJsonResponseLoose,
    ,
    postAuthJson,
    connectSocketWithAuth,
    buildAuthFormForMode,
    openAuthDialog,
    closeAuthDialog,
    refreshAuthStatus,
    ensureAuthenticated,
    submitAuthDialog,
    handleAccountLogout,
  ] = useLazyArrayController(
    createAuthAccountController,
    [
      socket,
      socketConnectPromiseRef,
      isAccountAuthenticated,
      AUTH_MODAL_MODES,
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
      ACCOUNT_SERVER_BUSY_MESSAGE,
      isAuthStatusPending,
      isAuthServerUnavailable,
      setLoginError,
      setDailyStartError,
      authModalMode,
      authForm,
      ACCOUNT_SESSION_UNAVAILABLE_MESSAGE,
      setNickname,
      setIsAccountMenuOpen,
      clearSavedSession,
      isLoggedIn,
      returnToLobby,
    ],
    13
  );

  React.useEffect(() => {
    void refreshAuthStatus();
  }, [deviceInstallId, refreshAuthStatus]);

  React.useEffect(() => {
    if (!isAuthServerUnavailable) return undefined;
    const timerId = setTimeout(() => {
      void refreshAuthStatus({ silent: false });
    }, 5000);
    return () => clearTimeout(timerId);
  }, [deviceInstallId, isAuthServerUnavailable, refreshAuthStatus]);

  React.useEffect(() => {
    if (!isAccountAuthenticated) return;
    if (!socket.connected) return;
    if (isLoggedInRef.current) return;
    socket.disconnect();
  }, [
    authState.user?.id,
    isAccountAuthenticated,
    isLoggedInRef,
    socket,
  ]);

  React.useEffect(() => {
    if (
      authState.status !== "legacy_profile_found" ||
      !authState.legacyProfile ||
      (authModalMode !== AUTH_MODAL_MODES.REGISTER &&
        authModalMode !== AUTH_MODAL_MODES.LOGIN)
    ) {
      return;
    }
    setAuthError("");
    setAuthInfo("");
    setAuthModalMode(AUTH_MODAL_MODES.CLAIM_LEGACY);
    setAuthForm(buildAuthFormForMode(AUTH_MODAL_MODES.CLAIM_LEGACY));
  }, [
    authModalMode,
    authState.legacyProfile,
    authState.status,
    buildAuthFormForMode,
    setAuthError,
    setAuthForm,
    setAuthInfo,
    setAuthModalMode,
  ]);

  React.useEffect(() => {
    const accountUsername = String(
      authState.user?.usernameDisplay || ""
    ).trim();
    if (!isAccountAuthenticated || !accountUsername || isLoggedIn) return;
    if (nickname !== accountUsername) setNickname(accountUsername);
    try {
      localStorage.setItem("boggle_nick", accountUsername);
    } catch (_) {}
  }, [
    authState.user?.usernameDisplay,
    isAccountAuthenticated,
    isLoggedIn,
    nickname,
    setNickname,
  ]);

  React.useEffect(() => {
    if (!isAccountAuthenticated || !authState.user?.mustResetPassword) return;
    if (authModalMode === AUTH_MODAL_MODES.CHANGE_PASSWORD) return;
    openAuthDialog(AUTH_MODAL_MODES.CHANGE_PASSWORD);
  }, [
    authModalMode,
    authState.user?.mustResetPassword,
    isAccountAuthenticated,
    openAuthDialog,
  ]);

  return {
    closeAuthDialog,
    connectSocketWithAuth,
    ensureAuthenticated,
    handleAccountLogout,
    openAuthDialog,
    postAuthJson,
    readJsonResponseLoose,
    refreshAuthStatus,
    submitAuthDialog,
  };
}
