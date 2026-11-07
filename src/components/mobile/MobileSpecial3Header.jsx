import React from 'react';
import { RoundClockSeconds } from '../../features/clock/RoundClockDisplay.jsx';
import { GameBalanceSlot } from '../../features/gobblars/GameBalances.jsx';
import { useChatUnreadState } from '../../features/chat/useChatUnreadState.js';
import { HomeActionButton } from '../../features/presenters/MobilePresenterActionBar.jsx';
import { UI_IMAGE_KEYS } from '../../assets/uiAssetManifest.js';
import MobileConnectionLabel from '../../features/mobile/MobileConnectionLabel.jsx';

export default function MobileSpecial3Header({ filledCount, target, timerSize, isLoggedIn, onOpenChat, onOpenSettings }) {
  const { mobileChatUnreadCount } = useChatUnreadState();
  return <>
    <div className="currency-header currency-header--special3">
      <GameBalanceSlot kind="wallet" />
      {isLoggedIn && <div className="currency-header__chat"><HomeActionButton imageKey={UI_IMAGE_KEYS.live.chat} size="100%"
        label="Ouvrir le chat" isChatLauncher onClick={onOpenChat} unreadCount={mobileChatUnreadCount} /></div>}
      <div className="currency-header__center"><strong style={{ fontSize: Math.min(44, timerSize), lineHeight: 1 }}><RoundClockSeconds /></strong>
        <small>{filledCount}/{target} mots validés</small></div>
      <button type="button" className="currency-header__settings" onClick={onOpenSettings} aria-label="Paramètres"><span className="material-symbols-outlined" aria-hidden="true">settings</span></button>
      <GameBalanceSlot kind="bank" />
    </div>
    <div className="text-center text-[9px] leading-tight opacity-70"><MobileConnectionLabel fallback="Manche spéciale" /></div>
  </>;
}
