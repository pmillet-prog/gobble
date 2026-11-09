import React from "react";
import { WHEEL_SOUND_ASSETS } from "./wheelSoundAssets.js";
import { createWheelSoundtrack } from "./createWheelSoundtrack.js";
import { deferWheelSetup } from "./wheelScenePreparation.js";
import { wheelAudioAlreadyAllowed } from "./wheelAudioPreload.js";
import { useOptionalApplicationKernel } from '../../src/app/react/ApplicationRuntimeProvider.jsx';
import { readStoredPreferences } from '../../src/features/preferences/createPreferencesFeature.js';

export function useWheelSoundtrack(muted, audioEvents) {
  const kernel = useOptionalApplicationKernel();
  const player = React.useRef(null), allowedToStart = React.useRef(false);
  const latestMuted = React.useRef(muted); latestMuted.current = muted;
  const [status, setStatus] = React.useState("loading");
  React.useEffect(() => deferWheelSetup(() => {
    const instance = createWheelSoundtrack({ urls: WHEEL_SOUND_ASSETS, onStatus: setStatus });
    const lease = kernel?.features.acquire('preferences');
    let closing = false;
    const applyIntroPreference = () => {
      const settings = lease?.feature.store.getState() || readStoredPreferences();
      instance.setIntroMuted(settings.soundWheelIntroEnabled === false);
      if (closing && (settings.isSfxMuted || settings.soundMasterVolume === 0)) instance.setMuted(true);
    };
    applyIntroPreference();
    const releasePreference = lease?.feature.store.subscribe(applyIntroPreference);
    player.current = instance; audioEvents.current = instance.handleWheel; instance.setMuted(latestMuted.current); instance.prepare();
    // Live players have already clicked/typed during the round. Preserve the
    // automatic intro when the document is activated; a fresh workshop waits.
    if (wheelAudioAlreadyAllowed()) void instance.unlock();
    const visibility = () => instance.setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    if (document.hidden) visibility();
    return () => {
      closing = true; audioEvents.current = null; player.current = null;
      const release = () => { document.removeEventListener("visibilitychange", visibility); releasePreference?.(); lease?.release(); };
      const completion = instance.dispose();
      // Keep mute/background controls alive for the brief applause tail.
      if (completion) void completion.then(release, release);
      else release();
    };
  }), [audioEvents, kernel]);
  React.useEffect(() => { player.current?.setMuted(muted); }, [muted]);
  React.useEffect(() => {
    if (status !== "blocked" && status !== "loading") return;
    const unlock = () => { void player.current?.unlock(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [status]);
  // An unavailable sound must never block the game. Once started, muting or an
  // OS audio interruption must not unexpectedly rewind / freeze the camera.
  if (muted || ["ready", "error", "unavailable"].includes(status)) allowedToStart.current = true;
  const sync = React.useCallback(state => player.current?.syncCamera(state), []);
  const unlock = React.useCallback(() => { void player.current?.unlock(); }, []);
  const preview = React.useCallback(id => {
    void player.current?.unlock().then(() => player.current?.preview(id));
  }, []);
  const previewAudience = React.useCallback(id => {
    void player.current?.unlock().then(() => player.current?.previewAudience(id));
  }, []);
  const exchange = React.useCallback((exchange, selfId, id) => player.current?.handleWheel({ type: "exchange", exchange, selfId, id }), []);
  return { ready: allowedToStart.current, status, sync, unlock, preview, previewAudience, exchange };
}
