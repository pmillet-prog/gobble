import React from 'react';
import { useOptionalApplicationKernel } from '../../../app/react/ApplicationRuntimeProvider.jsx';
import { normalizeSoundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT } from '../../../audio/audioPreferences.js';
import themeSound from '../../../assets/infortune/finale-theme.mp3';
import './finaleThemeReveal.css';

export default function FinaleThemeReveal({ category }) {
  const kernel = useOptionalApplicationKernel();
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    setVisible(false);
    const audio = new Audio(themeSound), lease = kernel?.features.acquire('preferences');
    audio.preload = 'auto';
    const settings = () => {
      const value = lease?.feature.store.getState() || {};
      audio.volume = normalizeSoundMasterVolume(value.soundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT);
      audio.muted = !!value.isSfxMuted;
      if (audio.muted || !audio.volume) audio.pause();
    };
    settings(); const unsubscribe = lease?.feature.store.subscribe(settings);
    const timer = setTimeout(() => {
      setVisible(true);
      if (!document.hidden && !audio.muted && audio.volume) void audio.play().catch(() => {});
    }, 1800);
    const visibility = () => { if (document.hidden) audio.pause(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearTimeout(timer); unsubscribe?.(); lease?.release(); audio.pause(); audio.removeAttribute('src'); audio.load();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [category, kernel]);
  return <footer className="infortune-finale-board__theme" data-visible={visible} aria-hidden={!visible} role={visible ? 'status' : undefined}>
    {visible && <><span>Thème · indice</span><h2>{category}</h2></>}
  </footer>;
}
