import React from "react";
import "./newFeatureBadge.css";

export default function NewFeatureBadge({ className = "" }) {
  return <span className={`new-feature-badge ${className}`}>Nouveau !</span>;
}
