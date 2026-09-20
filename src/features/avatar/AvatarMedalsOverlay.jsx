import React from "react";
import { drawAvatarMedals } from "./avatarMedals.js";

export default React.memo(function AvatarMedalsOverlay({ viewport, size, gold = 0, silver = 0, bronze = 0 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAvatarMedals(ctx, viewport, { gold, silver, bronze });
  }, [viewport, size, gold, silver, bronze]);
  if (!viewport || !(gold + silver + bronze)) return null;
  return <canvas ref={ref} width={size * 2} height={size * 2} aria-hidden="true"
    className="avatar-medals-overlay" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
});
