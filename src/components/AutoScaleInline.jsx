import React from "react";

export default function AutoScaleInline({
  className = "",
  minScale = 0.62,
  align = "center",
  measurePaddingPx = 0,
  reserveScaledWidth = false,
  children,
}) {
  const viewportRef = React.useRef(null);
  const lineRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  const [lineWidth, setLineWidth] = React.useState(0);

  React.useEffect(() => {
    const viewportEl = viewportRef.current;
    const lineEl = lineRef.current;
    if (!viewportEl || !lineEl) return undefined;
    let rafId = null;

    const recomputeScale = () => {
      const viewportWidth = viewportEl.clientWidth || 0;
      const lineWidth = lineEl.scrollWidth || 0;
      setLineWidth((prev) => (Math.abs(prev - lineWidth) > 0.5 ? lineWidth : prev));
      if (viewportWidth <= 0 || lineWidth <= 0) {
        setScale(1);
        return;
      }
      const safeMeasurePadding = Math.max(0, Number(measurePaddingPx) || 0);
      const effectiveViewportWidth = Math.max(0, viewportWidth - safeMeasurePadding * 2);
      const ratio = effectiveViewportWidth / lineWidth;
      const nextScale = Number.isFinite(ratio)
        ? Math.max(Math.min(1, ratio), Math.max(0.25, Number(minScale) || 0.62))
        : 1;
      setScale((prev) => (Math.abs(prev - nextScale) > 0.01 ? nextScale : prev));
    };
    const scheduleRecompute = () => {
      if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        recomputeScale();
        return;
      }
      if (rafId != null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        recomputeScale();
      });
    };

    scheduleRecompute();

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleRecompute);
      observer.observe(viewportEl);
      if (reserveScaledWidth) observer.observe(lineEl);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", scheduleRecompute);
    }

    return () => {
      if (observer) observer.disconnect();
      if (rafId != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", scheduleRecompute);
      }
    };
  }, [children, measurePaddingPx, minScale, reserveScaledWidth]);

  const justifyClass = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";
  const transformOrigin =
    align === "left" ? "left top" : align === "right" ? "right top" : "center top";
  const safeMeasurePadding = Math.max(0, Number(measurePaddingPx) || 0);
  const scaledLineWidth = lineWidth > 0 ? Math.ceil(lineWidth * scale) : null;
  const viewportStyle =
    safeMeasurePadding
      ? {
          boxSizing: "border-box",
          paddingLeft: `${safeMeasurePadding}px`,
          paddingRight: `${safeMeasurePadding}px`,
        }
      : undefined;

  if (!reserveScaledWidth) {
    return (
      <div ref={viewportRef} className={`w-full overflow-hidden flex ${justifyClass}`} style={viewportStyle}>
        <div
          ref={lineRef}
          className={`inline-flex items-center justify-center whitespace-nowrap ${className}`}
          style={{
            transform: `scale(${scale})`,
            transformOrigin,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className={`w-full overflow-hidden flex ${justifyClass}`}
      style={viewportStyle}
    >
      <div
        className="flex-none overflow-visible"
        style={scaledLineWidth ? { width: `${scaledLineWidth}px` } : undefined}
      >
        <div
          ref={lineRef}
          className={`inline-flex items-center justify-center whitespace-nowrap ${className}`}
          style={{
            maxWidth: "none",
            transform: `scale(${scale})`,
            transformOrigin: "left center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
