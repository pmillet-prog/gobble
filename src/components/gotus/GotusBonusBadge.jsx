import React from "react";
import "./gotusResults.css";

export default function GotusBonusBadge({ summary }) {
  if (!summary || !(summary.won || Number(summary.wordsFound) > 0)) return null;
  return <span className="gotus-bonus" title="Gotus : un mot trouvé" aria-label="Gotus : un mot trouvé">
    <img src="/gotus/gotus-logo.webp" alt="" width="30" height="24" /><strong>+1 mot trouvé</strong>
  </span>;
}
