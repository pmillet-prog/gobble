import React from "react";
import InfortuneWheelEmblem from './InfortuneWheelEmblem.jsx';
import "./infortuneWheelLoading.css";

export default function InfortuneWheelLoading({ label = "La roue arrive…" }) {
  return <div className="infortune-wheel-loading" role="status">
    <InfortuneWheelEmblem spinning />
    <p>{label}</p>
  </div>;
}
