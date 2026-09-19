import React from "react";
import { CHALKBOARD_ZOOM } from "./chalkboardViewport.js";

export default function ChalkboardZoom({ value, onChange, disabled }) {
  return <label className="chalkboard-zoom">
    <span>Zoom</span>
    <input type="range" min={CHALKBOARD_ZOOM.min * 100} max={CHALKBOARD_ZOOM.max * 100}
      step={CHALKBOARD_ZOOM.step * 100} value={Math.round(value * 100)} disabled={disabled}
      aria-label="Zoom du tableau" aria-valuetext={`${Math.round(value * 100)} %`}
      onChange={event => onChange(Number(event.target.value) / 100)} />
    <output>{Math.round(value * 100)} %</output>
  </label>;
}
