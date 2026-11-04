import React from "react";
import "./infortuneGoldSector.css";

const polar = (radius, angle) => `${Math.sin(angle) * radius} ${-Math.cos(angle) * radius}`;
function sectorPath(halfAngle, inner, outer) {
  return `M ${polar(inner, -halfAngle)} L ${polar(outer, -halfAngle)} A ${outer} ${outer} 0 0 1 ${polar(outer, halfAngle)} L ${polar(inner, halfAngle)} A ${inner} ${inner} 0 0 0 ${polar(inner, -halfAngle)} Z`;
}

// A fixed foil texture and CSS highlights: no particle loop, timer or React
// updates. Everything stays attached to its sector while the wheel rotates.
export default React.memo(function InfortuneGoldSector({ id, sectorAngle }) {
  const half = sectorAngle / 2;
  const shape = sectorPath(half, 72, 250);
  return <g className="infortune-gold" pointerEvents="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-foil`} gradientUnits="userSpaceOnUse" x1="-30" y1="-235" x2="30" y2="-100">
        <stop stopColor="#8d4708" />
        <stop offset="0.12" stopColor="#e7a51f" />
        <stop offset="0.27" stopColor="#fff5ad" />
        <stop offset="0.38" stopColor="#eab62e" />
        <stop offset="0.5" stopColor="#bc750d" />
        <stop offset="0.65" stopColor="#ffdf68" />
        <stop offset="0.8" stopColor="#fff2a1" />
        <stop offset="1" stopColor="#c58112" />
      </linearGradient>
      <linearGradient id={`${id}-shine`}>
        <stop stopColor="#fff9d5" stopOpacity="0" />
        <stop offset="0.42" stopColor="#fff6bd" stopOpacity="0.35" />
        <stop offset="0.5" stopColor="#fffdf1" stopOpacity="0.95" />
        <stop offset="0.58" stopColor="#fff6bd" stopOpacity="0.35" />
        <stop offset="1" stopColor="#fff9d5" stopOpacity="0" />
      </linearGradient>
      <clipPath id={`${id}-clip`}><path d={shape} /></clipPath>
    </defs>
    <path d={shape} fill={`url(#${id}-foil)`} stroke="#ffe892" strokeWidth="2" />
    <g clipPath={`url(#${id}-clip)`}>
      {Array.from({ length: 54 }, (_, i) => {
        const radius = 81 + (i * 47 % 163);
        const angle = ((i * 37 % 101) / 100 - 0.5) * sectorAngle * 0.9;
        return <circle key={i} cx={Math.sin(angle) * radius} cy={-Math.cos(angle) * radius}
          r={i % 4 === 0 ? 1.15 : 0.65} fill={i % 3 ? "#fff9c9" : "#9e5a09"} opacity={i % 3 ? 0.8 : 0.35} />;
      })}
      <path className="infortune-gold__shine" d="M -48 -270 H -18 L 46 -60 H 16 Z" fill={`url(#${id}-shine)`} />
    </g>
    <path d={sectorPath(half - 0.012, 79, 244)} fill="none" stroke="#fff1a7" strokeWidth="1" opacity="0.9" />
    {[[-23, -231, 4.5], [20, -207, 4], [-15, -168, 3.4], [11, -126, 3], [8, -242, 3.5]].map(([x, y, size], i) =>
      <g key={i} transform={`translate(${x} ${y})`}>
        <path className="infortune-gold__sparkle" style={{ animationDelay: `${-i * 0.73}s`, animationDuration: `${3.1 + i * 0.23}s` }}
          d={`M 0 ${-size} Q 0 0 ${size} 0 Q 0 0 0 ${size} Q 0 0 ${-size} 0 Q 0 0 0 ${-size} Z`}
          fill="#fffef0" stroke="#fff9c4" strokeWidth="0.65" />
      </g>)}
  </g>;
});
