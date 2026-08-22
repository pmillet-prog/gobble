import React from "react";

import { formatNumber } from "../../utils/numbers.js";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

const SCORE_FIELD = Object.freeze(["score"]);
const ACCEPTED_COUNT_FIELD = Object.freeze(["acceptedCount"]);
const FOUND_WORDS_COUNT_FIELD = Object.freeze(["foundWordsCount"]);
const INPUT_SHAKE_FIELD = Object.freeze(["inputShake"]);
const PREVIEW_FIELDS = Object.freeze(["foundWordsCount", "score"]);
const STATUS_FIELD = Object.freeze(["statusText"]);

export function useGameProgressFields(fields) {
  const progress = useFeatureRuntime("progress");
  return useFeatureFields(progress, fields);
}

export function GameScoreValue({ format = false }) {
  const { score } = useGameProgressFields(SCORE_FIELD);
  return format ? formatNumber(score) ?? "0" : score;
}

export function AcceptedWordsCount() {
  const { acceptedCount } = useGameProgressFields(ACCEPTED_COUNT_FIELD);
  return acceptedCount;
}

export function FoundWordsCount() {
  const { foundWordsCount } = useGameProgressFields(FOUND_WORDS_COUNT_FIELD);
  return foundWordsCount;
}

export function LivePreviewProgressStats({ totalScoreLabel = "?", totalWordsLabel = "?" }) {
  const { foundWordsCount, score } = useGameProgressFields(PREVIEW_FIELDS);
  return (
    <>
      <div>{`mots : ${formatNumber(foundWordsCount) ?? "0"} / ${totalWordsLabel}`}</div>
      <div>{`score : ${formatNumber(score) ?? "0"} / ${totalScoreLabel}`}</div>
    </>
  );
}

export function useGameStatusText() {
  const { statusText } = useGameProgressFields(STATUS_FIELD);
  return statusText;
}

export function useGameInputShake() {
  const { inputShake } = useGameProgressFields(INPUT_SHAKE_FIELD);
  return inputShake;
}

export function InputShakeBoundary({ children, className = "", ...props }) {
  const inputShake = useGameInputShake();
  return (
    <div {...props} className={`${className}${inputShake ? " shake" : ""}`}>
      {children}
    </div>
  );
}
