import React from "react";
import useChalkboardArchiveGestures from "./useChalkboardArchiveGestures.js";

export default function ChalkboardArchiveImage({ archive }) {
  const [status, setStatus] = React.useState("loading");
  const [attempt, setAttempt] = React.useState(0);
  const viewportRef = React.useRef(null), imageRef = React.useRef(null), zoomRef = React.useRef(null);
  const actions = useChalkboardArchiveGestures({ viewportRef, imageRef, zoomRef, ready: status === "ready" });
  return <>
    <div className="chalkboard-archive-viewport" ref={viewportRef} tabIndex={0} role="region" aria-label="Tableau archivé. Glisse pour te déplacer, pince pour zoomer. Au clavier : flèches, plus et moins.">
      <img key={attempt} ref={imageRef} className="chalkboard-archive-image" src={`${archive.imageUrl}${attempt ? `?retry=${attempt}` : ""}`} draggable={false} decoding="async" alt={`Grand tableau de la semaine du ${archive.weekId}`} style={{ visibility: status === "ready" ? "visible" : "hidden" }} onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
      {status === "loading" && <p className="chalkboard-archive-message" role="status">Chargement du tableau…</p>}
      {status === "error" && <div className="chalkboard-archive-message" role="alert"><p>Impossible de charger cette image.</p><button onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Réessayer</button></div>}
    </div>
    <footer className="chalkboard-archive-tools">
      <div className="chalkboard-archive-zoom" role="group" aria-label="Zoom du tableau">
        <button disabled={status !== "ready"} onClick={() => actions.current.zoom?.(1 / 1.4)} aria-label="Dézoomer">−</button>
        <output ref={zoomRef} aria-label="Niveau de zoom">—</output>
        <button disabled={status !== "ready"} onClick={() => actions.current.zoom?.(1.4)} aria-label="Zoomer">+</button>
      </div>
      <button disabled={status !== "ready"} onClick={() => actions.current.fit?.(true)}>Vue d’ensemble</button>
      <button disabled={status !== "ready"} onClick={() => actions.current.fit?.(false)}>Lire le tableau</button>
      <a href={archive.imageUrl} download={`grand-tableau-${archive.weekId}.png`}>PNG ↓</a>
      <small>Glisse pour explorer · Pince ou utilise la molette pour zoomer</small>
    </footer>
  </>;
}
