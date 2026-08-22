import React from "react";
import SettingsMenuFrame from "../settings/SettingsMenuFrame.jsx";

export default function AccountMenu({ actions, appearance, auth, labels }) {
  const close = actions.onClose;
  return (
    <SettingsMenuFrame onClose={close}>
      <div
        className={`relative w-full max-w-xs rounded-2xl border-2 p-4 shadow-2xl ${appearance.shellClass}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-extrabold">Compte</div>
          <button
            type="button"
            className="h-7 w-7 rounded-full border flex items-center justify-center bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950"
            onClick={close}
            aria-label="Fermer"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <div className={`rounded-xl border px-3 py-3 ${appearance.panelButtonClass}`}>
            <div
              className={`text-[11px] font-extrabold uppercase tracking-[0.2em] ${
                appearance.darkMode ? "text-amber-200" : "text-amber-700"
              }`}
            >
              Profil
            </div>
            <div className="mt-1 text-sm font-semibold">
              {auth.authenticated
                ? auth.user?.usernameDisplay || "Connecté"
                : auth.pending
                ? "Vérification..."
                : auth.serverUnavailable
                ? "Serveur occupé"
                : auth.status === "legacy_profile_found"
                ? labels.legacyUsername || "Profil historique reconnu"
                : "Non connecté"}
            </div>
            <div
              className={`mt-1 text-xs ${
                appearance.darkMode ? "text-amber-50/70" : "text-slate-600"
              }`}
            >
              {auth.authenticated
                ? "Session persistante active."
                : auth.pending
                ? "Recherche d'un profil existant sur cet appareil."
                : auth.serverUnavailable
                ? labels.serverBusyMessage
                : auth.status === "legacy_profile_found"
                ? "Sécurise ce profil pour conserver ton identité."
                : "Connecte-toi pour retrouver ton profil."}
            </div>
          </div>

          {auth.authenticated ? (
            <>
              <button
                type="button"
                onClick={() => {
                  close();
                  actions.onOpenProfile({
                    userId: auth.userId,
                    nick: auth.user?.usernameDisplay || labels.nickname || "Joueur",
                  });
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${appearance.goldButtonClass}`}
              >
                Voir mon profil
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  actions.onOpenAuth(auth.modes.CHANGE_PASSWORD);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${appearance.panelButtonClass}`}
              >
                Changer le mot de passe
              </button>
              <button
                type="button"
                onClick={actions.onLogout}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${appearance.dangerButtonClass}`}
              >
                Se déconnecter
              </button>
            </>
          ) : auth.pending || auth.serverUnavailable ? (
            <button
              type="button"
              disabled={auth.pending}
              onClick={actions.onRefresh}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold disabled:opacity-60 ${appearance.panelButtonClass}`}
            >
              {auth.pending ? "Vérification du profil..." : "Réessayer"}
            </button>
          ) : auth.status === "legacy_profile_found" ? (
            <button
              type="button"
              onClick={() => {
                close();
                actions.onOpenAuth(auth.modes.CLAIM_LEGACY);
              }}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${appearance.goldButtonClass}`}
            >
              Sécuriser mon profil
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  close();
                  actions.onOpenAuth(auth.modes.REGISTER);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${appearance.goldButtonClass}`}
              >
                Créer un compte
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  actions.onOpenAuth(auth.modes.LOGIN);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${appearance.panelButtonClass}`}
              >
                Se connecter
              </button>
            </>
          )}
        </div>
      </div>
    </SettingsMenuFrame>
  );
}
