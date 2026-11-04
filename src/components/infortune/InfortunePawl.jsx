import React from "react";
import { pawlPath, WHEEL_GEOMETRY } from "../../features/infortune/wheelGeometry.js";

export default React.memo(function InfortunePawl({ pawl, id }) {
  const pathId = `${id}-flexible-pawl`;
  return <g transform={`translate(${WHEEL_GEOMETRY.pivotX} ${WHEEL_GEOMETRY.pivotY})`} pointerEvents="none">
    <defs><path id={pathId} ref={pawl} d={pawlPath(0)} /></defs>
    <use href={`#${pathId}`} fill="none" stroke="#030810" strokeWidth={WHEEL_GEOMETRY.pawlRadius * 2 + 0.5}
      strokeLinecap="round" opacity="0.4" transform="translate(1.5 1.5)" />
    <use href={`#${pathId}`} fill="none" stroke={`url(#${id}-pointer)`} strokeWidth={WHEEL_GEOMETRY.pawlRadius * 2} strokeLinecap="round" />
    <use href={`#${pathId}`} fill="none" stroke="#fff0b3" strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
    <path d="M -12 -3 Q 0 -12 12 -3 L 5 14 Q 0 17 -5 14 Z" fill={`url(#${id}-pointer)`} />
    <circle r="8" fill="#182334" stroke="#e6c181" strokeWidth="3" />
    <circle r="2.6" fill="#f8dc9e" />
  </g>;
});
