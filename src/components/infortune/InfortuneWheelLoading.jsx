import React from "react";
import "./infortuneWheelLoading.css";

export default function InfortuneWheelLoading({ label = "La roue arrive…" }) {
  return <div className="infortune-wheel-loading" role="status">
    <span className="infortune-wheel-loading__pointer" aria-hidden="true" />
    <span className="infortune-wheel-loading__wheel" aria-hidden="true"><i>✦</i></span>
    <p>{label}</p>
  </div>;
}
