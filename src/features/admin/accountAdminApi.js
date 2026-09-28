const ERRORS = {
  auth_required: "Reconnecte-toi pour utiliser ces outils.",
  admin_forbidden: "Ce compte n’est pas autorisé à administrer le jeu.",
  account_not_found: "Ce compte n’existe plus.",
  account_online: "Un des comptes est encore connecté ou termine une manche. Réessaie après sa déconnexion.",
  account_recently_active: "Un des comptes vient d’être utilisé. Attends une minute après sa déconnexion.",
  account_busy: "Une intervention est déjà en cours sur ce compte.",
  cannot_target_self: "Tu ne peux pas modifier ton propre compte avec cet outil.",
  protected_account: "Les comptes administrateurs sont protégés de cette opération.",
  same_account: "Choisis deux comptes différents.",
  preview_expired: "L’aperçu a expiré. Relance l’aperçu de fusion.",
  legacy_progression_pending: "Ce compte possède une ancienne progression à vérifier avant la fusion.",
  content_expired: "Ce message est trop ancien. Utilise la croix lors de sa prochaine apparition.",
};
export async function accountAdminRequest(path, body, { signal } = {}) {
  const response = await fetch(`/api/admin/${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store", signal,
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw Object.assign(new Error(ERRORS[data?.error] || "L’opération n’a pas pu être confirmée. Réessaie."), { code: data?.error });
  return data;
}
