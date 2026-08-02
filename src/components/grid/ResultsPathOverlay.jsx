import React from "react";

function ResultsPathOverlay({ darkMode = false, gradientId = "results-path", mobile = false, preview = null }) {
  const points = Array.isArray(preview?.points) ? preview.points : [];
  if (!points.length || !Number.isFinite(preview?.width) || !Number.isFinite(preview?.height)) {
    return null;
  }

  const firstPoint = points[0] || { x: 0, y: 0 };
  const lastPoint = points[points.length - 1] || firstPoint;
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20"
      viewBox={`0 0 ${preview.width} ${preview.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={firstPoint.x || 0}
          y1={firstPoint.y || 0}
          x2={lastPoint.x || 0}
          y2={lastPoint.y || 0}
        >
          <stop
            offset="0%"
            stopColor={!mobile ? "rgba(22, 101, 52, 0.92)" : darkMode ? "#34d399" : "#2563eb"}
          />
          <stop
            offset="100%"
            stopColor={!mobile ? "rgba(110, 231, 183, 0.34)" : darkMode ? "#f59e0b" : "#ef4444"}
          />
        </linearGradient>
      </defs>
      {points.length > 1 ? (
        <>
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={!mobile ? "rgba(2, 44, 34, 0.14)" : darkMode ? "rgba(15,23,42,0.58)" : "rgba(15,23,42,0.22)"}
            strokeWidth={!mobile ? "22" : "8"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={!mobile ? "14" : "4.5"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      <circle
        cx={firstPoint.x || 0}
        cy={firstPoint.y || 0}
        r={!mobile ? "11.5" : "6"}
        fill={!mobile ? "rgba(22, 163, 74, 0.5)" : darkMode ? "#22d3ee" : "#1d4ed8"}
        stroke={!mobile ? "rgba(167, 243, 208, 0.88)" : darkMode ? "#082f49" : "#bfdbfe"}
        strokeWidth={!mobile ? "3.5" : "2"}
      />
      {points.length > 1 ? (
        <g transform={`translate(${lastPoint.x || 0} ${lastPoint.y || 0}) rotate(${preview.endAngleDeg || 0})`}>
          <polygon
            points={!mobile ? "-22,-13 0,0 -22,13 -13,0" : "-12,-7 0,0 -12,7 -8,0"}
            fill={!mobile ? "rgba(16, 185, 129, 0.52)" : darkMode ? "#f59e0b" : "#dc2626"}
            stroke={!mobile ? "rgba(167, 243, 208, 0.88)" : darkMode ? "#451a03" : "#fee2e2"}
            strokeWidth={!mobile ? "2.4" : "1.5"}
          />
        </g>
      ) : null}
    </svg>
  );
}

export default React.memo(ResultsPathOverlay);
