import { SFX_KEYS } from "../../assets/assetKeys.js";

export function bindRoundClockAudio({
  clock,
  getContext,
  playOneShotAudio,
  playTickSound,
}) {
  let dailyTictocPlayed = false;
  let tickCountdownPlayed = false;
  let resetToken = null;

  const handleClockChange = () => {
    const tick = clock.store.getState().remainingSeconds;
    const context = getContext();
    if (!Object.is(resetToken, context.resetToken)) {
      resetToken = context.resetToken;
      dailyTictocPlayed = false;
      tickCountdownPlayed = false;
    }

    if (!context.isLiveSpecial3WordsMode || context.phase !== "playing") {
      dailyTictocPlayed = false;
    } else if (tick > 3) {
      dailyTictocPlayed = false;
    } else if (tick === 3 && !dailyTictocPlayed) {
      dailyTictocPlayed = true;
      playOneShotAudio(SFX_KEYS.tictoc, {
        cooldownKey: "dailyTictoc",
        eqKey: "countdownTick",
      });
    }

    if (context.phase !== "playing") {
      tickCountdownPlayed = false;
    } else if (tick > 10) {
      tickCountdownPlayed = false;
    } else if (tick > 0 && !tickCountdownPlayed) {
      tickCountdownPlayed = true;
      playTickSound({
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
