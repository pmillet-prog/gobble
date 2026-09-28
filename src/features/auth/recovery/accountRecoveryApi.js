const ERRORS = {
  username_required: "Indique le pseudo du compte à récupérer.",
  email_invalid: "Vérifie l’adresse email de contact.",
  support_message_invalid: "Écris un message de 10 à 3 000 caractères.",
  password_required: "Choisis un nouveau mot de passe.",
  password_too_short: "Le mot de passe doit contenir au moins 3 caractères.",
  password_too_long: "Le mot de passe doit contenir au maximum 200 caractères.",
  reset_link_invalid: "Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien.",
  recovery_rate_limited: "Trop de demandes rapprochées. Réessaie plus tard ou écris à support@gobble.fr.",
  recovery_busy: "Une demande est déjà en cours. Réessaie dans un instant.",
  mail_unavailable: "L’envoi est momentanément indisponible. Réessaie ou écris à support@gobble.fr.",
};
export async function accountRecoveryRequest(path, body, { signal } = {}) {
  let response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: "POST", credentials: "same-origin", cache: "no-store", signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Connexion interrompue. Vérifie ta connexion et réessaie.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw Object.assign(new Error(ERRORS[result?.error] || "La demande n’a pas pu aboutir. Réessaie ou écris à support@gobble.fr."), { code: result?.error });
  }
  return result;
}
