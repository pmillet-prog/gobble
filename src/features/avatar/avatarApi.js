const MESSAGES = {
  maintenance_mode: "L’atelier d’avatar est fermé pendant la mise à jour. Réessaie une fois celle-ci terminée.",
  avatar_locked: "Débloque les pièces sélectionnées avant d’enregistrer cet avatar.",
  avatar_objective_locked: "Cette pièce se gagne en accomplissant son objectif.",
  insufficient_funds: "Tu n’as pas assez de gobblars pour ces pièces.",
  auth_required: "Reconnecte-toi pour retrouver et enregistrer ton avatar.",
  avatar_account_changed: "Le compte connecté a changé. Rouvre le profil du compte actuel.",
  avatar_conflict: "Ton avatar a changé sur un autre appareil. Recharge la version du compte avant de le modifier.",
  avatar_invalid: "Cette combinaison ne peut pas être enregistrée. Recharge l’atelier puis réessaie.",
  avatar_refund_changed: "La liste de tes achats a changé. Vérifie le nouveau total avant de confirmer à nouveau.",
  avatar_refund_unavailable: "Impossible de vérifier le remboursement exact de tes achats pour le moment. Aucun remboursement n’a été effectué. Réessaie plus tard.",
};

export function avatarApiError(code = "avatar_unavailable") {
  return Object.assign(new Error(MESSAGES[code] || "Impossible de joindre la sauvegarde du compte. Vérifie ta connexion puis réessaie."), { code });
}

export async function requestAccountAvatar(userId, { avatar, expectedRevision, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  const saving = avatar !== undefined;
  try {
    const response = await fetch(`/api/auth/avatar${saving ? "" : `?userId=${userId}`}`, {
      method: saving ? "PUT" : "GET", credentials: "include", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", ...(saving ? { "Content-Type": "application/json" } : {}) },
      ...(saving ? { body: JSON.stringify({ userId, avatar, expectedRevision }) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) throw avatarApiError(data?.error);
    if (data.userId !== userId) throw avatarApiError("avatar_account_changed");
    if (!Number.isSafeInteger(data.revision) || data.revision < 0
      || (data.avatar !== null && (!data.avatar || data.avatar.version !== 1))) throw avatarApiError();
    return data;
  } catch (error) {
    if (error?.code && MESSAGES[error.code]) throw error;
    throw avatarApiError();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
