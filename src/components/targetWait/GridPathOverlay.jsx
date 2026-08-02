import React from "react";

export default function GridPathOverlay({ path = [], visible = false }) {
  const gradientId = React.useId().replace(/:/g, "");
  const points = React.useMemo(
    () =>
      (Array.isArray(path) ? path : []).map((index) => ({
        x: (Number(index) % 4 + 0.5) * 100,
        y: (Math.floor(Number(index) / 4) + 0.5) * 100,
      })),
    [path]
  );
  if (!visible || points.length < 2) return null;

  const pointList = points.map((point) => `${point.x},${point.y}`).join(" ");
  const end = points[points.length - 1];
  const beforeEnd = points[points.length - 2];
  const angle = (Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x) * 180) / Math.PI;

  return (
    <svg
      viewBox="0 0 400 400"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="42%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <filter id={`${gradientId}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#052e16" floodOpacity="0.72" />
        </filter>
      </defs>
      <polyline
        points={pointList}
        fill="none"
        stroke="rgba(3, 32, 17, 0.82)"
        strokeWidth="23"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={pointList}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${gradientId}-shadow)`}
      />
      <circle
        cx={points[0].x}
        cy={points[0].y}
        r="12"
        fill="#dcfce7"
        stroke="#15803d"
        strokeWidth="5"
      />
      <g transform={`translate(${end.x} ${end.y}) rotate(${angle})`}>
        <polygon
          points="-17,-18 21,0 -17,18 -7,0"
          fill="#16a34a"
          stroke="#dcfce7"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
