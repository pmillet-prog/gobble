export function requestChatAudit(connection, filters, receive, timeoutMs = 12000) {
  let active = true;
  let timer;
  const finish = response => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    receive(response);
  };
  if (!connection?.connected) {
    finish({ ok: false, error: "disconnected" });
  } else {
    timer = setTimeout(() => finish({ ok: false, error: "timeout" }), timeoutMs);
    try { connection.emit("moderation:chat-history", filters, finish); }
    catch { finish({ ok: false, error: "disconnected" }); }
  }
  return () => { active = false; clearTimeout(timer); };
}

export function chatAuditError(error) {
  if (["auth_required", "account_not_allowed", "moderation_forbidden"].includes(error)) return "Accès réservé aux comptes de modération autorisés.";
  if (error === "invalid_chat_query") return "Vérifie les dates et la recherche (100 caractères maximum).";
  if (error === "disconnected") return "Reconnecte-toi au serveur pour consulter le journal.";
  if (error === "timeout") return "Le serveur ne répond pas. Réessaie dans un instant.";
  if (error === "chat_busy") return "Une lecture est déjà en cours. Réessaie dans un instant.";
  return "Le journal est temporairement indisponible.";
}
