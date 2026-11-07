import React from 'react';
import { PRESENTERS, PresenterButton, HomeActionButton } from '../../features/presenters/MobilePresenterActionBar.jsx';
import { useChatUnreadState } from '../../features/chat/useChatUnreadState.js';
import { UI_IMAGE_KEYS } from '../../assets/uiAssetManifest.js';
import { useFeatureRuntime } from '../../app/react/useFeatureRuntime.js';
import './infortuneSocialDock.css';

export { InfortuneSocialDockContext } from './infortuneSurfaceContexts.js';
export default function InfortuneSocialDock({ onOpenChat, onOpenPlayers }) {
  const { mobileChatUnreadCount } = useChatUnreadState();
  const surface = useFeatureRuntime('chatSurface');
  const stats = useFeatureRuntime('stats');
  return <nav className="infortune-social-dock" aria-label="Commandes de jeu pendant la roue">
    <HomeActionButton imageKey={UI_IMAGE_KEYS.home.players} imageScale={1.3} size="var(--wheel-dock-button)" label="Ouvrir la liste des joueurs" onClick={onOpenPlayers || surface.openPlayers} />
    {PRESENTERS.map(presenter => <PresenterButton key={presenter.key} presenter={presenter} disabled
      disabledReason="indisponible pendant la roue" size="var(--wheel-dock-button)" />)}
    <HomeActionButton imageKey={UI_IMAGE_KEYS.home.stats} size="var(--wheel-dock-button)" label="Ouvrir les statistiques" onClick={() => stats.openOverlay()} />
    <HomeActionButton imageKey={UI_IMAGE_KEYS.home.chat} size="var(--wheel-dock-button)" isChatLauncher label="Ouvrir le chat" onClick={onOpenChat || surface.openChat} unreadCount={mobileChatUnreadCount} />
  </nav>;
}
