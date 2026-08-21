import React from "react";
import { FINALE_TYPE } from "../../shared/finaleRules.js";

export default function useMobileRoundIntro(
  clearMobileRoundIntroTimers,
  clearTileIntroAnimationFnRef,
  createMonotonicDeadline,
  flushSync,
  getDeadlineRemainingSeconds,
  getDelayUntilDeadlineWindow,
  getMonotonicNowMs,
  getNextDeadlineTickDelay,
  getNowServerMs,
  getSpecialRoundDescription,
  getSpecialRoundDisplayLabel,
  inputLockedRef,
  introCountdownTickGuardRef,
  isMobileLayoutRef,
  MOBILE_ROUND_INTRO_COUNTDOWN_FROM,
  MOBILE_ROUND_INTRO_COUNTDOWN_TOTAL_MS,
  MOBILE_ROUND_INTRO_GO_LABEL,
  MOBILE_ROUND_INTRO_GO_TOTAL_MS,
  MOBILE_ROUND_INTRO_INTRO_FADE_IN_MS,
  MOBILE_ROUND_INTRO_TILE_HOLD_MS,
  MOBILE_ROUND_INTRO_TITLE_FADE_MS,
  MOBILE_ROUND_INTRO_TITLE_HOLD_MS,
  mobileRoundIntroSuppressRoundStartRef,
  mobileRoundIntroTimersRef,
  mobileRoundIntroTokenRef,
  playCountdownTickSound,
  playRoundStartSound,
  roundId,
  roundIdRef,
  roundIntroServerWindowRef,
  roundIntroStartedForRoundRef,
  roundStartSoundRef,
  setInputLocked,
  setMobileRoundIntroCountdown,
  setMobileRoundIntroHideTiles,
  setMobileRoundIntroRoundDescription,
  setMobileRoundIntroRoundLabel,
  setMobileRoundIntroRoundTypeLabel,
  setMobileRoundIntroStage,
  specialRound,
  stopIntroCountdownSound,
  tournament,
  triggerTileIntroAnimationFnRef,
) {

  const stopMobileRoundIntro = React.useCallback(
    ({ unlockInput = true, keepRoundStartSuppressed = false } = {}) => {
      mobileRoundIntroTokenRef.current += 1;
      clearMobileRoundIntroTimers();
      clearTileIntroAnimationFnRef.current?.();
      stopIntroCountdownSound({ fadeMs: 80 });
      introCountdownTickGuardRef.current = { at: 0, token: 0, value: null, roundId: null };
      setMobileRoundIntroStage("idle");
      setMobileRoundIntroCountdown(null);
      setMobileRoundIntroHideTiles(false);
      if (!keepRoundStartSuppressed) {
        mobileRoundIntroSuppressRoundStartRef.current = false;
      }
      if (unlockInput) {
        setInputLocked(false);
        inputLockedRef.current = false;
      }
    },
    [clearMobileRoundIntroTimers]
  );

  const startMobileRoundIntro = React.useCallback(() => {
    const roundKey = roundIdRef.current || null;
    if (roundKey) {
      roundIntroStartedForRoundRef.current = roundKey;
    }
    const introWindow = roundIntroServerWindowRef.current || {};
    const nowServerMs = getNowServerMs();
    const serverStartsAt = Number.isFinite(introWindow.startsAt)
      ? Number(introWindow.startsAt)
      : null;
    const introMsFallback = Number.isFinite(introWindow.introMs)
      ? Math.max(0, Number(introWindow.introMs))
      : 0;
    const targetStartAt = Number.isFinite(serverStartsAt)
      ? serverStartsAt
      : nowServerMs + introMsFallback;
    const targetStartMonotonicMs = createMonotonicDeadline({
      deadlineServerMs: targetStartAt,
      monotonicNowMs: getMonotonicNowMs(),
      serverNowMs: nowServerMs,
    });
    const hasTimedIntro =
      Number.isFinite(targetStartAt) && targetStartAt > nowServerMs + 80;
    if (!hasTimedIntro) {
      stopMobileRoundIntro({ unlockInput: true, keepRoundStartSuppressed: false });
      return;
    }

    const token = mobileRoundIntroTokenRef.current + 1;
    mobileRoundIntroTokenRef.current = token;
    clearMobileRoundIntroTimers();
    clearTileIntroAnimationFnRef.current?.();
    mobileRoundIntroSuppressRoundStartRef.current = true;
    setInputLocked(true);
    inputLockedRef.current = true;
    const roundNow =
      Number.isFinite(tournament?.round) && tournament.round > 0
        ? tournament.round
        : Number.isFinite(tournament?.nextRound) && tournament.nextRound > 0
        ? tournament.nextRound
        : null;
    const roundTotal =
      Number.isFinite(tournament?.totalRounds) && tournament.totalRounds > 0
        ? tournament.totalRounds
        : null;
    const roundLabel =
      roundNow && roundTotal
        ? `MANCHE ${roundNow}/${roundTotal}`
        : roundNow
        ? `MANCHE ${roundNow}`
        : "MANCHE";
    const specialLabel = specialRound?.isSpecial
      ? specialRound?.type === FINALE_TYPE
        ? "FINALE : BONUS DE TUILES ×2"
        : `MANCHE SPECIALE : ${String(getSpecialRoundDisplayLabel(specialRound)).toUpperCase()}`
      : "manche classique";
    const specialDescription = specialRound?.isSpecial
      ? getSpecialRoundDescription(specialRound)
      : "";

    setMobileRoundIntroRoundLabel(roundLabel);
    setMobileRoundIntroRoundTypeLabel(specialLabel);
    setMobileRoundIntroRoundDescription(specialDescription);
    setMobileRoundIntroCountdown(null);
    setMobileRoundIntroHideTiles(true);
    setMobileRoundIntroStage(isMobileLayoutRef.current ? "intro_fade_in" : "title");

    const isStale = () => mobileRoundIntroTokenRef.current !== token;
    const scheduleStep = (callback, delayMs) => {
      const timerId = setTimeout(() => {
        mobileRoundIntroTimersRef.current = mobileRoundIntroTimersRef.current.filter(
          (id) => id !== timerId
        );
        callback();
      }, Math.max(0, delayMs));
      mobileRoundIntroTimersRef.current.push(timerId);
    };
    const finishIntro = () => {
      if (isStale()) return;
      setMobileRoundIntroCountdown(MOBILE_ROUND_INTRO_GO_LABEL);
      setInputLocked(false);
      inputLockedRef.current = false;
      if (roundIdRef.current) {
        roundStartSoundRef.current = roundIdRef.current;
      }
      playRoundStartSound();
      scheduleStep(() => {
        if (isStale()) return;
        stopMobileRoundIntro({
          unlockInput: false,
          keepRoundStartSuppressed: false,
        });
      }, MOBILE_ROUND_INTRO_GO_TOTAL_MS);
    };
    const runCountdownPhase = () => {
      if (isStale()) return;
      let lastValue = null;
      const updateCountdown = () => {
        if (isStale()) return;
        const now = getMonotonicNowMs();
        const waitUntilCountdownWindowMs = getDelayUntilDeadlineWindow({
          deadlineMonotonicMs: targetStartMonotonicMs,
          monotonicNowMs: now,
          windowMs: MOBILE_ROUND_INTRO_COUNTDOWN_TOTAL_MS,
        });
        if (waitUntilCountdownWindowMs > 0) {
          scheduleStep(updateCountdown, waitUntilCountdownWindowMs);
          return;
        }
        const value = getDeadlineRemainingSeconds({
          deadlineMonotonicMs: targetStartMonotonicMs,
          maxSeconds: MOBILE_ROUND_INTRO_COUNTDOWN_FROM,
          monotonicNowMs: now,
        });
        if (value <= 0) {
          finishIntro();
          return;
        }
        if (value !== lastValue) {
          lastValue = value;
          setMobileRoundIntroCountdown(value);
          playCountdownTickSound(value, token);
        }
        scheduleStep(
          updateCountdown,
          getNextDeadlineTickDelay({
            deadlineMonotonicMs: targetStartMonotonicMs,
            displayedSeconds: value,
            monotonicNowMs: now,
          })
        );
      };
      updateCountdown();
    };

    scheduleStep(() => {
      if (isStale()) return;
      scheduleStep(() => {
        if (isStale()) return;
        setMobileRoundIntroStage("title");
        scheduleStep(() => {
          if (isStale()) return;
          setMobileRoundIntroStage("title_fade_out");
          scheduleStep(() => {
            if (isStale()) return;
            flushSync(() => {
              setMobileRoundIntroStage("grid_intro");
              setMobileRoundIntroHideTiles(false);
            });
            const startTileIntro = () => {
              if (isStale()) return;
              const tileIntroMs = triggerTileIntroAnimationFnRef.current?.() || 0;
              scheduleStep(() => {
                if (isStale()) return;
                setMobileRoundIntroStage("countdown");
                runCountdownPhase();
              }, Math.max(0, tileIntroMs + MOBILE_ROUND_INTRO_TILE_HOLD_MS));
            };
            startTileIntro();
          }, MOBILE_ROUND_INTRO_TITLE_FADE_MS);
        }, MOBILE_ROUND_INTRO_TITLE_HOLD_MS);
      }, isMobileLayoutRef.current ? MOBILE_ROUND_INTRO_INTRO_FADE_IN_MS : 0);
    }, 0);
  }, [
    clearMobileRoundIntroTimers,
    tournament,
    specialRound,
    playCountdownTickSound,
    playRoundStartSound,
    roundId,
    stopMobileRoundIntro,
  ]);

  return { startMobileRoundIntro, stopMobileRoundIntro };
}
