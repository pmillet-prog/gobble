import React from "react";

const FAKE_TWINS_BONUS = 20;

function WordPointsLabel({
  pts = null,
  mode = "best",
  usedFakeTwins = false,
  darkMode = false,
  className = "",
}) {
  if (!Number.isFinite(pts)) return null;

  const safePts = Number(pts);
  const accentClass = darkMode ? "text-blue-300" : "text-blue-600";
  const bonusPts = usedFakeTwins ? FAKE_TWINS_BONUS : 0;
  const basePts = Math.max(0, safePts - bonusPts);

  let prefix = "";
  let suffix = "";
  if (mode === "found") {
    prefix = "+";
  } else if (mode === "opt") {
    prefix = "(opt: ";
    suffix = ")";
  } else {
    prefix = "(";
    suffix = ")";
  }

  if (!usedFakeTwins) {
    return (
      <span className={className}>
        {prefix}
        {safePts} pts
        {suffix}
      </span>
    );
  }

  return (
    <span className={className}>
      {prefix}
      {basePts} pts et{" "}
      <span className={accentClass}>+{FAKE_TWINS_BONUS} pts</span>
      {suffix}
    </span>
  );
}

export default React.memo(WordPointsLabel);
