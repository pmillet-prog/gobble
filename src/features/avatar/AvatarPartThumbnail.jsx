import React from "react";
import { loadAvatarImage } from "./avatarAssetCache.js";
import AvatarAccessoryPreview from "./AvatarAccessoryPreview.jsx";

export default function AvatarPartThumbnail({ part, nickname }) {
  const [failed, setFailed] = React.useState(false);
  const url = `/avatars/v1/${part.layers?.thumbnail || part.file}`;
  const retry = async event => {
    const target = event.currentTarget;
    if (target.dataset.retried) { setFailed(true); return; }
    target.dataset.retried = "true";
    try {
      const image = await loadAvatarImage(url);
      if (target.isConnected) { target.src = url; if (!image.width) setFailed(true); }
    } catch { if (target.isConnected) setFailed(true); }
  };
  let style;
  if (part.preview) {
    const { width, height, viewBox: [x, y, w, h] } = part.preview;
    style = { width: `${width / w * 100}%`, height: `${height / h * 100}%`, left: `${-x / w * 100}%`, top: `${-y / h * 100}%` };
  }
  return <span className={`avatar-part-art${part.preview ? " avatar-part-art-framed" : ""}${part.previewTone === "brown" ? " avatar-part-art-brown" : ""}`}>{part.id === "participant_tag" ? <AvatarAccessoryPreview nickname={nickname} /> : <img loading="lazy" src={url} onError={retry} style={style} alt="" />}{failed ? <span className="avatar-thumbnail-error">Aperçu indisponible</span> : null}</span>;
}
