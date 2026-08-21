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
const BOOT_MIN_HOLD_MS = 250;
const BOOT_SLOW_THRESHOLD_MS = 3500;
const BOOT_TRANSITION_MS = 650;

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
  const [visible, setVisible] = React.useState(true);
  const [fadingOut, setFadingOut] = React.useState(false);
  const playedRef = React.useRef(false);

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

      const resolvedAmbientTracks = await loadAmbientTrackList();
      if (cancelled) return;
      onAmbientTracksResolved?.(resolvedAmbientTracks);

      const preferWideUi = detectWideUiViewport();
      const manifest = dedupeManifest([
        ...BOOT_ASSET_MANIFEST_BASE,
        ...buildUiAssetManifest({ preferWide: preferWideUi }),
        ...buildSfxManifest(REGISTERED_SFX_MANIFEST),
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
          done: true,
          stage: "",
          key: "",
        }));
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
      const startedAt = performance.now();
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
      }
      const elapsed = performance.now() - startedAt;
      window.setTimeout(() => {
        if (cancelled) return;
        setProgress((previous) => ({
          ...previous,
          loaded,
          errors,
          total,
          done: true,
        }));
      }, Math.max(0, BOOT_MIN_HOLD_MS - elapsed));
    };

    void run();
    return () => {
      cancelled = true;
      cancelDeferredHighPriorityPreload();
      cancelDeferredUiPreload();
    };
  }, []);

  React.useEffect(() => {
    if (!progress.done || playedRef.current) return undefined;
    onReady?.();
    if (typeof window === "undefined") {
      playedRef.current = true;
      setVisible(false);
      onOverlayVisibleChange?.(false);
      return undefined;
    }
    const rafId = window.requestAnimationFrame(() => setFadingOut(true));
    const timerId = window.setTimeout(() => {
      playedRef.current = true;
      setVisible(false);
      setFadingOut(false);
      onOverlayVisibleChange?.(false);
    }, BOOT_TRANSITION_MS);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [progress.done, onOverlayVisibleChange, onReady]);

  if (!visible) return null;
  return (
    <BootLoader
      progress={progress}
      fadingOut={progress.done && fadingOut}
      fadeDurationMs={BOOT_TRANSITION_MS}
      slowThresholdMs={BOOT_SLOW_THRESHOLD_MS}
    />
  );
}
