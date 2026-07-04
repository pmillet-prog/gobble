import React from "react";

import { buildTargetHintPreviewStyleMap } from "../utils/targetHintStyles.js";

function TargetHintPattern({
  className = "",
  display = "",
  revealedWordIndices = [],
  solved = false,
  style = undefined,
  wordLength = null,
}) {
  const text = String(display || "");
  const tokens = React.useMemo(
    () => text.trim().split(/\s+/).filter(Boolean),
    [text]
  );
  const previewStyleMap = React.useMemo(
    () => buildTargetHintPreviewStyleMap(revealedWordIndices, wordLength),
    [revealedWordIndices, wordLength]
  );

  if (solved || tokens.length <= 1) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    );
  }

  return (
    <span className={className} style={{ whiteSpace: "pre", ...style }}>
      {tokens.map((token, index) => (
        <React.Fragment key={`${index}-${token}`}>
          {index > 0 ? " " : null}
          <span style={token === "_" ? undefined : previewStyleMap.get(index)}>
            {token}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

export default React.memo(TargetHintPattern);
