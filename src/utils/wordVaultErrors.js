import { getCrashContext, sendCrashReport } from "./crashReporter.js";

function diagnosticSuffix(reference) {
  const safeReference = String(reference || "").trim().toUpperCase();
  return safeReference ? ` [${safeReference}]` : "";
}

export function getWordVaultDiagnosticReference(response) {
  const serverReference = String(response?.data?.diagnosticRef || "").trim();
  if (serverReference) return serverReference;
  const headerReference = String(response?.diagnosticRef || "").trim();
  return headerReference;
}

export function describeWordVaultFailure({
  response = null,
  error = null,
  invalidSuccessPayload = false,
} = {}) {
  const payload = response?.data && typeof response.data === "object" ? response.data : {};
  const errorCode = String(payload?.error || "").trim();
  const status = Number(response?.status) || 0;
  const reference = getWordVaultDiagnosticReference(response);
  const suffix = diagnosticSuffix(reference);

  if (invalidSuccessPayload) {
    return `Réponse incohérente après l’ajout (CF-PAYLOAD)${suffix}`;
  }
  if (error?.message === "request_timeout") {
    return `Le serveur n’a pas répondu dans les 8 secondes (CF-TIMEOUT)${suffix}`;
  }
  if (error?.requestKind === "offline" || globalThis?.navigator?.onLine === false) {
    return `L’appareil est hors ligne au moment de l’ajout (CF-OFFLINE)${suffix}`;
  }
  if (error) {
    return `La requête a été interrompue ou bloquée avant toute réponse (réseau, navigateur ou appareil) (CF-NETWORK)${suffix}`;
  }
  if (errorCode === "auth_required" || status === 401) {
    return `La session du compte a expiré (CF-AUTH)${suffix}`;
  }
  if (errorCode === "word_required") {
    return `Le mot transmis au coffre est vide (CF-WORD-EMPTY)${suffix}`;
  }
  if (errorCode === "word_invalid") {
    return `Le format du mot a été refusé (CF-WORD-INVALID)${suffix}`;
  }
  if (errorCode === "vault_busy") {
    return `La base SQL est momentanément verrouillée (CF-SQL-BUSY)${suffix}`;
  }
  if (errorCode === "vault_unavailable") {
    return `Le service du coffre n’a pas pu ouvrir la base (CF-SERVICE)${suffix}`;
  }
  if (errorCode === "vault_add_failed") {
    return `L’écriture dans la base SQL a échoué (CF-SQL-WRITE)${suffix}`;
  }
  if (errorCode === "vault_readonly") {
    return `La base SQL est ouverte en lecture seule (CF-SQL-READONLY)${suffix}`;
  }
  if (errorCode === "vault_storage_full") {
    return `Le stockage du serveur est plein (CF-SQL-FULL)${suffix}`;
  }
  if (errorCode === "vault_io_error") {
    return `Le serveur a rencontré une erreur de lecture ou d’écriture disque (CF-SQL-IO)${suffix}`;
  }
  if (errorCode === "vault_corrupt") {
    return `La base SQL du coffre est endommagée ou illisible (CF-SQL-CORRUPT)${suffix}`;
  }
  if (errorCode === "vault_cannot_open") {
    return `Le serveur ne peut pas ouvrir le fichier du coffre (CF-SQL-OPEN)${suffix}`;
  }
  if (errorCode === "vault_permission") {
    return `Le serveur n’a pas les droits nécessaires sur le coffre (CF-SQL-PERMISSION)${suffix}`;
  }
  if (errorCode === "vault_constraint") {
    return `Une contrainte de la base a refusé l’ajout (CF-SQL-CONSTRAINT)${suffix}`;
  }
  if (errorCode === "vault_query_failed") {
    return `La requête SQL du coffre est incompatible avec la base (CF-SQL-QUERY)${suffix}`;
  }
  if (errorCode === "vault_request_failed") {
    return `Le serveur a échoué avant de terminer l’ajout (CF-SERVER)${suffix}`;
  }
  if (status === 403) {
    return `La requête a été bloquée par une protection réseau ou navigateur (CF-BLOCKED)${suffix}`;
  }
  if (status === 429) {
    return `Trop de requêtes ont été envoyées au serveur (CF-RATE)${suffix}`;
  }
  if (response?.isLikelyHtml) {
    return `Le relais web a renvoyé une page à la place du résultat (CF-PROXY)${suffix}`;
  }
  if (response && response?.parseOk === false) {
    return `La réponse du serveur est vide ou illisible (CF-RESPONSE)${suffix}`;
  }
  if (status >= 500) {
    return `Le serveur a renvoyé une erreur HTTP ${status} (CF-HTTP-5XX)${suffix}`;
  }
  if (status >= 400) {
    return `La requête a été refusée avec l’erreur HTTP ${status} (CF-HTTP-4XX)${suffix}`;
  }
  return `L’ajout a échoué sans réponse exploitable (CF-UNKNOWN)${suffix}`;
}

export function reportWordVaultFailure({
  response = null,
  error = null,
  invalidSuccessPayload = false,
  message = "",
} = {}) {
  const payload = response?.data && typeof response.data === "object" ? response.data : {};
  const safeContext = getCrashContext();
  delete safeContext.breadcrumbs;
  const report = {
    kind: "word-vault-add-failure",
    at: new Date().toISOString(),
    message:
      String(message || "").trim() ||
      describeWordVaultFailure({ response, error, invalidSuccessPayload }),
    context: {
      ...safeContext,
      wordVault: {
        action: "add",
        diagnosticRef: getWordVaultDiagnosticReference(response) || null,
        httpStatus: Number(response?.status) || null,
        serverError: String(payload?.error || "").trim() || null,
        responseParsed: typeof response?.parseOk === "boolean" ? response.parseOk : null,
        responseWasHtml:
          typeof response?.isLikelyHtml === "boolean" ? response.isLikelyHtml : null,
        invalidSuccessPayload: !!invalidSuccessPayload,
        requestKind: String(error?.requestKind || "").trim() || null,
        requestError: String(error?.message || "").trim().slice(0, 160) || null,
      },
    },
  };
  void sendCrashReport(report);
}
