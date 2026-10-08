import React from "react";
import { formatNumber } from "../../utils/numbers.js";
import { getStatsPeriodLabel } from "../../features/stats/statsNavigation.js";
import { formatWeeklyDate } from "./weeklyStatsModel.js";
import WeeklyTop3Controls from "./WeeklyTop3Controls.jsx";
import StatsLeaderboardRow from "./StatsLeaderboardRow.jsx";
import StatsBoardSelect from "./StatsBoardSelect.jsx";
import StatsTypewriterText from "./StatsTypewriterText.jsx";
import useStatsPageSwipe from "../../features/stats/useStatsPageSwipe.js";

export default function WeeklyStatsScreen({ runtime }) {
  const { navigation, entries, onPeriodChange, onCategoryChange, onBoardChange, onPageChange, isMobileLayout,
    closeWeeklyStatsOverlay, playCloseSound, loading, error, retry,
    weekStartTs, trackingStartTs, top3RoundType, setTop3RoundType, renderVocabPanel,
    weeklyVocabSelfRank, weeklyVocabSelfCount } = runtime;
  const { tab, category, categories, boards, board } = navigation;
  const swipe = useStatsPageSwipe({ navigation, enabled: isMobileLayout, onPageChange });
  const personal = board.key === "vocab_personal";
  const partialWeek = tab === "weekly" && board.key !== "top3" && Number.isFinite(trackingStartTs) &&
    Number.isFinite(weekStartTs) && trackingStartTs > weekStartTs;

  return <div className="stats-panel stats-binder" data-period={tab}>
    <header className="stats-binder-header">
      <div className="stats-binder-name"><span><StatsTypewriterText>GOBBLE</StatsTypewriterText></span><strong><StatsTypewriterText>Le registre des records</StatsTypewriterText></strong></div>
      <button type="button" className="stats-close" aria-label="Fermer" onClick={() => { playCloseSound(); closeWeeklyStatsOverlay(); }}><span><StatsTypewriterText>Fermer</StatsTypewriterText></span><span aria-hidden="true">×</span></button>
    </header>
    <div className="stats-periods" role="group" aria-label="Période des statistiques">
      <button type="button" aria-label="Cette semaine" aria-pressed={tab === "weekly"} onClick={() => onPeriodChange("weekly")}>
        <span className="stats-register-number" aria-hidden="true">01</span><span><StatsTypewriterText>Cette semaine</StatsTypewriterText></span>
      </button>
      <button type="button" aria-label="Depuis toujours" aria-pressed={tab === "season"} onClick={() => onPeriodChange("season")}>
        <span className="stats-register-number" aria-hidden="true">02</span><span><StatsTypewriterText>Depuis toujours</StatsTypewriterText></span>
      </button>
    </div>
    <nav className="stats-categories" aria-label="Catégories des statistiques" style={{ "--stats-category-count": categories.length }}>
      {categories.map(({ key, label }) => <button key={key} type="button" data-category={key} aria-current={category === key ? "page" : undefined}
        onClick={() => onCategoryChange(key)}><span><StatsTypewriterText>{label}</StatsTypewriterText></span></button>)}
    </nav>
    <div className="stats-sheet">
    <div key={`${tab}:${category}`} className="stats-page-scroll custom-scrollbar custom-scrollbar-gray" data-stats-scroll="true" {...swipe.handlers}>
    <div className="stats-navigation">
      <p className="stats-period-caption"><StatsTypewriterText>{tab === "weekly" ? getStatsPeriodLabel(weekStartTs) : "Progressions et totaux cumulés depuis vos débuts"}</StatsTypewriterText></p>
      {boards.length > 1 ? <StatsBoardSelect label="Classement" options={boards} value={board.key} onChange={onBoardChange} /> : null}
    </div>
    <section className="stats-board-content" aria-labelledby="stats-board-title" data-board-key={board.key}>
      <div className="stats-board-heading">
        <h2 id="stats-board-title"><StatsTypewriterText>{board.label}</StatsTypewriterText></h2>
        <p><StatsTypewriterText>{board.description}</StatsTypewriterText></p>
        {partialWeek ? <p className="stats-tracking-note"><StatsTypewriterText>{`Suivi depuis le ${formatWeeklyDate(trackingStartTs)}. Cette première semaine est partielle.`}</StatsTypewriterText></p> : null}
      </div>
      {error ? <div className="stats-fetch-status" role="alert"><StatsTypewriterText>Impossible d’actualiser les statistiques.</StatsTypewriterText> <button type="button" onClick={retry}><StatsTypewriterText>Réessayer</StatsTypewriterText></button></div>
        : loading ? <div className="stats-fetch-status" role="status"><StatsTypewriterText>Mise à jour…</StatsTypewriterText></div> : null}
      {board.key === "top3" ? <div className="stats-top3-controls"><WeeklyTop3Controls roundType={top3RoundType} onRoundTypeChange={setTop3RoundType}
        trackingStartTs={trackingStartTs} weekStartTs={weekStartTs} /></div> : null}
      <div className="stats-board-list">
        {personal ? renderVocabPanel({ showDelta: false, showHeading: false, darkMode: false, typewriter: true }) : <>
          {board.key === "weeklyVocab" ? <div className="stats-vocab-race">
            <p><StatsTypewriterText>Le podium portera les couleurs or, argent et bronze la semaine suivante.</StatsTypewriterText></p>
            <div className="stats-vocab-self"><strong><StatsTypewriterText>{Number.isFinite(weeklyVocabSelfRank) ? `#${weeklyVocabSelfRank}` : "Non classé"}</StatsTypewriterText></strong>
              {Number.isFinite(weeklyVocabSelfCount) ? <span><StatsTypewriterText>{`${formatNumber(weeklyVocabSelfCount)} mots`}</StatsTypewriterText></span> : null}</div>
          </div> : null}
          {entries.length ? <ol className="stats-leaderboard" aria-label={board.label}>
            {entries.map((entry, index) => <StatsLeaderboardRow key={entry.presenterId || entry.playerKey || entry.userId || `${entry.nick}:${index}`}
              boardKey={board.key} entry={entry} index={index} runtime={runtime} />)}
          </ol> : <div className="stats-empty"><span><StatsTypewriterText>{loading ? "Chargement…" : error ? "Les statistiques sont indisponibles pour le moment." :
            board.key === "top3" ? "Pas encore de manches avec un score supérieur à 0 pour ce type." :
              tab === "weekly" ? "Pas encore de résultats cette semaine." : "Pas encore de progression enregistrée."}</StatsTypewriterText></span></div>}
        </>}
      </div>
    </section>
    </div>
    <div className="stats-sheet-footer" aria-hidden="true"><span className="stats-footer-register"><StatsTypewriterText>Registre de Gobble</StatsTypewriterText></span>
      <span className="stats-swipe-hint"><StatsTypewriterText>{`↔ Glisser · ${swipe.pageNumber}/${swipe.pageCount}`}</StatsTypewriterText></span>
      <span><StatsTypewriterText>{tab === "weekly" ? "Relevé hebdomadaire" : "Relevé général"}</StatsTypewriterText></span></div>
    </div>
  </div>;
}
