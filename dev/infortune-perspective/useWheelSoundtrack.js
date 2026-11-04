import React from "react";
import { WHEEL_SOUND_ASSETS } from "./wheelSoundAssets.js";
import { createWheelSoundtrack } from "./createWheelSoundtrack.js";
import { deferWheelSetup } from "./wheelScenePreparation.js";
import { wheelAudioAlreadyAllowed } from "./wheelAudioPreload.js";

export function useWheelSoundtrack(muted, audioEvents) {
  const player = React.useRef(null), allowedToStart = React.useRef(false);
  const latestMuted = React.useRef(muted); latestMuted.current = muted;
  const [status, setStatus] = React.useState("loading");
  React.useEffect(() => deferWheelSetup(() => {
    const instance = createWheelSoundtrack({ urls: WHEEL_SOUND_ASSETS, onStatus: setStatus });
    player.current = instance; audioEvents.current = instance.handleWheel; instance.setMuted(latestMuted.current); instance.prepare();
    // Live players have already clicked/typed during the round. Preserve the
    // automatic intro when the document is activated; a fresh workshop waits.
    if (wheelAudioAlreadyAllowed()) void instance.unlock();
    const visibility = () => instance.setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    if (document.hidden) visibility();
    return () => {
      document.removeEventListener("visibilitychange", visibility); audioEvents.current = null;
      instance.dispose(); player.current = null;
    };
  }), [audioEvents]);
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
  return { ready: allowedToStart.current, status, sync, unlock, preview, previewAudience };
}
