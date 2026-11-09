import React from 'react';
import { createPortal } from 'react-dom';
import { useOptionalApplicationKernel } from '../../../app/react/ApplicationRuntimeProvider.jsx';
import { GOBBLARS_SPEND_SOUND_URL } from '../../../audio/audioAssets.js';
import { normalizeSoundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT } from '../../../audio/audioPreferences.js';
import { resolveSoundSettings } from '../../../audio/equalizer.js';
import { fadeOutMediaAudio } from '../../../audio/fadeOutMediaAudio.js';
import applauseUrl from '../../../../dev/infortune-perspective/assets/audience-top.mp3';
import './finaleWinReward.css';

const number = value => value.toLocaleString('fr-FR');

export default function FinaleWinReward({ bank, outcome, onLand }) {
  const kernel = useOptionalApplicationKernel(), source = React.useRef(null), callback = React.useRef(onLand);
  const [flight, setFlight] = React.useState(null), [landed, setLanded] = React.useState(false);
  callback.current = onLand;
  React.useLayoutEffect(() => {
    const audio = new Audio(GOBBLARS_SPEND_SOUND_URL), applause = new Audio(applauseUrl), lease = kernel?.features.acquire('preferences');
    const sounds = [audio, applause];
    let closing = false;
    for (const sound of sounds) sound.preload = 'auto';
    const preferences = () => {
      const settings = lease?.feature.store.getState() || {};
      const volume = normalizeSoundMasterVolume(settings.soundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT);
      audio.volume = volume * resolveSoundSettings('cashRegister').volume;
      if (!closing) applause.volume = volume * .95;
      for (const sound of sounds) {
        sound.muted = !!settings.isSfxMuted;
        if (sound.muted || !volume || !sound.volume) sound.pause();
      }
    };
    preferences(); const unsubscribe = lease?.feature.store.subscribe(preferences);
    let done = false;
    const land = () => { if (done) return; done = true; setFlight(null); setLanded(true); callback.current?.(); };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => {
      if (document.hidden) { land(); return; }
      if (!applause.muted && applause.volume) void applause.play().catch(() => {});
      if (outcome.gobblars > 0 && !audio.muted && audio.volume) void audio.play().catch(() => {});
      if (reduced || outcome.gobblars <= 0) { land(); return; }
      const from = source.current?.getBoundingClientRect();
      const target = document.querySelector('.currency-layer .currency-counter--wallet')
        || source.current?.closest('.infortune-game')?.querySelector('.currency-counter--wallet');
      const to = target?.getBoundingClientRect();
      if (!from?.width || !to?.width) { land(); return; }
      setFlight({ x: from.x + from.width / 2, y: from.y + from.height / 2,
        dx: to.x + to.width / 2 - from.x - from.width / 2, dy: to.y + to.height / 2 - from.y - from.height / 2 });
    }, 30);
    const landing = setTimeout(land, 1600);
    const visibility = () => { if (document.hidden) { for (const sound of sounds) sound.pause(); clearTimeout(timer); clearTimeout(landing); land(); } };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      closing = true;
      clearTimeout(timer); clearTimeout(landing);
      audio.pause(); audio.removeAttribute('src'); audio.load();
      void fadeOutMediaAudio(applause).then(() => { unsubscribe?.(); lease?.release(); });
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [kernel]);
  return <div className="finale-win-reward" data-landed={landed}>
    <p className="finale-win-reward__points">+{number(outcome.points)} points</p>
    <div className="finale-win-reward__conversion" ref={source} role="status">
      <span><img src="/ui/currency/euro-cartoon-v1.webp" alt="" /><strong>{number(bank)} €</strong><small>Cagnotte restante</small></span>
      <b aria-hidden="true">→</b>
      <span><img src="/ui/currency/gobblar-cartoon-v2.webp" alt="" /><strong>+{number(outcome.gobblars)}</strong><small>gobblars</small></span>
    </div>
    <p className="finale-win-reward__caption">{outcome.gobblars > 0 ? 'Ta cagnotte se transforme en gobblars !' : 'Les points sont à toi !'}</p>
    {flight && createPortal(<div className="finale-win-reward__flight" aria-hidden="true"
      style={{ left: flight.x, top: flight.y, '--payout-dx': `${flight.dx}px`, '--payout-dy': `${flight.dy}px` }}>
      <img src="/ui/currency/gobblar-cartoon-v2.webp" alt="" /><strong>+{number(outcome.gobblars)}</strong>
    </div>, document.body)}
  </div>;
}
