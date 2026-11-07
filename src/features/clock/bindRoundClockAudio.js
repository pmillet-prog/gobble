import { SFX_KEYS } from "../../assets/assetKeys.js";
import { isAudioPageHidden } from '../../audio/foregroundAudio.js';

export function bindRoundClockAudio({
  clock,
  getContext,
  playOneShotAudio,
  playTickSound,
  documentTarget = globalThis.document,
}) {
  let dailyTictocPlayed = false;
  let tickCountdownPlayed = false;
  let resetToken = null;

  const handleClockChange = () => {
    const { remainingSeconds: tick, running } = clock.store.getState();
    const context = getContext();
    if (!Object.is(resetToken, context.resetToken)) {
      resetToken = context.resetToken;
      dailyTictocPlayed = false;
      tickCountdownPlayed = false;
    }

    if (context.phase !== 'playing' || !running) return;
    const audible = !isAudioPageHidden(documentTarget);
    // Consume missed cues silently. A foreground resync must not replay the
    // beginning of a clip whose countdown has already elapsed in part.
    if (context.isLiveSpecial3WordsMode && tick <= 3 && !dailyTictocPlayed) {
      dailyTictocPlayed = true;
      if (audible && tick === 3) playOneShotAudio(SFX_KEYS.tictoc, {
        cooldownKey: "dailyTictoc",
        eqKey: "countdownTick",
        allowQueue: false,
      });
    }

    if (tick <= 10 && !tickCountdownPlayed) {
      tickCountdownPlayed = true;
      if (audible && tick === 10) playTickSound({
        isTargetRound:
          context.specialRoundType === "target_long" ||
          context.specialRoundType === "target_score",
      });
    }
  };

  const unsubscribe = clock.store.subscribe(handleClockChange);
  handleClockChange();
  return unsubscribe;
}
