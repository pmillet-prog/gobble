import React from "react";
import { CAMERA_TRACKS } from "./cameraTimeline.js";
import { DEFAULT_CAMERA, STAGE_CAMERA } from "./projection.js";

export function CameraControls({ camera, editor }) {
  const control = ({ key, label, min, max, unit }) => <label key={key}>{label} <output>{Math.round(camera[key] * 10) / 10} {unit}</output>
    <input type="range" min={min} max={max} step="0.1" value={camera[key]} disabled={editor.transport.playing}
      onChange={event => editor.setValue(key, Number(event.target.value))} /></label>;
  return <section className="perspective-workshop__camera" aria-label="Réglages de caméra"><h2>Le point de vue</h2>
    <p className="perspective-workshop__camera-note">À l’arrêt, chaque réglage pose un point à l’instant sélectionné dans la timeline.</p>
    {CAMERA_TRACKS.slice(0, 4).map(control)}
    <p className="perspective-workshop__camera-note">La focale déplace aussi la caméra pour comparer les perspectives à une échelle similaire.</p>
    <details className="perspective-workshop__composition"><summary>Décaler & incliner le cadre</summary>{CAMERA_TRACKS.slice(4).map(control)}</details>
    <div className="perspective-workshop__camera-presets"><button className="perspective-workshop__text-button" type="button" disabled={editor.transport.playing}
      onClick={() => editor.capture(STAGE_CAMERA)}>Vue d’ensemble</button>
      <button className="perspective-workshop__text-button" type="button" disabled={editor.transport.playing}
        onClick={() => editor.capture(DEFAULT_CAMERA)}>Vue rapprochée</button></div>
  </section>;
}
