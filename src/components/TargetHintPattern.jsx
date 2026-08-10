import React from "react";

import { buildTargetHintPreviewStyleMap } from "../utils/targetHintStyles.js";

function TargetHintPattern({
  className = "",
  display = "",
  revealedWordIndices = [],
  renderBlankRules = false,
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
    <span
      aria-label={renderBlankRules ? text : undefined}
      className={className}
      style={{ whiteSpace: "pre", ...style }}
    >
      {tokens.map((token, index) => (
        <React.Fragment key={`${index}-${token}`}>
          {index > 0 ? " " : null}
          {renderBlankRules && token === "_" ? (
            <span
              aria-hidden="true"
              className="relative inline-block h-[0.9em] w-[0.68em] align-baseline"
            >
              <span className="absolute inset-x-0 bottom-[0.04em] h-[2px] rounded-full bg-current" />
            </span>
          ) : (
            <span style={token === "_" ? undefined : previewStyleMap.get(index)}>
              {token}
            </span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

export default React.memo(TargetHintPattern);
