import React from 'react';
import { SPECIAL_FOUND_SOUND_URL } from '../../../audio/audioAssets.js';
import { normalizeSoundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT } from '../../../audio/audioPreferences.js';
import { resolveSoundSettings } from '../../../audio/equalizer.js';
import { useFeatureRuntime } from '../../../app/react/useFeatureRuntime.js';

export default function useFinaleWinSound(feature, selfNick, enabled) {
  const preferences = useFeatureRuntime('preferences');
  React.useEffect(() => {
    if (!enabled) return;
    const audio = new Audio(SPECIAL_FOUND_SOUND_URL);
    audio.preload = 'auto';
    const configure = () => {
      const settings = preferences.store.getState();
      audio.volume = normalizeSoundMasterVolume(settings.soundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT) * resolveSoundSettings('specialFound').volume;
      audio.muted = !!settings.isSfxMuted;
      if (audio.muted || !audio.volume) audio.pause();
    };
    configure();
    const unsubscribe = preferences.store.subscribe(configure);
    const release = feature.subscribeWins(wins => {
      if (document.hidden || audio.muted || !audio.volume || !wins.some(row => row.nick !== selfNick)) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    });
    const hide = () => { if (document.hidden) audio.pause(); };
    document.addEventListener('visibilitychange', hide);
    return () => { release(); unsubscribe(); document.removeEventListener('visibilitychange', hide); audio.pause(); audio.removeAttribute('src'); audio.load(); };
  }, [feature, preferences, selfNick, enabled]);
}
