import React from "react";
import AvatarThumbnail from "../../features/avatar/AvatarThumbnail.jsx";
import { getVocabLevelMeta } from "../../vocabRanks.js";
import WeeklyNickLine from "./WeeklyNickLine.jsx";
import { getStatsRowDetails } from "./statsLeaderboardModel.js";
import StatsTypewriterText from "./StatsTypewriterText.jsx";

export default React.memo(function StatsLeaderboardRow({ boardKey, entry, index, runtime }) {
  const { installId, selfNick, getUserIdFromPlayerProfileTarget, openPlayerProfile,
    openDefinition, getImageUrl, isCrownedEntry, renderCrownIcon } = runtime;
  const nick = entry.nick || "Joueur";
  const isPresenter = boardKey === "presenterHits";
  const userId = isPresenter ? null : getUserIdFromPlayerProfileTarget(entry);
  const onProfile = userId ? () => openPlayerProfile({ userId, nick }) : null;
  const isSelf = !isPresenter && ((installId && entry.playerKey === `install:${installId}`) ||
    (selfNick && nick.trim().toLowerCase() === selfNick.trim().toLowerCase()));
  const meta = boardKey === "vocab" ? getVocabLevelMeta(Number(entry.vocabCount) || 0) : null;
  const { value, unit, details, word } = getStatsRowDetails(boardKey, entry);

  return <li className={`stats-leaderboard-row${isSelf ? " is-self" : ""}`} data-stats-row="true">
    <span className="stats-rank" aria-label={`Rang ${index + 1}`}>{index + 1}</span>
    {isPresenter ? <span className="stats-presenter-portrait">
      {entry.portraitUrl ? <img src={entry.portraitUrl} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">★</span>}
    </span> : <AvatarThumbnail userId={userId} size={36} showPlaceholder onClick={onProfile}
      label={`Voir le profil de ${nick}`} buttonProps={{ "data-stats-profile-button": "true" }} />}
    <div className="stats-row-body">
      <WeeklyNickLine wrap typewriter nick={nick} onOpenProfile={onProfile}
        vocabImageUrl={meta?.imageKey ? getImageUrl(meta.imageKey) : ""} vocabLabel={meta?.label}
        showVocabLabel={false} crownIcon={!isPresenter && isCrownedEntry(nick, entry) ? renderCrownIcon("shrink-0") : null} />
      {word ? <button type="button" className="stats-record-word" onClick={() => openDefinition(word)} aria-label={`Voir la définition de ${word}`}>
        <span><StatsTypewriterText>{word}</StatsTypewriterText></span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></svg>
      </button> : null}
      {details.length ? <div className="stats-row-details"><StatsTypewriterText>{details.join(" · ")}</StatsTypewriterText></div> : null}
    </div>
    <div className={`stats-row-value${boardKey === "targetQuizPoints" && Number(entry.points) < 0 ? " is-negative" : ""}`} data-stats-value="true">
      <strong><StatsTypewriterText>{value}</StatsTypewriterText></strong>{unit ? <span><StatsTypewriterText>{unit}</StatsTypewriterText></span> : null}
    </div>
  </li>;
});
