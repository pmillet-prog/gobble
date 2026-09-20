import React from "react";
import { loadAvatarImage } from "./avatarAssetCache.js";
import { drawParticipantTag, loadAvatarMarkerFont } from "./avatarAccessories.js";

export default function AvatarAccessoryPreview({ nickname = "Joueur", className = "" }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    let active = true;
    Promise.all([loadAvatarImage("/avatars/v1/rewards/participant-tag-oval.svg"), loadAvatarMarkerFont()]).then(([image]) => {
      if (!active || !ref.current) return;
      const ctx = ref.current.getContext("2d");
      ctx.clearRect(0, 0, 640, 384); ctx.save(); ctx.scale(2, 2);
      drawParticipantTag(ctx, image, nickname); ctx.restore();
    }).catch(() => {});
    return () => { active = false; };
  }, [nickname]);
  return <canvas ref={ref} width="640" height="384" className={className} role="img" aria-label={`Étiquette de participant : ${nickname}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
}
