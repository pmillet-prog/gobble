import { useId } from "react";

import {
  renderAccessory,
  renderArms,
  renderBody,
  renderBrows,
  renderEyes,
  renderHair,
  renderHorns,
  renderMouth,
  renderPatterns,
  renderPupils,
  renderShadow,
} from "./avatarParts.js";
import { normalizeAvatarConfig, normalizeMood } from "./avatarUtils.js";
import "./avatarAnimations.css";

export default function Avatar({ config, size = 220, mood = "idle", title = "Avatar Gobble" }) {
  const reactId = useId();
  const normalizedConfig = normalizeAvatarConfig(config);
  const normalizedMood = normalizeMood(mood);
  const pixelSize = Number.isFinite(Number(size)) ? Math.max(64, Number(size)) : 220;
  const titleId = `avatar-title-${reactId.replace(/:/g, "")}`;
  const arms = renderArms(normalizedConfig);

  return (
    <span
      className="avatar-stage"
      style={{ "--avatar-size": `${pixelSize}px` }}
      aria-label={title}
      role="img"
    >
      <svg
        className={`avatar-root avatar--${normalizedMood}`}
        viewBox="0 0 240 240"
        width={pixelSize}
        height={pixelSize}
        aria-labelledby={titleId}
      >
        <title id={titleId}>{title}</title>
        <g className="avatar-shadow">{renderShadow()}</g>
        <g className="avatar-character">
          <g className="avatar-horns">{renderHorns(normalizedConfig)}</g>
          <g className="avatar-arm-left">{arms[0]}</g>
          <g className="avatar-arm-right">{arms[1]}</g>
          <g className="avatar-body">{renderBody(normalizedConfig)}</g>
          <g className="avatar-patterns">{renderPatterns(normalizedConfig)}</g>
          <g className="avatar-hair">{renderHair(normalizedConfig)}</g>
          <g className="avatar-face">
            <g className="avatar-brows">{renderBrows(normalizedMood)}</g>
            <g className="avatar-eyes">{renderEyes(normalizedConfig, normalizedMood)}</g>
            <g className="avatar-pupils">{renderPupils(normalizedConfig, normalizedMood)}</g>
            <g className="avatar-mouth">{renderMouth(normalizedConfig, normalizedMood)}</g>
          </g>
          <g className="avatar-accessory">{renderAccessory(normalizedConfig)}</g>
        </g>
      </svg>
    </span>
  );
}

export { Avatar };
