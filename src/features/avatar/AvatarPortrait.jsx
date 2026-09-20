import React from "react";
import AvatarMedalsOverlay from "./AvatarMedalsOverlay.jsx";
import useWeeklyAuraAppearance from "./useWeeklyAuraAppearance.js";
import "./avatar.css";

export default React.memo(function AvatarPortrait({ value = null, loading = false, size = 160, view = "face", expression = "neutral", medals = null, nickname, label = "Avatar", className = "", onResolved }) {
  const visibleValue = useWeeklyAuraAppearance(value);
  const ref = React.useRef(null);
  const renderer = React.useRef(null);
  const [status, setStatus] = React.useState("loading");
  const [camera, setCamera] = React.useState(null);
  const [attempt, retry] = React.useReducer(value => value + 1, 0);
  const resolvedCallback = React.useRef(onResolved);
  resolvedCallback.current = onResolved;
  React.useEffect(() => {
    if (loading || !value) return;
    let active = true;
    setStatus("loading");
    const frame = requestAnimationFrame(() => {
      if (!renderer.current) renderer.current = import("./avatarRenderer.js").then(module => module.createAvatarRenderer());
      renderer.current.then(instance => instance.prepare(visibleValue, { expression })).then(result => {
        if (active && ref.current) {
          result.draw(ref.current, view, null, nickname);
          setCamera({ value, size, view, viewport: ref.current.gobbleViewport });
          setStatus("ready");
          resolvedCallback.current?.(result, value);
        }
      }).catch(error => { if (active) { renderer.current = null; setStatus("error"); console.warn("Avatar rendering failed", error); } });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [loading, value, visibleValue, view, expression, size, nickname, attempt]);
  React.useEffect(() => {
    const worker = typeof navigator === "undefined" ? null : navigator.serviceWorker;
    const refresh = () => { renderer.current = null; retry(); };
    worker?.addEventListener("controllerchange", refresh);
    return () => worker?.removeEventListener("controllerchange", refresh);
  }, []);
  const pending = loading || (!!value && status === "loading" && !camera);
  return <span className={`avatar-portrait ${className}`} role={pending || (value && status === "error") ? "group" : "img"} aria-label={label} aria-busy={loading || (!!value && status === "loading")}>
    {!loading && value ? <canvas ref={ref} width={size * 2} height={size * 2} aria-hidden="true" /> : null}
    {!loading && !value ? <img className="avatar-portrait-default" src="/avatars/default.png" alt="" /> : null}
    {pending ? <span className="avatar-portrait-loading" role="status" aria-label="Chargement de l’avatar"><i aria-hidden="true" /></span> : null}
    {!loading && value && view === "portrait" && status === "ready" && camera?.value === value && camera.size === size && camera.view === view ?
      <AvatarMedalsOverlay viewport={camera.viewport} size={size}
        gold={Number(medals?.gold) || 0} silver={Number(medals?.silver) || 0} bronze={Number(medals?.bronze) || 0} /> : null}
    {!loading && value && status === "error" ? <><span className="avatar-fallback" role="status">Avatar indisponible</span><button type="button" className="avatar-render-retry" onClick={retry}>Réessayer l’avatar</button></> : null}
  </span>;
});
