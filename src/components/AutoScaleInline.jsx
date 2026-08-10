import React from "react";

export default function AutoScaleInline({
  className = "",
  minScale = 0.62,
  align = "center",
  estimatedContentWidth = null,
  measurePaddingPx = 0,
  reserveScaledWidth = false,
  scaleMode = "uniform",
  children,
}) {
  const viewportRef = React.useRef(null);
  const lineRef = React.useRef(null);
  const viewportWidthRef = React.useRef(0);
  const estimatedContentWidthRef = React.useRef(estimatedContentWidth);
  const [scale, setScale] = React.useState(1);
  const [lineWidth, setLineWidth] = React.useState(0);
  const usesEstimatedContentWidth =
    Number.isFinite(Number(estimatedContentWidth)) && Number(estimatedContentWidth) > 0;

  estimatedContentWidthRef.current = estimatedContentWidth;

  const applyMeasurements = React.useCallback(
    (viewportWidth, measuredLineWidth) => {
      const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
      const safeLineWidth = Math.max(0, Number(measuredLineWidth) || 0);
      viewportWidthRef.current = safeViewportWidth;
      setLineWidth((prev) =>
        Math.abs(prev - safeLineWidth) > 0.5 ? safeLineWidth : prev
      );
      if (safeViewportWidth <= 0 || safeLineWidth <= 0) {
        setScale(1);
        return;
      }
      const safeMeasurePadding = Math.max(0, Number(measurePaddingPx) || 0);
      const effectiveViewportWidth = Math.max(
        0,
        safeViewportWidth - safeMeasurePadding * 2
      );
      const ratio = effectiveViewportWidth / safeLineWidth;
      const nextScale = Number.isFinite(ratio)
        ? Math.max(Math.min(1, ratio), Math.max(0.25, Number(minScale) || 0.62))
        : 1;
      setScale((prev) => (Math.abs(prev - nextScale) > 0.01 ? nextScale : prev));
    },
    [measurePaddingPx, minScale]
  );

  React.useEffect(() => {
    const viewportEl = viewportRef.current;
    const lineEl = lineRef.current;
    if (!viewportEl || !lineEl) return undefined;
    let rafId = null;

    const recomputeScale = () => {
      const viewportWidth = viewportEl.clientWidth || 0;
      const estimatedWidth = Number(estimatedContentWidthRef.current);
      const measuredLineWidth =
        Number.isFinite(estimatedWidth) && estimatedWidth > 0
          ? estimatedWidth
          : lineEl.scrollWidth || 0;
      applyMeasurements(viewportWidth, measuredLineWidth);
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
      observer = new ResizeObserver(() => {
        const estimatedWidth = Number(estimatedContentWidthRef.current);
        const hasEstimatedWidth = Number.isFinite(estimatedWidth) && estimatedWidth > 0;
        const viewportWidth = viewportEl.clientWidth || viewportWidthRef.current || 0;
        const measuredLineWidth = hasEstimatedWidth
          ? estimatedWidth
          : lineEl.scrollWidth || 0;
        applyMeasurements(viewportWidth, measuredLineWidth);
      });
      observer.observe(viewportEl);
      if (!usesEstimatedContentWidth) {
        observer.observe(lineEl);
      }
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
  }, [applyMeasurements, reserveScaledWidth, usesEstimatedContentWidth]);

  React.useLayoutEffect(() => {
    const estimatedWidth = Number(estimatedContentWidth);
    if (!Number.isFinite(estimatedWidth) || estimatedWidth <= 0) return;
    if (viewportWidthRef.current <= 0) return;
    applyMeasurements(viewportWidthRef.current, estimatedWidth);
  }, [applyMeasurements, estimatedContentWidth]);

  const justifyClass = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";
  const transformOrigin =
    align === "left" ? "left top" : align === "right" ? "right top" : "center top";
  const safeMeasurePadding = Math.max(0, Number(measurePaddingPx) || 0);
  const scaledLineWidth = lineWidth > 0 ? Math.ceil(lineWidth * scale) : null;
  const scaleTransform =
    scaleMode === "horizontal" ? `scaleX(${scale})` : `scale(${scale})`;
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
            transform: scaleTransform,
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
            transform: scaleTransform,
            transformOrigin: "left center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
