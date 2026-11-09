import { canNativePullToRefresh } from '../mobile/nativePullToRefreshPolicy.js';

export function canPromptClientUpdate(state, getFeatureState = () => null, hasLocalDialog = false) {
  const finale = getFeatureState('infortuneFinale');
  if (finale?.phase && finale.phase !== 'idle') return false;
  const wheel = getFeatureState('infortune');
  if (wheel?.stage && wheel.stage !== 'idle') return false;
  // Results between rounds are still part of the tournament. Wait for the
  // actual lobby, including the end of the wheel finale and its standings.
  if (state.navigation.view === 'live') {
    if (state.game.phase !== 'lobby') return false;
    const lobby = state.realtime?.tournamentLobby;
    if (lobby && (lobby.isOpen !== true || lobby.phase !== 'ready')) return false;
    const gameplay = getFeatureState('gameplaySession');
    // The session retains its previous result until the next round starts.
    const previousResults = lobby?.isOpen === true && ['results', 'intermission'].includes(gameplay?.phase);
    if (gameplay?.phase && !['idle', 'lobby'].includes(gameplay.phase) && !previousResults) return false;
    return canNativePullToRefresh({ ...state, navigation: { ...state.navigation, view: 'home' },
      session: { ...state.session, isLoggedIn: false } }, getFeatureState, hasLocalDialog);
  }
  return canNativePullToRefresh(state, getFeatureState, hasLocalDialog);
}
