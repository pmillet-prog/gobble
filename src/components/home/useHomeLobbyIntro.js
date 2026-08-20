import React from "react";

const BACKGROUND_SOLO_HOLD_MS = 260;
const TITLE_SETTLE_MS = 820;
const INTRO_COMPLETE_MS = 1450;
const IMAGE_READY_TIMEOUT_MS = 3000;

function uniqueUrls(urls) {
  return Array.from(
    new Set(
      (Array.isArray(urls) ? urls : [])
        .map((url) => (typeof url === "string" ? url.trim() : ""))
        .filter(Boolean)
    )
  );
}

export function waitForDecodedImage(url, { timeoutMs = IMAGE_READY_TIMEOUT_MS } = {}) {
  if (!url || typeof Image === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(ready);
    };
    const decode = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
        finish(true);
      } catch (_) {
        finish(image.complete && image.naturalWidth > 0);
      }
    };
    const timeoutId = window.setTimeout(() => {
      finish(image.complete && image.naturalWidth > 0);
    }, Math.max(250, Number(timeoutMs) || IMAGE_READY_TIMEOUT_MS));
    image.decoding = "async";
    image.onload = decode;
    image.onerror = () => finish(false);
    image.src = url;
    if (image.complete && image.naturalWidth > 0) void decode();
  });
}

export default function useHomeLobbyIntro({
  backgroundUrl = "",
  enabled = true,
  onComplete = null,
  uiUrls = [],
} = {}) {
  const [stage, setStage] = React.useState(enabled ? "waiting" : "complete");
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const uiSignature = uniqueUrls(uiUrls).join("|");

  React.useEffect(() => {
    if (!enabled) {
      setStage("complete");
      return undefined;
    }
    if (typeof window === "undefined") {
      setStage("complete");
      return undefined;
    }

    let cancelled = false;
    let backgroundAdvanced = false;
    const timerIds = new Set();
    const schedule = (callback, delayMs) => {
      const timerId = window.setTimeout(() => {
        timerIds.delete(timerId);
        if (!cancelled) callback();
      }, Math.max(0, Number(delayMs) || 0));
      timerIds.add(timerId);
    };
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const urls = uiSignature ? uiSignature.split("|") : [];
    const uiReadyPromise = Promise.all(urls.map((url) => waitForDecodedImage(url)));

    setStage("waiting");
    const startedAt = performance.now();
    void waitForDecodedImage(backgroundUrl).then(async () => {
      if (cancelled) return;
      backgroundAdvanced = true;
      setStage("background");
      const backgroundShownAt = performance.now();
      await uiReadyPromise;
      if (cancelled) return;

      if (reducedMotion) {
        setStage("complete");
        onCompleteRef.current?.();
        return;
      }

      const backgroundElapsed = performance.now() - backgroundShownAt;
      schedule(() => {
        setStage("title");
        schedule(() => setStage("ui"), TITLE_SETTLE_MS);
        schedule(() => {
          setStage("complete");
          onCompleteRef.current?.();
        }, INTRO_COMPLETE_MS);
      }, Math.max(0, BACKGROUND_SOLO_HOLD_MS - backgroundElapsed));
    });

    // A broken image must never leave the home screen inaccessible.
    schedule(() => {
      if (backgroundAdvanced) return;
      if (performance.now() - startedAt < IMAGE_READY_TIMEOUT_MS) return;
      setStage((current) => {
        if (current !== "waiting") return current;
        onCompleteRef.current?.();
        return "complete";
      });
    }, IMAGE_READY_TIMEOUT_MS + 50);

    return () => {
      cancelled = true;
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      timerIds.clear();
    };
  }, [backgroundUrl, enabled, uiSignature]);

  return stage;
}
