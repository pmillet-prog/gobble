export const DESKTOP_UI_SCALE_MIN = 0.52;
export const DESKTOP_UI_SCALE_MAX = 1;

const DESKTOP_LAYOUT_BASELINE_WIDTH = 1440;
const DAILY_LAYOUT_BASELINE_WIDTH = 1100;
const DESKTOP_LAYOUT_BASELINE_HEIGHT = 700;
const DESKTOP_LAYOUT_BASELINE_GAP = 24;

function positiveNumberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function shouldUseMobileLayout({
  coarsePointer = false,
  finePointer = false,
  mobileMaxWidth = 520,
  touchCapable = false,
  touchMaxMinDimension = 820,
  viewportHeight,
  viewportWidth,
} = {}) {
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!(width > 0) || !(height > 0)) return false;

  const minDimension = Math.min(width, height);
  const isNarrow = width <= Math.max(1, Number(mobileMaxWidth) || 520);
  const isCompactTouchViewport =
    (coarsePointer || touchCapable) &&
    minDimension <= Math.max(1, Number(touchMaxMinDimension) || 820);

  // Certains téléphones exposent aussi un pointeur précis (stylet, souris ou
  // détection hybride). Le pointeur principal tactile doit rester prioritaire.
  if (coarsePointer) return isNarrow || isCompactTouchViewport;

  // Le zoom navigateur réduit les pixels CSS du viewport. Sur un ordinateur,
  // un pointeur précis reste le signal stable qui évite de basculer toute
  // l'application vers l'UI mobile pendant un zoom.
  if (finePointer) return false;

  return isNarrow || isCompactTouchViewport;
}

export function computeDesktopViewportHeight({
  bottomInset = 16,
  hostTop = 0,
  viewportHeight,
} = {}) {
  const height = Number(viewportHeight);
  if (!(height > 0)) return 0;

  return Math.max(
    1,
    Math.round(
      height -
        Math.max(0, Number(hostTop) || 0) -
        Math.max(0, Number(bottomInset) || 0)
    )
  );
}

export function computeDesktopUiScale({
  hostWidth,
  columnHeight,
  isDailyPlay = false,
} = {}) {
  const baselineWidth = isDailyPlay
    ? DAILY_LAYOUT_BASELINE_WIDTH
    : DESKTOP_LAYOUT_BASELINE_WIDTH;
  const widthScale = positiveNumberOrFallback(hostWidth, baselineWidth) / baselineWidth;
  const heightScale =
    positiveNumberOrFallback(columnHeight, DESKTOP_LAYOUT_BASELINE_HEIGHT) /
    DESKTOP_LAYOUT_BASELINE_HEIGHT;

  return Math.min(
    DESKTOP_UI_SCALE_MAX,
    Math.max(DESKTOP_UI_SCALE_MIN, Math.min(widthScale, heightScale))
  );
}

export function computeDesktopGridChrome(uiScale) {
  const scale = Math.min(
    DESKTOP_UI_SCALE_MAX,
    Math.max(DESKTOP_UI_SCALE_MIN, Number(uiScale) || DESKTOP_UI_SCALE_MAX)
  );
  const previewBarHeight = Math.max(32, Math.round(56 * scale));
  const validationPadding = Math.max(5, Math.round(16 * scale));

  return {
    columnGap: 12 * scale,
    columnPadding: 16 * scale,
    countdownBarHeight: Math.max(30, Math.round(76 * scale)),
    previewBarHeight,
    validationBarHeight: previewBarHeight + validationPadding * 2 + 8,
    validationPadding,
  };
}

function normalizedPositiveFractions(values, fallbackValues) {
  const source = Array.isArray(values) && values.length ? values : fallbackValues;
  const positive = (Array.isArray(source) ? source : []).map((value) =>
    Math.max(0.0001, Number(value) || 0.0001)
  );
  const sum = positive.reduce((total, value) => total + value, 0);
  return sum > 0 ? positive.map((value) => value / sum) : [];
}

export function computeDesktopColumnUiScales({
  columnDefs = [],
  columnFractions = [],
  columnOrder = [],
  gapPx = DESKTOP_LAYOUT_BASELINE_GAP,
  globalScale = DESKTOP_UI_SCALE_MAX,
  hostWidth,
  isDailyPlay = false,
} = {}) {
  const safeGlobalScale = Math.min(
    DESKTOP_UI_SCALE_MAX,
    Math.max(DESKTOP_UI_SCALE_MIN, Number(globalScale) || DESKTOP_UI_SCALE_MAX)
  );
  const safeOrder = Array.isArray(columnOrder) ? columnOrder : [];
  const defsById = new Map(
    (Array.isArray(columnDefs) ? columnDefs : []).map((definition) => [
      definition?.id,
      definition,
    ])
  );
  const defaultFractions = safeOrder.map(
    (id) => Number(defsById.get(id)?.defaultFraction) || 1
  );
  const actualFractions = normalizedPositiveFractions(columnFractions, defaultFractions);
  const referenceFractions = normalizedPositiveFractions(defaultFractions, defaultFractions);
  const baselineWidth = isDailyPlay
    ? DAILY_LAYOUT_BASELINE_WIDTH
    : DESKTOP_LAYOUT_BASELINE_WIDTH;
  const safeHostWidth = positiveNumberOrFallback(hostWidth, baselineWidth);
  const columnCount = safeOrder.length;
  const actualGap = Math.max(0, Number(gapPx) || 0);
  const actualContentWidth = Math.max(1, safeHostWidth - actualGap * Math.max(0, columnCount - 1));
  const referenceContentWidth = Math.max(
    1,
    baselineWidth - DESKTOP_LAYOUT_BASELINE_GAP * Math.max(0, columnCount - 1)
  );

  return Object.fromEntries(
    safeOrder.map((id, index) => {
      const actualWidth = (actualFractions[index] || 0) * actualContentWidth;
      const referenceWidth = (referenceFractions[index] || 0) * referenceContentWidth;
      const localScale = referenceWidth > 0 ? actualWidth / referenceWidth : safeGlobalScale;
      return [
        id,
        Math.min(
          safeGlobalScale,
          Math.max(DESKTOP_UI_SCALE_MIN, localScale)
        ),
      ];
    })
  );
}

export function computeDesktopGridFillMinHeight({
  columnFractions = [],
  columnOrder = [],
  gapPx = DESKTOP_LAYOUT_BASELINE_GAP,
  gridChrome = {},
  hostWidth,
  maxGridWidth = 980,
  maxTrackWidth = Number.POSITIVE_INFINITY,
  stageInset = 12,
} = {}) {
  const safeHostWidth = Number(hostWidth);
  const safeOrder = Array.isArray(columnOrder) ? columnOrder : [];
  const gridIndex = safeOrder.indexOf("grid");
  if (!(safeHostWidth > 0) || gridIndex < 0) return 0;

  const fractions = normalizedPositiveFractions(columnFractions, []);
  if (!fractions.length || !fractions[gridIndex]) return 0;

  const safeGap = Math.max(0, Number(gapPx) || 0);
  const contentWidth = Math.max(
    1,
    safeHostWidth - safeGap * Math.max(0, safeOrder.length - 1)
  );
  const rawGridTrackWidth = fractions[gridIndex] * contentWidth;
  const gridTrackWidth = Number.isFinite(Number(maxTrackWidth))
    ? Math.min(rawGridTrackWidth, Math.max(1, Number(maxTrackWidth) || 1))
    : rawGridTrackWidth;
  const columnPadding = Math.max(0, Number(gridChrome.columnPadding) || 0);
  const stageWidth = Math.max(1, gridTrackWidth - columnPadding);
  const requiredStageSide = Math.min(
    stageWidth,
    Math.max(1, Number(maxGridWidth) || 980) + Math.max(0, Number(stageInset) || 0)
  );

  return Math.ceil(
    requiredStageSide +
      Math.max(0, Number(gridChrome.countdownBarHeight) || 0) +
      Math.max(0, Number(gridChrome.validationBarHeight) || 0) +
      columnPadding +
      Math.max(0, Number(gridChrome.columnGap) || 0) * 2
  );
}

export function computeDesktopColumnTrackWidth({
  columnFractions = [],
  columnId,
  columnOrder = [],
  gapPx = DESKTOP_LAYOUT_BASELINE_GAP,
  hostWidth,
} = {}) {
  const safeHostWidth = Number(hostWidth);
  const safeOrder = Array.isArray(columnOrder) ? columnOrder : [];
  const columnIndex = safeOrder.indexOf(columnId);
  if (!(safeHostWidth > 0) || columnIndex < 0) return 0;

  const fractions = normalizedPositiveFractions(columnFractions, []);
  if (!fractions.length || !fractions[columnIndex]) return 0;
  const safeGap = Math.max(0, Number(gapPx) || 0);
  const contentWidth = Math.max(
    1,
    safeHostWidth - safeGap * Math.max(0, safeOrder.length - 1)
  );
  return fractions[columnIndex] * contentWidth;
}

export function computeDesktopGridResizeMaxTrackWidth({
  columnHeight,
  gridChrome = {},
  maxGridWidth = 980,
  stageInset = 12,
} = {}) {
  const safeColumnHeight = Number(columnHeight);
  if (!(safeColumnHeight > 0)) return Number.POSITIVE_INFINITY;

  const columnPadding = Math.max(0, Number(gridChrome.columnPadding) || 0);
  const inset = Math.max(0, Number(stageInset) || 0);
  const fixedChromeHeight =
    Math.max(0, Number(gridChrome.countdownBarHeight) || 0) +
    Math.max(0, Number(gridChrome.validationBarHeight) || 0) +
    columnPadding +
    Math.max(0, Number(gridChrome.columnGap) || 0) * 2;
  const availableStageHeight = Math.max(1, safeColumnHeight - fixedChromeHeight);
  const maxTrackFromHeight = availableStageHeight + inset + columnPadding;
  const maxTrackFromGridLimit =
    Math.max(1, Number(maxGridWidth) || 980) + inset + columnPadding;

  return Math.max(1, Math.min(maxTrackFromHeight, maxTrackFromGridLimit));
}

export function clampDesktopColumnResizeDelta({
  delta,
  leftMax = Number.POSITIVE_INFINITY,
  leftMin = 0,
  leftStart,
  rightMax = Number.POSITIVE_INFINITY,
  rightMin = 0,
  rightStart,
} = {}) {
  const safeLeftStart = Math.max(0, Number(leftStart) || 0);
  const safeRightStart = Math.max(0, Number(rightStart) || 0);
  const minimumDelta = Math.max(
    Math.max(0, Number(leftMin) || 0) - safeLeftStart,
    Number.isFinite(Number(rightMax))
      ? safeRightStart - Math.max(0, Number(rightMax) || 0)
      : Number.NEGATIVE_INFINITY
  );
  const maximumDelta = Math.min(
    safeRightStart - Math.max(0, Number(rightMin) || 0),
    Number.isFinite(Number(leftMax))
      ? Math.max(0, Number(leftMax) || 0) - safeLeftStart
      : Number.POSITIVE_INFINITY
  );

  return Math.min(
    Math.max(Number(delta) || 0, minimumDelta),
    Math.max(minimumDelta, maximumDelta)
  );
}
