import React from "react";

function WeeklyNickLine({
  crownIcon = null,
  metaLabel = "",
  nick = "",
  onOpenProfile = null,
  showVocabLabel = true,
  vocabImageUrl = "",
  vocabLabel = "Niveau",
}) {
  return (
    <div className="font-semibold truncate flex items-center gap-1 text-xs">
      {vocabImageUrl ? (
        <span className="inline-flex shrink-0 items-center gap-1">
          <img
            src={vocabImageUrl}
            alt={vocabLabel || "Niveau"}
            className="h-5 w-5 shrink-0"
            draggable={false}
          />
          {showVocabLabel ? (
            <span className="text-[10px] font-black opacity-75">
              {vocabLabel || "Niveau"}
            </span>
          ) : null}
        </span>
      ) : null}
      {onOpenProfile ? (
        <button
          type="button"
          data-stats-profile-button="true"
          className="min-w-0 truncate text-left hover:underline"
          style={{ touchAction: "pan-y" }}
          onClick={onOpenProfile}
        >
          {nick}
        </button>
      ) : (
        <span className="truncate">{nick}</span>
      )}
      {crownIcon}
      {metaLabel ? <span className="text-[10px] opacity-60 truncate">{metaLabel}</span> : null}
    </div>
  );
}

export default React.memo(WeeklyNickLine);
