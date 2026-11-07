import React from 'react';
import RankingWidgetMobile from '../RankingWidgetMobile.jsx';
import './tournamentRankingCard.css';

// Shared by the usual end-of-tournament screen and the live finale standings.
export default function TournamentRankingCard({ title = 'Classement général', caption, className = '', ...ranking }) {
  return <section className={`tournament-ranking-card bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col overflow-hidden h-full min-h-0 ${className}`}>
    <header className="flex items-baseline justify-between gap-2 mb-1">
      <h2 className="font-extrabold m-0 text-base"><span className="tournament-ranking-card__star" aria-hidden="true">✦</span> {title}</h2>
      {caption && <span className="text-xs text-slate-500 dark:text-slate-300 whitespace-nowrap">{caption}</span>}
    </header>
    <div className="min-h-0 flex-1"><RankingWidgetMobile expanded animateRank={false} showWheel={false} flatStyle fitHeight {...ranking} /></div>
  </section>;
}
