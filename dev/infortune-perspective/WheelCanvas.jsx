import React from "react";

// React owns the host; the graphics service owns the canvas and can keep its
// WebGL context across mounts. Moving a React-owned canvas would break cleanup.
export function WheelCanvas({ wheel, label }) {
  return <div ref={wheel.canvasHost} role="img" aria-label={label}
    style={{ width: "100%", height: "100%" }} />;
}
