import React from 'react';
import { RoundClockSeconds } from '../features/clock/RoundClockDisplay.jsx';
import MobileConnectionLabel from '../features/mobile/MobileConnectionLabel.jsx';
import { GameBalanceSlot } from '../features/gobblars/GameBalances.jsx';
import InfortuneScheduleLabel from '../features/infortune/InfortuneScheduleLabel.jsx';

function MobileHeader({ activeRoom, countdownLines = [], darkMode, gridSize, headerRef, isFinaleBanner,
  isTargetRound, onOpenSettings, playingSeconds, playerTeam, phase, roundTypeLabel = '', roundStatsText,
  showRoundStats, tournament }) {
  const roundLabel = roundTypeLabel || (isFinaleBanner || tournament?.round === tournament?.totalRounds && tournament?.round
    ? 'Manche finale' : tournament?.round ? `Manche ${tournament.round}/${tournament.totalRounds}` : `${activeRoom?.label || 'Salon'} ${gridSize}×${gridSize}`);
  const team = playerTeam === 'red' ? (darkMode ? 'bg-red-900 border-red-700' : 'bg-red-200 border-red-300')
    : playerTeam === 'blue' ? (darkMode ? 'bg-blue-900 border-blue-700' : 'bg-blue-200 border-blue-300')
    : 'border-slate-200/70 dark:border-slate-700/70';
  return <header ref={headerRef} className={`px-2 py-1 border-b ${team}`} style={{ position: 'sticky', top: 0, zIndex: 30 }}>
    <div className="currency-header">
      <GameBalanceSlot kind="wallet" />
      <div className="currency-header__center">
        {phase === 'playing' ? <strong className="block text-[clamp(34px,10vw,50px)] leading-none tabular-nums"><RoundClockSeconds overrideSeconds={playingSeconds} /></strong>
          : <strong className="block text-[11px]"><InfortuneScheduleLabel>{countdownLines.map((line, i) => <span key={i} className="block">{line}</span>)}</InfortuneScheduleLabel></strong>}
        <small>{roundLabel}</small>
      </div>
      <button type="button" className="currency-header__settings" onClick={() => onOpenSettings?.()} aria-label="Paramètres">
        <span className="material-icons-outlined text-[20px]" aria-hidden="true">settings</span>
      </button>
      <GameBalanceSlot kind="bank" />
    </div>
    <div className="text-center text-[9px] leading-tight opacity-70"><MobileConnectionLabel />
      {phase === 'playing' && showRoundStats && roundStatsText && !isTargetRound && <> · {roundStatsText}</>}
    </div>
  </header>;
}
export default React.memo(MobileHeader);
