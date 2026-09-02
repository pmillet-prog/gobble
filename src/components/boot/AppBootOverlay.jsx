import React from "react";

import AssetManager from "../../assets/assetManager.js";
import {
  BOOT_ASSET_MANIFEST_BASE,
  buildFileManifest,
  dedupeManifest,
} from "../../assets/bootAssetManifest.js";
import {
  buildUiAssetManifest,
  detectWideUiViewport,
  scheduleDeferredHighPriorityImagePreload,
  scheduleDeferredUiAssetPreload,
} from "../../assets/uiAssetManifest.js";
import {
  REGISTERED_SFX_MANIFEST,
  buildSfxManifest,
  loadAmbientTrackList,
  purgeRuntimeMediaCache,
} from "../../audio/audioAssets.js";
import BootLoader from "../BootLoader.jsx";

const CACHE_PURGE_QUERY_PARAM = "purgeCache";
const BOOT_INTRO_GIF_SRC = "/introgobble.gif";
const BOOT_MIN_HOLD_MS = 3500;
const BOOT_TRANSITION_MS = 650;
const BOOT_WARM_SESSION_KEY = "gobble_boot_assets_ready_v2";

function wasBootCompletedThisSession() {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(BOOT_WARM_SESSION_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function markBootCompletedThisSession() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(BOOT_WARM_SESSION_KEY, "1");
  } catch (_) {}
}

async function hasCachedCandidate(candidate) {
  if (!candidate || typeof window === "undefined" || typeof caches === "undefined") {
    return false;
  }
  try {
    const url = new URL(candidate, window.location.origin);
    url.hash = "";
    return !!(await caches.match(url.toString(), { ignoreSearch: true }));
  } catch (_) {
    return false;
  }
}

async function isBootAssetCacheReady(manifest) {
  if (wasBootCompletedThisSession()) return true;
  if (typeof caches === "undefined") return false;
  const criticalImages = (Array.isArray(manifest) ? manifest : []).filter(
    (entry) => entry?.type === "image" && entry?.priority === "critical"
  );
  const candidateGroups = [
    [BOOT_INTRO_GIF_SRC],
    ...criticalImages.map((entry) => entry.candidates || []),
  ];
  const cachedGroups = await Promise.all(
    candidateGroups.map(async (candidates) => {
      for (const candidate of candidates) {
        if (await hasCachedCandidate(candidate)) return true;
      }
      return false;
    })
  );
  return cachedGroups.length > 0 && cachedGroups.every(Boolean);
}

export default function AppBootOverlay({
  onAmbientTracksResolved,
  onOverlayVisibleChange,
  onReady,
}) {
  const [progress, setProgress] = React.useState(() => ({
    loaded: 0,
    total: BOOT_ASSET_MANIFEST_BASE.length,
    errors: 0,
    done: false,
    stage: "",
    key: "",
  }));
  const [assetsReady, setAssetsReady] = React.useState(false);
  const [introRequired, setIntroRequired] = React.useState(null);
  const [visible, setVisible] = React.useState(false);
  const [fadingOut, setFadingOut] = React.useState(false);
  const playedRef = React.useRef(false);
  const introStartedAtRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    let cancelDeferredUiPreload = () => {};
    let cancelDeferredHighPriorityPreload = () => {};

    const run = async () => {
      const params = new URLSearchParams(window.location.search || "");
      const forceCachePurge = params.get(CACHE_PURGE_QUERY_PARAM) === "1";
      const isSamsungRuntime =
        typeof navigator !== "undefined" &&
        /SamsungBrowser/i.test(navigator.userAgent || "");
      if (isSamsungRuntime || forceCachePurge) {
        await purgeRuntimeMediaCache({ force: forceCachePurge });
      }

      const preferWideUi = detectWideUiViewport();
      const coreManifest = dedupeManifest([
        ...BOOT_ASSET_MANIFEST_BASE,
        ...buildUiAssetManifest({ preferWide: preferWideUi }),
        ...buildSfxManifest(REGISTERED_SFX_MANIFEST),
      ]);
      const cacheReady = !forceCachePurge && (await isBootAssetCacheReady(coreManifest));
      if (cancelled) return;
      const shouldPlayIntro = !cacheReady;
      if (shouldPlayIntro) {
        introStartedAtRef.current =
          typeof performance !== "undefined" ? performance.now() : Date.now();
      }
      setIntroRequired(shouldPlayIntro);
      setVisible(shouldPlayIntro);
      onOverlayVisibleChange?.(shouldPlayIntro);

      const resolvedAmbientTracks = await loadAmbientTrackList();
      if (cancelled) return;
      onAmbientTracksResolved?.(resolvedAmbientTracks);

      const manifest = dedupeManifest([
        ...coreManifest,
        ...buildFileManifest(resolvedAmbientTracks || []),
      ]);
      AssetManager.registerManifest(manifest);

      const total = manifest.filter(
        (entry) => entry?.type !== "sfx" && entry?.priority === "critical"
      ).length;
      if (!total) {
        setProgress((previous) => ({
          ...previous,
          total: 0,
          stage: "",
          key: "",
        }));
        setAssetsReady(true);
        return;
      }

      let loaded = 0;
      let errors = 0;
      setProgress((previous) => ({
        ...previous,
        loaded: 0,
        errors: 0,
        total,
        stage: "",
        key: "",
      }));
      await AssetManager.preload({
        priority: "critical",
        excludeTypes: ["sfx"],
        concurrency: 4,
        onProgress: ({ ok, key, stage }) => {
          loaded += 1;
          if (!ok) errors += 1;
          if (cancelled) return;
          setProgress((previous) => ({
            ...previous,
            loaded,
            errors,
            total,
            stage: stage || "critical",
            key: key || "",
          }));
        },
      });

      if (!cancelled) {
        cancelDeferredHighPriorityPreload = scheduleDeferredHighPriorityImagePreload();
        cancelDeferredUiPreload = scheduleDeferredUiAssetPreload({ preferWide: preferWideUi });
        setAssetsReady(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
      cancelDeferredHighPriorityPreload();
      cancelDeferredUiPreload();
    };
  }, []);

  React.useEffect(() => {
    if (!assetsReady || introRequired === null || progress.done) return undefined;
    if (!introRequired) {
      setProgress((previous) => ({ ...previous, done: true }));
      return undefined;
    }
    if (!Number.isFinite(introStartedAtRef.current)) return undefined;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const fadeStartsAfterMs = Math.max(0, BOOT_MIN_HOLD_MS - (now - introStartedAtRef.current));
    const timerId = window.setTimeout(() => {
      setProgress((previous) => ({ ...previous, done: true }));
    }, fadeStartsAfterMs);
    return () => window.clearTimeout(timerId);
  }, [assetsReady, introRequired, progress.done]);

  React.useEffect(() => {
    if (!progress.done || playedRef.current) return undefined;
    onReady?.();
    if (typeof window === "undefined" || !introRequired) {
      playedRef.current = true;
      setVisible(false);
      markBootCompletedThisSession();
      onOverlayVisibleChange?.(false);
      return undefined;
    }
    const rafId = window.requestAnimationFrame(() => setFadingOut(true));
    const timerId = window.setTimeout(() => {
      playedRef.current = true;
      setVisible(false);
      setFadingOut(false);
      markBootCompletedThisSession();
      onOverlayVisibleChange?.(false);
    }, BOOT_TRANSITION_MS);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [introRequired, progress.done, onOverlayVisibleChange, onReady]);

  if (!visible) return null;
  return (
    <BootLoader
      gifSrc={BOOT_INTRO_GIF_SRC}
      progress={progress}
      fadingOut={progress.done && fadingOut}
      fadeDurationMs={BOOT_TRANSITION_MS}
      slowThresholdMs={BOOT_MIN_HOLD_MS}
    />
  );
}
