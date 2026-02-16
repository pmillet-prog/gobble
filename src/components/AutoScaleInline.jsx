import React from "react";

export default function AutoScaleInline({
  className = "",
  minScale = 0.62,
  children,
}) {
  const viewportRef = React.useRef(null);
  const lineRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);

  React.useLayoutEffect(() => {
    const viewportEl = viewportRef.current;
    const lineEl = lineRef.current;
    if (!viewportEl || !lineEl) return undefined;

    const recomputeScale = () => {
      const viewportWidth = viewportEl.clientWidth || 0;
      const lineWidth = lineEl.scrollWidth || 0;
      if (viewportWidth <= 0 || lineWidth <= 0) {
        setScale(1);
        return;
      }
      const ratio = viewportWidth / lineWidth;
      const nextScale = Number.isFinite(ratio)
        ? Math.max(Math.min(1, ratio), Math.max(0.45, Number(minScale) || 0.62))
        : 1;
      setScale((prev) => (Math.abs(prev - nextScale) > 0.01 ? nextScale : prev));
    };

    recomputeScale();

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(recomputeScale);
      observer.observe(viewportEl);
      observer.observe(lineEl);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", recomputeScale);
    }

    return () => {
      if (observer) observer.disconnect();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", recomputeScale);
      }
    };
  }, [children, minScale]);

  return (
    <div ref={viewportRef} className="w-full overflow-hidden flex justify-center">
      <div
        ref={lineRef}
        className={`inline-flex items-center justify-center whitespace-nowrap ${className}`}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center top",
        }}
      >
        {children}
      </div>
    </div>
  );
}

