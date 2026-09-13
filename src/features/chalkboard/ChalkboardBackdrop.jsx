import React from "react";
import useChalkboardTexture from "./useChalkboardTexture.js";

// Broad overlapping photographs, all upright. Different crops and spacing avoid
// the mirrored wipe marks of the old tiles. The image is decoded only once;
// this static layer never participates in the chalk renderer's animation loop.
const PANELS = [
  [0, 4400, 20],
  [3400, 4700, 85],
  [7100, 4100, 5],
  [10200, 4800, 65],
  [14000, 4400, 35],
  [17400, 4500, 100],
  [20900, 4200, 50],
];

export default React.memo(function ChalkboardBackdrop() {
  const texture = useChalkboardTexture();
  return <div className="chalkboard-surface" aria-hidden="true">
    {PANELS.map(([left, width, vertical]) => <div key={left} className="chalkboard-surface-panel" style={{
      left: `${left / 240}%`,
      width: `${width / 240}%`,
      backgroundPosition: `center ${vertical}%`,
      backgroundImage: texture ? `url("${texture}")` : "none",
    }} />)}
  </div>;
});
