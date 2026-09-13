import React from "react";
import { chalkboardCanvasFont } from "./chalkboardFonts.js";
import { paintChalkboardTextLines } from "./chalkboardPaint.js";

// One transparent viewport-sized layer. Highlight simple silhouettes instead
// of regenerating the expensive chalk particles while the pointer moves.
export default function ChalkboardModerationPreview({ intervention, viewport, scale }) {
  const canvasRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(viewport.width * ratio));
    canvas.height = Math.max(1, Math.round(viewport.height * ratio));
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!intervention) return;
    context.fillStyle = "rgba(4, 17, 9, .18)";
    context.fillRect(0, 0, viewport.width, viewport.height);
    context.translate(-viewport.scrollLeft, 0);
    context.scale(scale, scale);
    context.strokeStyle = "rgba(255, 214, 92, .9)";
    context.fillStyle = "rgba(255, 214, 92, .4)";
    context.lineCap = context.lineJoin = "round";
    for (const element of intervention.elements || []) {
      if (element.type === "stroke") {
        context.lineWidth = element.size + 5 / scale;
        context.beginPath();
        element.points.forEach((point, index) => { if (index) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); });
        context.stroke();
      } else if (element.type === "text") {
        context.save();
        context.translate(element.cx, element.cy);
        context.rotate(element.angle);
        context.scale(element.scale, element.scale);
        context.font = chalkboardCanvasFont(element.font, element.fontSize);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineWidth = 3 / (scale * element.scale);
        paintChalkboardTextLines(context, element, "strokeText");
        paintChalkboardTextLines(context, element);
        context.restore();
      }
    }
  }, [intervention, viewport.width, viewport.height, viewport.scrollLeft, scale]);
  return <canvas ref={canvasRef} className="chalkboard-moderation-preview" data-intervention-id={intervention?.id || ""} aria-hidden="true" />;
}
