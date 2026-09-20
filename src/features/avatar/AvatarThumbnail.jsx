import React from "react";
import { chatAvatarRevisions } from "./chatAvatarRevisions.js";
import "./avatarThumbnail.css";

// Reuse the server PNG and browser cache across chat and ranking rows. No canvas.
export default React.memo(function AvatarThumbnail({ userId, size = 28, className = "", onClick, label = "Voir le profil", showPlaceholder = false, buttonProps }) {
  const snapshot = React.useCallback(() => chatAvatarRevisions.url(userId), [userId]);
  const source = React.useSyncExternalStore(
    React.useCallback(listener => chatAvatarRevisions.subscribe(userId, listener), [userId]),
    snapshot,
    snapshot,
  );
  const [result, setResult] = React.useState(null);
  const status = result?.source === source ? result.status : "loading";
  const missing = !source || status === "failed";
  if (missing && !showPlaceholder) return null;
  const Wrapper = onClick ? "button" : "span";
  return <Wrapper className={`avatar-thumbnail ${className}`} style={{ width: size, height: size }}
    {...(onClick ? { ...buttonProps, type: "button", onClick, "aria-label": label, title: label,
      onKeyDown: event => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); } } : {})}>
    {missing ? <svg className="avatar-thumbnail-placeholder" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="6" /><path d="M5 30v-4a11 11 0 0 1 22 0v4Z" /></svg> : <>
      {showPlaceholder && status === "loading" ? <span className="avatar-thumbnail-loading" role="status" aria-label="Chargement de l’avatar"><i aria-hidden="true" /></span> : null}
      <img key={source} src={source} alt="" aria-hidden="true" width={size} height={size}
        loading="lazy" decoding="async" draggable="false" className={status === "loading" ? "avatar-thumbnail-pending" : ""}
        onLoad={() => setResult({ source, status: "loaded" })} onError={() => setResult({ source, status: "failed" })} />
    </>}
  </Wrapper>;
});
