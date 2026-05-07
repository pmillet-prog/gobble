import { useEffect, useState } from "react";
import { normalizeWord } from "../components/gameLogic";

const WORD_VAULT_ENDPOINT = "/api/vault/words";

function normalizeWordVaultEntry(rawEntry) {
  const word = typeof rawEntry?.word === "string" ? rawEntry.word.trim() : "";
  const wordKeyRaw = typeof rawEntry?.wordKey === "string" ? rawEntry.wordKey.trim() : "";
  const wordKey = wordKeyRaw || normalizeWord(word);
  if (!word || !wordKey) return null;
  return {
    word,
    wordKey,
    addedAt: Number(rawEntry?.addedAt) || 0,
  };
}

function getWordVaultWordKey(rawWord) {
  const word = typeof rawWord === "string" ? rawWord.trim() : "";
  return word ? normalizeWord(word) : "";
}

export default function useWordVault({
  isAccountAuthenticated = false,
  authenticatedUserId = null,
  appView = "home",
  setAppView = null,
  refreshAuthStatus = null,
  ensureAuthenticated = null,
  postAuthJson = null,
  readJsonResponseLoose = null,
  showToast = null,
}) {
  const [wordVault, setWordVault] = useState({
    loading: false,
    loaded: false,
    error: "",
    sortMode: "addedAt",
    words: [],
  });
  const [wordVaultActionPending, setWordVaultActionPending] = useState(false);

  function isWordInVault(rawWord) {
    const targetKey = getWordVaultWordKey(rawWord);
    if (!targetKey) return false;
    return (Array.isArray(wordVault?.words) ? wordVault.words : []).some(
      (entry) => entry?.wordKey === targetKey
    );
  }

  async function fetchWordVault({ silent = false, retryAuth = true } = {}) {
    if (!isAccountAuthenticated) {
      setWordVault((prev) => ({
        ...prev,
        loading: false,
        loaded: false,
        error: "",
        words: [],
      }));
      return [];
    }
    if (!silent) {
      setWordVault((prev) => ({ ...prev, loading: true, error: "" }));
    }
    try {
      const res = await fetch(WORD_VAULT_ENDPOINT, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store, no-cache, max-age=0",
          Pragma: "no-cache",
        },
      });
      const parsed = await readJsonResponseLoose(res);
      const payload = parsed?.data && typeof parsed.data === "object" ? parsed.data : null;
      if (!res.ok || !payload) {
        throw new Error(String(payload?.error || `http_${res.status || "error"}`));
      }
      const words = Array.isArray(payload?.items)
        ? payload.items.map(normalizeWordVaultEntry).filter(Boolean)
        : [];
      setWordVault((prev) => ({
        ...prev,
        loading: false,
        loaded: true,
        error: "",
        words,
      }));
      return words;
    } catch (err) {
      const code = String(err?.message || "erreur");
      if (code === "auth_required" && retryAuth) {
        const refreshed = await refreshAuthStatus?.({ silent: true });
        if (refreshed?.status === "authenticated" && refreshed?.user) {
          return await fetchWordVault({ silent, retryAuth: false });
        }
      }
      setWordVault((prev) => ({
        ...prev,
        loading: false,
        loaded: true,
        error: code,
        words: code === "auth_required" ? [] : prev.words,
      }));
      return null;
    }
  }

  function openWordVaultPage() {
    if (!ensureAuthenticated?.({ source: "action" })) return;
    setAppView?.("vault");
    if (!wordVault.loaded || wordVault.error) {
      void fetchWordVault();
    }
  }

  function setWordVaultSortMode(sortMode) {
    const nextSortMode = sortMode === "alpha" || sortMode === "length" ? sortMode : "addedAt";
    setWordVault((prev) => ({ ...prev, sortMode: nextSortMode }));
  }

  async function addWordToVault(rawWord) {
    const word = typeof rawWord === "string" ? rawWord.trim() : "";
    if (!word) return false;
    if (!ensureAuthenticated?.({ source: "action" })) return false;
    if (isWordInVault(word)) {
      showToast?.("Mot déjà ajouté au coffre fort");
      return true;
    }
    setWordVaultActionPending(true);
    try {
      let response = await postAuthJson?.(WORD_VAULT_ENDPOINT, { word });
      const payload = response?.data || {};
      if (!response?.ok && payload?.error === "auth_required") {
        const refreshed = await refreshAuthStatus?.({ silent: true });
        if (refreshed?.status === "authenticated" && refreshed?.user) {
          response = await postAuthJson?.(WORD_VAULT_ENDPOINT, { word });
        } else {
          ensureAuthenticated?.({ source: "action" });
          showToast?.("Reconnecte-toi pour ajouter ce mot au coffre fort");
          return false;
        }
      }
      if (!response?.ok) {
        const retryPayload = response?.data || {};
        if (retryPayload?.error === "auth_required") {
          await refreshAuthStatus?.({ silent: true });
          ensureAuthenticated?.({ source: "action" });
          showToast?.("Reconnecte-toi pour ajouter ce mot au coffre fort");
        } else {
          showToast?.("Ajout au coffre fort impossible");
        }
        return false;
      }
      const successPayload = response?.data || {};
      const entry = normalizeWordVaultEntry(successPayload?.entry);
      if (!entry) {
        showToast?.("Ajout au coffre fort impossible");
        void fetchWordVault({ silent: true });
        return false;
      }
      setWordVault((prev) => {
        const existingWords = Array.isArray(prev?.words) ? prev.words : [];
        return {
          ...prev,
          loaded: true,
          error: "",
          words: [entry, ...existingWords.filter((item) => item.wordKey !== entry.wordKey)],
        };
      });
      void fetchWordVault({ silent: true });
      if (successPayload?.alreadyExists) {
        showToast?.("Mot déjà ajouté au coffre fort");
      } else {
        showToast?.("Mot ajouté au coffre fort");
      }
      return true;
    } catch (err) {
      const code = String(err?.message || "");
      if (code === "request_timeout") {
        try {
          const retryResponse = await postAuthJson?.(WORD_VAULT_ENDPOINT, { word });
          const retryPayload = retryResponse?.data || {};
          if (retryResponse?.ok) {
            const entry = normalizeWordVaultEntry(retryPayload?.entry);
            if (entry) {
              setWordVault((prev) => {
                const existingWords = Array.isArray(prev?.words) ? prev.words : [];
                return {
                  ...prev,
                  loaded: true,
                  error: "",
                  words: [entry, ...existingWords.filter((item) => item.wordKey !== entry.wordKey)],
                };
              });
              void fetchWordVault({ silent: true });
              showToast?.(retryPayload?.alreadyExists ? "Mot déjà ajouté au coffre fort" : "Mot ajouté au coffre fort");
              return true;
            }
          }
        } catch (_) {}
        showToast?.("Connexion trop lente, ajout au coffre fort non confirmé");
      } else {
        showToast?.("Ajout au coffre fort impossible");
      }
      return false;
    } finally {
      setWordVaultActionPending(false);
    }
  }

  async function removeWordFromVault(rawWord) {
    const word = typeof rawWord === "string" ? rawWord.trim() : "";
    if (!word || !isAccountAuthenticated) return false;
    setWordVaultActionPending(true);
    try {
      const response = await postAuthJson?.(WORD_VAULT_ENDPOINT, { word }, { method: "DELETE" });
      const payload = response?.data || {};
      if (!response?.ok) {
        showToast?.("Suppression du coffre fort impossible");
        return false;
      }
      const removedWordKey = getWordVaultWordKey(word);
      setWordVault((prev) => ({
        ...prev,
        loaded: true,
        error: "",
        words: (Array.isArray(prev?.words) ? prev.words : []).filter(
          (entry) => entry?.wordKey !== removedWordKey
        ),
      }));
      showToast?.(payload?.removed ? "Mot retiré du coffre fort" : "Mot déjà retiré du coffre fort");
      return true;
    } catch (_) {
      showToast?.("Suppression du coffre fort impossible");
      return false;
    } finally {
      setWordVaultActionPending(false);
    }
  }

  useEffect(() => {
    if (!isAccountAuthenticated) {
      setWordVault((prev) => ({
        ...prev,
        loading: false,
        loaded: false,
        error: "",
        words: [],
      }));
      if (appView === "vault") {
        setAppView?.("home");
      }
      return;
    }
    if (!wordVault.loaded || wordVault.error || appView === "vault") {
      void fetchWordVault({ silent: appView !== "vault" });
    }
  }, [appView, authenticatedUserId, isAccountAuthenticated, wordVault.error, wordVault.loaded]);

  return {
    wordVault,
    wordVaultActionPending,
    isWordInVault,
    fetchWordVault,
    openWordVaultPage,
    setWordVaultSortMode,
    addWordToVault,
    removeWordFromVault,
  };
}
