import React from "react";

import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";

function normalizeSeconds(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function RoundClockSeconds({
  overrideSeconds,
  prefix = "",
  suffix = "",
}) {
  const clock = useFeatureRuntime("clock");
  const remainingSeconds = useFeatureSelector(
    clock,
    (state) => state.remainingSeconds
  );
  const seconds = Number.isFinite(overrideSeconds)
    ? normalizeSeconds(overrideSeconds)
    : normalizeSeconds(remainingSeconds);

  return `${prefix}${seconds}${suffix}`;
}

export function RoundClockProgress({ className = "", maxSeconds, style }) {
  const clock = useFeatureRuntime("clock");
  const remainingSeconds = useFeatureSelector(
    clock,
    (state) => state.remainingSeconds
  );
  const safeMaxSeconds = Math.max(1, Math.round(Number(maxSeconds) || 1));
  const ratio = Math.max(
    0,
    Math.min(1, normalizeSeconds(remainingSeconds) / safeMaxSeconds)
  );

  return (
    <div
      className={className}
      style={{ ...style, transform: `scaleX(${ratio})` }}
    />
  );
}
