import AssetManager from "../../assets/assetManager.js";
import { makeFileKey } from "../../assets/bootAssetManifest.js";
import { createStateFeature } from "../../app/core/createStateFeature.js";
import { normalizeWord } from "../../components/gameLogic.js";

const DICTIONARY_URL = "/dico.txt";

export function parseClientDictionary(text, normalize = normalizeWord) {
  const entries = new Set();
  const source = String(text || "");
  let lineStart = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index < source.length && source.charCodeAt(index) !== 10) continue;
    let lineEnd = index;
    if (lineEnd > lineStart && source.charCodeAt(lineEnd - 1) === 13) {
      lineEnd -= 1;
    }
    const word = normalize(source.slice(lineStart, lineEnd).trim());
    if (word) entries.add(word);
    lineStart = index + 1;
  }
  return entries;
}

export function createInitialClientDictionaryState() {
  return {
    entries: null,
    error: "",
    status: "idle",
  };
}

export function createClientDictionaryFeature(
  context,
  {
    abortControllerFactory = () => new AbortController(),
    assetManager = AssetManager,
    fetchImpl = (...args) => globalThis.fetch(...args),
    textDecoderFactory = () => new TextDecoder("utf-8"),
  } = {}
) {
  let feature = null;
  let active = false;
  let abortController = null;
  let loadGeneration = 0;

  const cancelLoad = () => {
    loadGeneration += 1;
    abortController?.abort?.();
    abortController = null;
  };

  const clear = () => {
    cancelLoad();
    feature.patch(createInitialClientDictionaryState());
  };

  const load = async () => {
    if (!active || feature.store.getState().status === "loading") return;
    const generation = ++loadGeneration;
    abortController?.abort?.();
    abortController = abortControllerFactory();
    feature.patch({ error: "", status: "loading" });
    const fileKey = makeFileKey(DICTIONARY_URL);
    let cachedBuffer = null;
    try {
      cachedBuffer = assetManager.getFileBuffer?.(fileKey) || null;
      let text = "";
      let decodedCachedBuffer = false;
      if (cachedBuffer) {
        try {
          text = textDecoderFactory().decode(new Uint8Array(cachedBuffer));
          decodedCachedBuffer = true;
        } catch (_) {
          decodedCachedBuffer = false;
        } finally {
          assetManager.release?.(fileKey);
          cachedBuffer = null;
        }
      }
      if (!decodedCachedBuffer) {
        const response = await fetchImpl(DICTIONARY_URL, {
          signal: abortController?.signal,
        });
        text = await response.text();
      }
      if (!active || generation !== loadGeneration) return;
      const entries = parseClientDictionary(text);
      if (!active || generation !== loadGeneration) return;
      abortController = null;
      feature.patch({ entries, error: "", status: "ready" });
    } catch (error) {
      if (!active || generation !== loadGeneration || error?.name === "AbortError") return;
      abortController = null;
      feature.patch({
        entries: null,
        error: String(error?.message || error || "dictionary_load_failed"),
        status: "error",
      });
    } finally {
      if (cachedBuffer) assetManager.release?.(fileKey);
    }
  };

  feature = createStateFeature(context, createInitialClientDictionaryState, {
    start: ({ scope }) => {
      const kernel = context.getKernel();
      const sync = () => {
        const shouldBeActive = kernel.getState().navigation.view === "daily_play";
        if (shouldBeActive === active) return;
        active = shouldBeActive;
        if (active) {
          void load();
          return;
        }
        clear();
      };
      sync();
      scope.add(kernel.subscribe(sync));
      scope.add(() => {
        active = false;
        clear();
      });
    },
  });

  return Object.freeze({ ...feature, clear, load });
}
