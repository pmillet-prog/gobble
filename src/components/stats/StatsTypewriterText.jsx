import React from "react";

const LETTER = /^\p{L}/u;

// Fixed ink defects: rerenders never make the print shimmer or change its layout.
// Only affected letters need spans; everything else stays ordinary text nodes.
export default React.memo(function StatsTypewriterText({ children, seed = "" }) {
  const text = children == null ? "" : String(children);
  let hash = 2166136261;
  for (const char of `${seed}:${text}`) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  const parts = [];
  let plain = "";
  let previousDefect = false;
  for (const match of text.matchAll(/\p{L}\p{M}*|[^\p{L}]/gu)) {
    const char = match[0];
    if (!LETTER.test(char)) { plain += char; previousDefect = false; continue; }
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    const ink = hash % 100;
    if (previousDefect || ink >= 6) { plain += char; previousDefect = false; continue; }
    if (plain) { parts.push(plain); plain = ""; }
    parts.push(<span key={match.index} className={ink < 4 ? "stats-typed-faded" : "stats-typed-double"}>{char}</span>);
    previousDefect = true;
  }
  if (plain) parts.push(plain);
  return <>{parts}</>;
});
