import React from "react";

export const TIME_WHEEL_ROLL_DURATION_MS = 2000;
export const TIME_WHEEL_MULTI_ROLL_DURATION_MS = 1000;

export function clampTimeWheelValue(options, value) {
  if (!Array.isArray(options) || !options.length) return 0;
  const safeValue = Number(value);
  if (options.includes(safeValue)) return safeValue;
  return options.reduce((best, item) =>
    Math.abs(item - safeValue) < Math.abs(best - safeValue) ? item : best
  );
}

export function shiftTimeWheelValue(options, value, delta) {
  if (!Array.isArray(options) || !options.length) return 0;
  const current = clampTimeWheelValue(options, value);
  const index = options.indexOf(current);
  const nextIndex = Math.min(options.length - 1, Math.max(0, index + delta));
  return options[nextIndex];
}

export function getTimeWheelIndex(options, value) {
  if (!Array.isArray(options) || !options.length) return -1;
  return options.indexOf(clampTimeWheelValue(options, value));
}

export function buildTimeWheelRollSegments(
  steps,
  totalMs = TIME_WHEEL_ROLL_DURATION_MS
) {
  const safeSteps = Math.max(0, Math.round(Number(steps) || 0));
  if (safeSteps <= 0) return [];
  if (safeSteps <= 3) {
    const durationMs = Math.max(140, Math.round(totalMs / safeSteps));
    return Array.from({ length: safeSteps }, (_, index) => ({
      delayMs: index * durationMs,
      durationMs,
    }));
  }

  const center = (safeSteps - 1) / 2;
  const weights = Array.from({ length: safeSteps }, (_, index) => {
    const edgeFactor = center > 0 ? Math.abs(index - center) / center : 0;
    return 0.65 + edgeFactor * 0.85;
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
  let elapsed = 0;
  return weights.map((weight, index) => {
    const remainingSteps = safeSteps - index;
    const remainingMs = Math.max(0, totalMs - elapsed);
    const rawDuration = Math.round((totalMs * weight) / weightTotal);
    const durationMs =
      index === safeSteps - 1
        ? remainingMs
        : Math.max(120, Math.min(rawDuration, remainingMs - (remainingSteps - 1) * 120));
    const segment = { delayMs: elapsed, durationMs };
    elapsed += durationMs;
    return segment;
  });
}

export default function AnimatedTimeWheel({
  animation,
  containerClassName = "border-amber-300/40 bg-slate-950/25",
  controlClassName = "border-amber-300/25 bg-white/5",
  label,
  options,
  reelClassName = "border-amber-300/25 bg-black/20",
  selectionClassName = "border-amber-300/30 bg-amber-200/15",
  value,
  formatValue = (item) => String(item),
  onShift,
}) {
  const current = clampTimeWheelValue(options, value);
  const index = options.indexOf(current);
  const previous = index > 0 ? options[index - 1] : null;
  const next = index >= 0 && index < options.length - 1 ? options[index + 1] : null;
  const rollClass =
    animation?.direction > 0
      ? "playtime-roll-reel playtime-roll-up"
      : animation?.direction < 0
        ? "playtime-roll-reel playtime-roll-down"
        : "playtime-roll-reel";
  const rollDurationMs = Math.max(
    120,
    Math.round(Number(animation?.durationMs) || TIME_WHEEL_ROLL_DURATION_MS)
  );
  const handleWheelPointerDown = (event) => {
    if (event.pointerType === "mouse") return;
    const target = event.currentTarget;
    target.dataset.timeWheelStartX = String(event.clientX);
    target.dataset.timeWheelStartY = String(event.clientY);
    target.dataset.timeWheelSwiped = "";
    target.setPointerCapture?.(event.pointerId);
  };
  const handleWheelPointerMove = (event) => {
    if (event.pointerType === "mouse") return;
    const target = event.currentTarget;
    const startY = Number(target.dataset.timeWheelStartY);
    if (!Number.isFinite(startY)) return;
    if (Math.abs(event.clientY - startY) > 8) event.preventDefault();
  };
  const handleWheelPointerUp = (event) => {
    if (event.pointerType === "mouse") return;
    const target = event.currentTarget;
    const startX = Number(target.dataset.timeWheelStartX);
    const startY = Number(target.dataset.timeWheelStartY);
    delete target.dataset.timeWheelStartX;
    delete target.dataset.timeWheelStartY;
    target.releasePointerCapture?.(event.pointerId);
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dy) < 28 || Math.abs(dy) < Math.abs(dx) * 1.15) return;
    target.dataset.timeWheelSwiped = "1";
    onShift?.(dy < 0 ? 1 : -1);
  };
  const clearWheelPointerState = (event) => {
    const target = event.currentTarget;
    delete target.dataset.timeWheelStartX;
    delete target.dataset.timeWheelStartY;
    target.releasePointerCapture?.(event.pointerId);
  };
  const preventSyntheticClickAfterSwipe = (event) => {
    if (event.currentTarget.dataset.timeWheelSwiped !== "1") return;
    delete event.currentTarget.dataset.timeWheelSwiped;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={`min-w-0 rounded-2xl border px-2 py-2 text-center shadow-inner ${containerClassName}`}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </div>
      <button
        type="button"
        disabled={previous === null}
        onClick={() => onShift?.(-1)}
        className={`mt-1 inline-flex h-7 w-full items-center justify-center rounded-xl border disabled:opacity-25 ${controlClassName}`}
        aria-label={`Réduire ${label}`}
      >
        <span className="material-symbols-outlined text-[20px] leading-none">
          keyboard_arrow_up
        </span>
      </button>
      <div
        className={`relative mt-1 h-24 overflow-hidden rounded-xl border ${reelClassName}`}
        style={{ touchAction: "none" }}
        onPointerDown={handleWheelPointerDown}
        onPointerMove={handleWheelPointerMove}
        onPointerUp={handleWheelPointerUp}
        onPointerCancel={clearWheelPointerState}
        onClickCapture={preventSyntheticClickAfterSwipe}
      >
        <div className="pointer-events-none absolute inset-0 z-[1] grid h-full grid-rows-[1fr_1.45fr_1fr]">
          <div />
          <div className={`border-y ${selectionClassName}`} />
          <div />
        </div>
        <div
          key={`${label}-${animation?.token || 0}`}
          className={`relative z-[2] grid h-full grid-rows-[1fr_1.45fr_1fr] ${rollClass}`}
          style={{
            "--playtime-roll-duration": `${rollDurationMs}ms`,
            animationDuration: `${rollDurationMs}ms`,
          }}
        >
          <button
            type="button"
            disabled={previous === null}
            onClick={() => onShift?.(-1)}
            className="flex items-center justify-center text-sm font-bold opacity-45 disabled:opacity-20"
          >
            {previous === null ? "--" : formatValue(previous)}
          </button>
          <div className="flex items-center justify-center text-3xl font-black tabular-nums">
            {formatValue(current)}
          </div>
          <button
            type="button"
            disabled={next === null}
            onClick={() => onShift?.(1)}
            className="flex items-center justify-center text-sm font-bold opacity-45 disabled:opacity-20"
          >
            {next === null ? "--" : formatValue(next)}
          </button>
        </div>
      </div>
      <button
        type="button"
        disabled={next === null}
        onClick={() => onShift?.(1)}
        className={`mt-1 inline-flex h-7 w-full items-center justify-center rounded-xl border disabled:opacity-25 ${controlClassName}`}
        aria-label={`Augmenter ${label}`}
      >
        <span className="material-symbols-outlined text-[20px] leading-none">
          keyboard_arrow_down
        </span>
      </button>
    </div>
  );
}
