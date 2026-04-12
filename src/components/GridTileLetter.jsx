import React from "react";

import { FAKE_TWINS_TYPE } from "./gameLogic";

export default function GridTileLetter({ cell = null, className = "" }) {
  const letter = String(cell?.letter || "?");
  const altLetter =
    cell?.specialType === FAKE_TWINS_TYPE && cell?.altLetter
      ? String(cell.altLetter || "").trim()
      : "";

  if (!altLetter) {
    return <span className={`tile-letter ${className}`.trim()}>{letter}</span>;
  }

  return (
    <span className={`tile-letter tile-letter-fake-twins ${className}`.trim()}>
      <span className="tile-letter-fake-twins-main">{letter}</span>
      <span className="tile-letter-fake-twins-sep">/</span>
      <span className="tile-letter-fake-twins-alt">{altLetter}</span>
    </span>
  );
}
