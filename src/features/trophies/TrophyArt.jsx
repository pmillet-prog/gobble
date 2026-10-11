import React from "react";
import { getTrophyMetal } from "./trophyPresentation.js";
import "./trophyArt.css";

export default function TrophyArt({ trophy, large = false, locked = false, className = "", loading = "lazy" }) {
  if (!trophy) return null;
  const source = large ? trophy.image.replace(/\.webp$/, "-large.webp") : trophy.image;
  return <img className={`trophy-art ${className}${locked ? " is-locked" : ""}`}
    data-trophy-metal={getTrophyMetal(trophy)} data-trophy-tint={trophy.metal ? "true" : undefined}
    src={source} alt="" draggable="false" loading={loading}
    onError={large ? event => { if (event.currentTarget.getAttribute("src") !== trophy.image) event.currentTarget.src = trophy.image; } : undefined} />;
}
