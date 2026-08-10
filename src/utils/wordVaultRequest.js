const RETRYABLE_WORD_VAULT_STATUSES = new Set([502, 503]);
const WORD_VAULT_RETRY_DELAY_MS = 350;

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function postWordVaultAddWithRetry(
  postAuthJson,
  endpoint,
  word,
  { retryDelayMs = WORD_VAULT_RETRY_DELAY_MS } = {}
) {
  if (typeof postAuthJson !== "function") return null;
  const safeRetryDelayMs = Math.max(0, Math.round(Number(retryDelayMs) || 0));

  let lastResponse = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      lastResponse = await postAuthJson(endpoint, { word });
    } catch (err) {
      const retryTimeout = attempt === 0 && err?.message === "request_timeout";
      if (!retryTimeout) throw err;
      await wait(safeRetryDelayMs);
      continue;
    }

    const shouldRetryResponse =
      attempt === 0 && RETRYABLE_WORD_VAULT_STATUSES.has(Number(lastResponse?.status));
    if (!shouldRetryResponse) return lastResponse;
    await wait(safeRetryDelayMs);
  }

  return lastResponse;
}
