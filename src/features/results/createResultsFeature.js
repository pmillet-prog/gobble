import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialResultsState() {
  return {
    analysis: null,
    definitionBlink: false,
    desktopSummaryExpanded: true,
    dismissedTournamentFinaleKey: null,
    guidedStep: null,
    highlightPlayers: [],
    hoveredNick: "",
    mobileOutroFadeActive: false,
    pathPreview: null,
    rankingMode: "round",
    reorderTick: 0,
    roundStartDelayTick: 0,
    wordInfoModal: {
      foundBy: [],
      open: false,
      word: "",
    },
  };
}

function normalizePathPreview(preview) {
  if (!preview) return null;
  const roundMetric = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
  };
  const points = (Array.isArray(preview.points) ? preview.points : [])
    .map((point) =>
      point
        ? {
            x: roundMetric(point.x),
            y: roundMetric(point.y),
          }
        : null
    )
    .filter(Boolean);
  if (!points.length) return null;
  return {
    width: roundMetric(preview.width),
    height: roundMetric(preview.height),
    points,
    endAngleDeg: roundMetric(preview.endAngleDeg),
  };
}

function arePathPreviewsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.width !== right.width ||
    left.height !== right.height ||
    left.endAngleDeg !== right.endAngleDeg
  ) {
    return false;
  }
  const leftPoints = Array.isArray(left.points) ? left.points : [];
  const rightPoints = Array.isArray(right.points) ? right.points : [];
  if (leftPoints.length !== rightPoints.length) return false;
  for (let index = 0; index < leftPoints.length; index += 1) {
    if (
      !leftPoints[index] ||
      !rightPoints[index] ||
      leftPoints[index].x !== rightPoints[index].x ||
      leftPoints[index].y !== rightPoints[index].y
    ) {
      return false;
    }
  }
  return true;
}

export function createResultsFeature(
  context,
  {
    clearTimeoutFn = clearTimeout,
    cancelAnimationFrameFn = globalThis.cancelAnimationFrame?.bind(globalThis),
    HTMLElementCtor = globalThis.HTMLElement,
    requestAnimationFrameFn = globalThis.requestAnimationFrame?.bind(globalThis),
    ResizeObserverCtor = globalThis.ResizeObserver,
    setTimeoutFn = setTimeout,
    wallNow = Date.now,
  } = {}
) {
  let feature = null;
  let fadeTimerId = null;
  let pathPreviewCache = null;
  let pathPreviewObserver = null;
  let pathPreviewRafId = null;
  let pathPreviewRuntime = null;
  let pathPreviewViewportUnsubscribe = null;
  let preparationTimerId = null;

  function clearTiming() {
    if (fadeTimerId != null) clearTimeoutFn(fadeTimerId);
    if (preparationTimerId != null) clearTimeoutFn(preparationTimerId);
    fadeTimerId = null;
    preparationTimerId = null;
  }

  function configureTiming({
    breakKind,
    fadeDurationMs,
    isMobileLayout,
    nextStartAt,
    nowServerMs,
    phase,
    preparationGraceMs,
  }) {
    clearTiming();
    const isResults = phase === "results" && breakKind !== "tournament_end";
    const hasNextStart = Number.isFinite(nextStartAt);
    if (!isResults || !hasNextStart) {
      feature.set("mobileOutroFadeActive", false);
      return;
    }

    const now = Number(nowServerMs?.());
    const safeNow = Number.isFinite(now) ? now : wallNow();
    const preparationDelayMs = Math.max(
      0,
      Number(nextStartAt) + Math.max(0, Number(preparationGraceMs) || 0) + 10 - safeNow
    );
    preparationTimerId = setTimeoutFn(() => {
      preparationTimerId = null;
      feature.set("roundStartDelayTick", wallNow());
    }, preparationDelayMs);

    if (!isMobileLayout) {
      feature.set("mobileOutroFadeActive", false);
      return;
    }
    const safeFadeDurationMs = Math.max(0, Number(fadeDurationMs) || 0);
    const msUntilStart = Math.max(0, Number(nextStartAt) - safeNow);
    if (msUntilStart <= safeFadeDurationMs + 20) {
      feature.set("mobileOutroFadeActive", true);
      return;
    }
    feature.set("mobileOutroFadeActive", false);
    fadeTimerId = setTimeoutFn(() => {
      fadeTimerId = null;
      feature.set("mobileOutroFadeActive", true);
    }, Math.max(0, msUntilStart - safeFadeDurationMs));
  }

  function clearPathPreviewResources() {
    if (pathPreviewRafId != null && typeof cancelAnimationFrameFn === "function") {
      cancelAnimationFrameFn(pathPreviewRafId);
    }
    pathPreviewRafId = null;
    try {
      pathPreviewObserver?.disconnect?.();
    } catch (_) {}
    pathPreviewObserver = null;
    try {
      pathPreviewViewportUnsubscribe?.();
    } catch (_) {}
    pathPreviewViewportUnsubscribe = null;
    pathPreviewRuntime = null;
  }

  function computePathPreview() {
    const runtime = pathPreviewRuntime;
    const gridElement = runtime?.gridElement;
    if (!runtime?.enabled || !gridElement) return null;
    if (typeof HTMLElementCtor === "function" && !(gridElement instanceof HTMLElementCtor)) {
      return null;
    }
    const gridRect = gridElement.getBoundingClientRect?.();
    if (!gridRect || gridRect.width <= 0 || gridRect.height <= 0) return null;
    const tileElements = runtime.tileElements || [];
    const points = (Array.isArray(runtime.path) ? runtime.path : [])
      .map((boardIndex) => {
        const tileElement = tileElements[boardIndex];
        if (!tileElement) return null;
        if (
          typeof HTMLElementCtor === "function" &&
          !(tileElement instanceof HTMLElementCtor)
        ) {
          return null;
        }
        const tileRect = tileElement.getBoundingClientRect?.();
        if (!tileRect || tileRect.width <= 0 || tileRect.height <= 0) return null;
        return {
          x: tileRect.left - gridRect.left + tileRect.width / 2,
          y: tileRect.top - gridRect.top + tileRect.height / 2,
        };
      })
      .filter(Boolean);
    if (!points.length) return null;
    const previousPoint =
      points.length > 1 ? points[points.length - 2] : points[points.length - 1];
    const endPoint = points[points.length - 1];
    return normalizePathPreview({
      width: gridRect.width,
      height: gridRect.height,
      points,
      endAngleDeg:
        points.length > 1
          ? (Math.atan2(
              endPoint.y - previousPoint.y,
              endPoint.x - previousPoint.x
            ) *
              180) /
            Math.PI
          : 0,
    });
  }

  function updatePathPreview() {
    if (!pathPreviewRuntime) return;
    const nextPreview = computePathPreview();
    if (arePathPreviewsEqual(pathPreviewCache, nextPreview)) return;
    pathPreviewCache = nextPreview;
    feature.set("pathPreview", nextPreview);
  }

  function schedulePathPreviewUpdate() {
    if (!pathPreviewRuntime) return;
    if (pathPreviewRafId != null && typeof cancelAnimationFrameFn === "function") {
      cancelAnimationFrameFn(pathPreviewRafId);
    }
    if (typeof requestAnimationFrameFn === "function") {
      pathPreviewRafId = requestAnimationFrameFn(() => {
        pathPreviewRafId = null;
        updatePathPreview();
      });
    } else {
      updatePathPreview();
    }
  }

  function configurePathPreview({
    enabled = false,
    gridElement = null,
    path = [],
    subscribeViewport,
    tileElements = [],
  } = {}) {
    clearPathPreviewResources();
    if (!enabled || !gridElement) {
      pathPreviewCache = null;
      feature.set("pathPreview", null);
      return;
    }
    pathPreviewRuntime = {
      enabled: true,
      gridElement,
      path: Array.isArray(path) ? path : [],
      tileElements,
    };
    schedulePathPreviewUpdate();
    let lastObservedWidth = -1;
    let lastObservedHeight = -1;
    if (typeof ResizeObserverCtor === "function") {
      try {
        pathPreviewObserver = new ResizeObserverCtor((entries) => {
          const entry = entries[0];
          const nextWidth = Math.round(
            entry?.contentRect?.width || gridElement.clientWidth || 0
          );
          const nextHeight = Math.round(
            entry?.contentRect?.height || gridElement.clientHeight || 0
          );
          if (nextWidth === lastObservedWidth && nextHeight === lastObservedHeight) return;
          lastObservedWidth = nextWidth;
          lastObservedHeight = nextHeight;
          schedulePathPreviewUpdate();
        });
        pathPreviewObserver.observe(gridElement);
      } catch (_) {
        pathPreviewObserver = null;
      }
    }
    if (typeof subscribeViewport === "function") {
      pathPreviewViewportUnsubscribe = subscribeViewport(schedulePathPreviewUpdate);
    }
  }

  feature = createStateFeature(context, createInitialResultsState, {
    start: ({ scope, store }) => {
      scope.add(() => {
        clearTiming();
        clearPathPreviewResources();
        pathPreviewCache = null;
        store.patch(createInitialResultsState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    clearTiming,
    configurePathPreview,
    configureTiming,
  });
}
