import React from 'react';
import { createPortal } from 'react-dom';
import { useOptionalApplicationKernel } from '../../app/react/ApplicationRuntimeProvider.jsx';
import { useFeatureRuntime, useFeatureSelector } from '../../app/react/useFeatureRuntime.js';
import { currencyAnchors } from './currencyAnchors.js';
import CurrencyCounter from './CurrencyCounter.jsx';
import GobbleRewardAnimation from './GobbleRewardAnimation.jsx';
import { INFORTUNE_CLIENT_ENABLED } from '../infortune/infortuneAvailability.js';
import './gameBalances.css';

export function GameBalancesView({ gobblars, bank, showBank = true, className = '' }) {
  return <div className={`game-balances ${className}`}>
    {gobblars !== undefined && <CurrencyCounter kind="wallet" amount={gobblars} />}
    {showBank && <CurrencyCounter kind="bank" amount={bank} />}
  </div>;
}
export function GameBalanceSlot({ kind, bank, wallet, priority = 10 }) {
  const kernel = useOptionalApplicationKernel(), ref = React.useRef(null);
  React.useLayoutEffect(() => {
    if (kernel && ref.current) return currencyAnchors.register(ref.current, { kind, bank, priority });
  }, [kernel, kind, bank, priority]);
  return kernel ? <span ref={ref} className="currency-slot" aria-hidden="true" />
    : <CurrencyCounter kind={kind} amount={kind === 'bank' ? bank : wallet} />;
}
export default function GameBalances({ bank, priority = 50, className = '' }) {
  return <div className={`game-balances ${className}`}>
    <GameBalanceSlot kind="wallet" priority={priority} />
    <GameBalanceSlot kind="bank" bank={bank} priority={priority} />
  </div>;
}
export function GameBalancesRuntime() {
  return INFORTUNE_CLIENT_ENABLED ? <FinaleBalancesRuntime /> : <BalancesRuntime />;
}
function FinaleBalancesRuntime() {
  const finale = useFeatureRuntime('infortuneFinale');
  const finaleWalletHold = useFeatureSelector(finale, state => state.rewardWalletHold);
  return <BalancesRuntime finaleWalletHold={finaleWalletHold} />;
}
function BalancesRuntime({ finaleWalletHold = null }) {
  const preferences = useFeatureRuntime('preferences'), balances = useFeatureRuntime('gameBalances');
  const wheel = useFeatureRuntime('infortune');
  const wallet = useFeatureSelector(preferences, state => state.gobblarsBalance);
  const bank = useFeatureSelector(balances, state => state.bank);
  const withheld = useFeatureSelector(balances, state => state.walletWithheld);
  const reward = useFeatureSelector(balances, state => state.gobbleReward);
  const bankHold = useFeatureSelector(balances, state => state.bankHold);
  const hold = useFeatureSelector(wheel, state => state.visible && !state.presented && !state.gainLanded && state.stage !== 'waiting');
  const launchBank = useFeatureSelector(wheel, state => state.launchGainLanded ? state.economy?.members?.[state.plateau?.self?.id]?.launchBank : null);
  const positions = React.useSyncExternalStore(currencyAnchors.store.subscribe, currencyAnchors.store.getState);
  React.useLayoutEffect(() => currencyAnchors.start(), []);
  const shown = React.useRef({ wallet, bank });
  const lastPositions = React.useRef({ wallet: { x: 0, y: 0, width: 0, height: 0 }, bank: { x: 0, y: 0, width: 0, height: 0 } });
  for (const kind of ['wallet', 'bank']) if (positions[kind]) lastPositions.current[kind] = positions[kind];
  if (!hold) shown.current = { wallet: Number.isFinite(finaleWalletHold) ? finaleWalletHold : Number.isFinite(wallet) ? Math.max(0, wallet - withheld) : wallet,
    bank: reward && reward.stage !== 'landed' ? bankHold : Number.isFinite(positions.bank?.bank) ? positions.bank.bank : bank };
  else if (Number.isFinite(launchBank)) shown.current = { ...shown.current, bank: launchBank };
  return createPortal(<div className="currency-layer">
    <CurrencyCounter kind="wallet" amount={shown.current.wallet} position={lastPositions.current.wallet} hidden={!positions.wallet} />
    <CurrencyCounter kind="bank" amount={shown.current.bank} position={lastPositions.current.bank} hidden={!positions.bank} />
    <GobbleRewardAnimation reward={reward} positions={lastPositions.current} />
  </div>, document.body);
}
