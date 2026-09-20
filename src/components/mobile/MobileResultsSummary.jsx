import React from "react";

// A transform alone leaves the original height in the flex column. Measure the
// unscaled content so the ranking actually recovers the space we make available.
export default function MobileResultsSummary({ scale = 1, className, style, children }) {
  const wrapperRef = React.useRef(null);
  const contentRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (scale === 1) {
      wrapper.style.removeProperty("height");
      return undefined;
    }
    const measure = () => { wrapper.style.height = `${content.offsetHeight * scale}px`; };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scale]);
  return <div ref={wrapperRef} className={className}
    style={scale === 1 ? style : { ...style, position: "relative", flex: "0 0 auto" }}>
    {scale === 1 ? children : <div ref={contentRef} style={{
      position: "absolute", top: 0, width: "100%", display: "flow-root",
      transform: `scale(${scale})`, transformOrigin: "top center",
    }}>{children}</div>}
  </div>;
}
