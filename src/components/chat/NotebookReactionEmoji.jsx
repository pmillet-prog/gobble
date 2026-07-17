import React from "react";

const OPENMOJI_BLACK_BY_EMOJI = Object.freeze({
  "👍": "1F44D",
  "❤️": "2764",
  "❤": "2764",
  "😂": "1F602",
  "😮": "1F62E",
  "😢": "1F622",
  "😡": "1F621",
  "🍻": "1F37B",
  "🙏": "1F64F",
  "👏": "1F44F",
  "🎉": "1F389",
  "👋": "1F44B",
  "😎": "1F60E",
  "🤔": "1F914",
});

export default function NotebookReactionEmoji({ className = "", emoji = "" }) {
  const assetCode = OPENMOJI_BLACK_BY_EMOJI[emoji];
  if (!assetCode) return <span className={className}>{emoji}</span>;

  const maskUrl = `/emojis/openmoji-svg-black/${assetCode}.svg`;
  return (
    <span
      className={`${className} notebook-reaction-openmoji`}
      style={{ "--notebook-reaction-mask": `url("${maskUrl}")` }}
      aria-hidden="true"
    />
  );
}
