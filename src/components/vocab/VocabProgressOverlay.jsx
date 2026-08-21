import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getVocabLevelMeta } from "../../vocabRanks";

const VOCAB_OVERLAY_FADE_MS = 1000;
const VOCAB_OVERLAY_ZERO_DELAY_MS = 2000;
const VOCAB_OVERLAY_SEGMENT_MS = 2000;
const VOCAB_OVERLAY_WORDS_PER_SEGMENT = 10;
const VOCAB_OVERLAY_MIN_COUNT_MS = 650;
const VOCAB_OVERLAY_MAX_COUNT_MS = 5000;
const VOCAB_OVERLAY_ABSORB_MS = 2000;
const VOCAB_OVERLAY_END_HOLD_MS = 3000;
const VOCAB_OVERLAY_IMAGE_FADE_MS = 450;

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
const formatNumber = (value) =>
  typeof value === "number" ? value.toLocaleString("fr-FR") : null;


const VocabProgressOverlay = React.memo(
  React.forwardRef(function VocabProgressOverlay(
    {
      darkMode = false,
      fallbackLevel = null,
      getImageUrl = () => "",
      isMobileLayout = false,
      onVisibilityChange = null,
      playCloseSound = () => {},
      playVocabOverlayClingSound = () => {},
      playVocabOverlayTickSound = () => {},
      playVocabOverlayZeroSound = () => {},
      request = null,
      triggerConfettiBurst = () => {},
    },
    controllerRef
  ) {
  const [isVocabOverlayOpen, setIsVocabOverlayOpen] = useState(false);
  const [vocabOverlayPhase, setVocabOverlayPhase] = useState("idle");
  const [vocabOverlayAnimatedTotal, setVocabOverlayAnimatedTotal] = useState(0);
  const [vocabOverlayAnimatedDelta, setVocabOverlayAnimatedDelta] = useState(0);
  const [vocabOverlayBaseCount, setVocabOverlayBaseCount] = useState(0);
  const [vocabOverlayTargetCount, setVocabOverlayTargetCount] = useState(0);
  const [vocabOverlayWeeklyAnimatedTotal, setVocabOverlayWeeklyAnimatedTotal] = useState(0);
  const [vocabOverlayWeeklyAnimatedDelta, setVocabOverlayWeeklyAnimatedDelta] = useState(0);
  const [vocabOverlayWeeklyBaseCount, setVocabOverlayWeeklyBaseCount] = useState(0);
  const [vocabOverlayWeeklyTargetCount, setVocabOverlayWeeklyTargetCount] = useState(0);
  const [vocabOverlayAbsorbing, setVocabOverlayAbsorbing] = useState(false);
  const [vocabOverlayBounce, setVocabOverlayBounce] = useState(false);
  const [vocabOverlayRank, setVocabOverlayRank] = useState(null);
  const [vocabOverlayRankStart, setVocabOverlayRankStart] = useState(null);
  const [vocabOverlayRankEnd, setVocabOverlayRankEnd] = useState(null);
  const [vocabOverlayImageLevel, setVocabOverlayImageLevel] = useState(null);
  const [vocabOverlayImagePhase, setVocabOverlayImagePhase] = useState("idle");
  const [vocabOverlayHasLevelUp, setVocabOverlayHasLevelUp] = useState(false);
  const [vocabOverlayStartLevelKey, setVocabOverlayStartLevelKey] = useState(null);
  const [vocabOverlayAbsorbVec, setVocabOverlayAbsorbVec] = useState({ x: 0, y: 0 });
  const [vocabOverlayWords, setVocabOverlayWords] = useState([]);
  const [vocabOverlayCurrentWord, setVocabOverlayCurrentWord] = useState("");
  const [vocabOverlayShowRanking, setVocabOverlayShowRanking] = useState(false);
  const [vocabOverlayRace, setVocabOverlayRace] = useState(null);
  const [vocabOverlayWordFading, setVocabOverlayWordFading] = useState(false);
  const vocabOverlayTimersRef = useRef([]);
  const vocabOverlayRafRef = useRef(null);
  const vocabOverlayLastTickRef = useRef(0);
  const vocabOverlayDeltaRef = useRef(null);
  const vocabOverlayCursorRef = useRef(null);
  const vocabOverlayWordsRef = useRef([]);
  const lastRequestIdRef = useRef(null);

  function queueVocabOverlayTimer(timerId) {
    if (!timerId) return;
    vocabOverlayTimersRef.current.push(timerId);
  }

  function clearVocabOverlayTimers() {
    vocabOverlayTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    vocabOverlayTimersRef.current = [];
    if (vocabOverlayRafRef.current) {
      cancelAnimationFrame(vocabOverlayRafRef.current);
      vocabOverlayRafRef.current = null;
    }
  }

  function stopVocabOverlayAnimation() {
    clearVocabOverlayTimers();
    setIsVocabOverlayOpen(false);
    setVocabOverlayPhase("idle");
    setVocabOverlayAbsorbing(false);
    setVocabOverlayBounce(false);
    setVocabOverlayShowRanking(false);
    setVocabOverlayRace(null);
    setVocabOverlayWordFading(false);
    setVocabOverlayCurrentWord("");
    setVocabOverlayWeeklyAnimatedDelta(0);
  }

  function skipVocabOverlayAnimation() {
    if (!isVocabOverlayOpen) return;
    playCloseSound();
    clearVocabOverlayTimers();
    setVocabOverlayPhase("out");
    queueVocabOverlayTimer(
      setTimeout(() => {
        stopVocabOverlayAnimation();
      }, 220)
    );
  }

  function startVocabOverlayAnimation({
    baseCount,
    deltaCount,
    targetCount,
    weeklyBaseCount,
    weeklyDeltaCount,
    weeklyTargetCount,
    rankStart,
    rankEnd,
    raceSnapshot,
    words,
  }) {
    clearVocabOverlayTimers();
    setIsVocabOverlayOpen(true);
    setVocabOverlayPhase("in");
    setVocabOverlayBaseCount(baseCount);
    setVocabOverlayTargetCount(targetCount);
    setVocabOverlayAnimatedTotal(baseCount);
    setVocabOverlayAnimatedDelta(0);
    const safeWeeklyBaseCount = Number.isFinite(weeklyBaseCount)
      ? Math.max(0, weeklyBaseCount)
      : baseCount;
    const safeWeeklyTargetCount = Number.isFinite(weeklyTargetCount)
      ? Math.max(0, weeklyTargetCount)
      : safeWeeklyBaseCount + deltaCount;
    const safeWeeklyDeltaCount = Number.isFinite(weeklyDeltaCount)
      ? Math.max(0, weeklyDeltaCount)
      : Math.max(0, safeWeeklyTargetCount - safeWeeklyBaseCount);
    setVocabOverlayWeeklyBaseCount(safeWeeklyBaseCount);
    setVocabOverlayWeeklyTargetCount(safeWeeklyTargetCount);
    setVocabOverlayWeeklyAnimatedTotal(safeWeeklyBaseCount);
    setVocabOverlayWeeklyAnimatedDelta(0);
    setVocabOverlayAbsorbing(false);
    setVocabOverlayBounce(false);
    setVocabOverlayRank(rankStart);
    setVocabOverlayRankStart(rankStart);
    setVocabOverlayRankEnd(rankEnd);
    setVocabOverlayRace(raceSnapshot && typeof raceSnapshot === "object" ? raceSnapshot : null);
    const startLevel = getVocabLevelMeta(baseCount);
    setVocabOverlayImageLevel(startLevel);
    setVocabOverlayStartLevelKey(startLevel?.key || null);
    setVocabOverlayImagePhase("idle");
    setVocabOverlayHasLevelUp(false);
    setVocabOverlayAbsorbVec({ x: 0, y: 0 });
    setVocabOverlayShowRanking(false);
    setVocabOverlayWordFading(false);
    const safeWords = Array.isArray(words) ? words : [];
    vocabOverlayWordsRef.current = safeWords;
    setVocabOverlayWords(safeWords);
    setVocabOverlayCurrentWord(safeWords[0] || "");

    queueVocabOverlayTimer(
      setTimeout(() => {
        setVocabOverlayPhase("idle");
      }, VOCAB_OVERLAY_FADE_MS)
    );

    queueVocabOverlayTimer(
      setTimeout(() => {
        const soundDeltaCount = Math.max(0, safeWeeklyDeltaCount, deltaCount || 0);
        if (!soundDeltaCount || soundDeltaCount <= 0) {
          playVocabOverlayZeroSound();
          setVocabOverlayBounce(true);
          queueVocabOverlayTimer(setTimeout(() => setVocabOverlayBounce(false), 700));
          queueVocabOverlayTimer(
            setTimeout(() => {
              setVocabOverlayPhase("out");
              queueVocabOverlayTimer(
                setTimeout(() => {
                  stopVocabOverlayAnimation();
                }, VOCAB_OVERLAY_FADE_MS)
              );
            }, VOCAB_OVERLAY_END_HOLD_MS)
          );
          return;
        }

        const perWordMs = VOCAB_OVERLAY_SEGMENT_MS / VOCAB_OVERLAY_WORDS_PER_SEGMENT;
        const linearDurationMs = soundDeltaCount * perWordMs;
        const durationMs = clampValue(
          linearDurationMs,
          VOCAB_OVERLAY_MIN_COUNT_MS,
          VOCAB_OVERLAY_MAX_COUNT_MS
        );
        const accelStrength = clampValue(
          (linearDurationMs - durationMs) / Math.max(1, linearDurationMs),
          0,
          1
        );
        const accelPower = 1 + accelStrength * 3.2;
        const startAt = performance.now();
        vocabOverlayLastTickRef.current = 0;

        const step = (now) => {
          const elapsed = now - startAt;
          const t = Math.min(1, Math.max(0, elapsed / durationMs));
          const eased =
            accelStrength > 0.01
              ? (Math.exp(accelPower * t) - 1) / (Math.exp(accelPower) - 1)
              : t;
          const currentDelta = Math.round(deltaCount * eased);
          const currentWeeklyDelta = Math.round(safeWeeklyDeltaCount * eased);
          const currentTotal = baseCount + currentDelta;
          const currentWeeklyTotal = safeWeeklyBaseCount + currentWeeklyDelta;
          setVocabOverlayAnimatedDelta(currentDelta);
          setVocabOverlayAnimatedTotal(currentTotal);
          setVocabOverlayWeeklyAnimatedDelta(currentWeeklyDelta);
          setVocabOverlayWeeklyAnimatedTotal(currentWeeklyTotal);

          while (vocabOverlayLastTickRef.current < currentWeeklyDelta) {
            vocabOverlayLastTickRef.current += 1;
            playVocabOverlayTickSound(vocabOverlayLastTickRef.current);
            const wordList = vocabOverlayWordsRef.current;
            if (wordList && wordList.length) {
              const idx = Math.min(vocabOverlayLastTickRef.current - 1, wordList.length - 1);
              const nextWord = wordList[idx] || "";
              setVocabOverlayCurrentWord(nextWord);
            }
          }

          if (t < 1) {
            vocabOverlayRafRef.current = requestAnimationFrame(step);
          } else {
            setVocabOverlayAnimatedDelta(deltaCount);
            setVocabOverlayAnimatedTotal(targetCount);
            setVocabOverlayWeeklyAnimatedDelta(safeWeeklyDeltaCount);
            setVocabOverlayWeeklyAnimatedTotal(safeWeeklyTargetCount);
            if (Number.isFinite(rankEnd)) {
              setVocabOverlayRank(rankEnd);
            }
            setVocabOverlayBounce(true);
            const absorbDelayMs = 420;
            queueVocabOverlayTimer(
              setTimeout(() => {
                setVocabOverlayBounce(false);
                const deltaEl = vocabOverlayDeltaRef.current;
                const cursorEl = vocabOverlayCursorRef.current;
                if (deltaEl && cursorEl) {
                  const deltaRect = deltaEl.getBoundingClientRect();
                  const cursorRect = cursorEl.getBoundingClientRect();
                  const dx =
                    cursorRect.left +
                    cursorRect.width / 2 -
                    (deltaRect.left + deltaRect.width / 2);
                  const dy =
                    cursorRect.top +
                    cursorRect.height / 2 -
                    (deltaRect.top + deltaRect.height / 2);
                  setVocabOverlayAbsorbVec({
                    x: Math.round(dx),
                    y: Math.round(dy),
                  });
                }
                setVocabOverlayWordFading(true);
                queueVocabOverlayTimer(
                  setTimeout(() => {
                    setVocabOverlayShowRanking(true);
                    setVocabOverlayWordFading(false);
                  }, 350)
                );
                setVocabOverlayAbsorbing(true);
                queueVocabOverlayTimer(
                  setTimeout(() => {
                    playVocabOverlayClingSound();
                  }, VOCAB_OVERLAY_ABSORB_MS)
                );
                queueVocabOverlayTimer(
                  setTimeout(() => {
                    setVocabOverlayPhase("out");
                    queueVocabOverlayTimer(
                      setTimeout(() => {
                        stopVocabOverlayAnimation();
                      }, VOCAB_OVERLAY_FADE_MS)
                    );
                  }, VOCAB_OVERLAY_ABSORB_MS + VOCAB_OVERLAY_END_HOLD_MS)
                );
              }, absorbDelayMs)
            );
          }
        };

        vocabOverlayRafRef.current = requestAnimationFrame(step);
      }, VOCAB_OVERLAY_ZERO_DELAY_MS)
    );
  }


  useImperativeHandle(controllerRef, () => ({
    skip: skipVocabOverlayAnimation,
    start: startVocabOverlayAnimation,
    stop: stopVocabOverlayAnimation,
  }));

  useEffect(() => {
    const requestId = request?.id;
    if (requestId == null || lastRequestIdRef.current === requestId) return;
    lastRequestIdRef.current = requestId;
    startVocabOverlayAnimation(request.payload || {});
  }, [request]);

  useEffect(() => {
    onVisibilityChange?.(isVocabOverlayOpen);
  }, [isVocabOverlayOpen, onVisibilityChange]);

  useEffect(() => {
    if (!isVocabOverlayOpen) return;
    const nextLevel = getVocabLevelMeta(vocabOverlayAnimatedTotal);
    if (!nextLevel || !vocabOverlayImageLevel) return;
    if (nextLevel.key === vocabOverlayImageLevel.key) return;
    if (vocabOverlayImagePhase !== "idle") return;
    if (vocabOverlayStartLevelKey && nextLevel.key !== vocabOverlayStartLevelKey) {
      setVocabOverlayHasLevelUp(true);
    }
    setVocabOverlayImagePhase("out");
    queueVocabOverlayTimer(
      setTimeout(() => {
        setVocabOverlayImageLevel(nextLevel);
        setVocabOverlayImagePhase("in");
        triggerConfettiBurst("gobble");
      }, VOCAB_OVERLAY_IMAGE_FADE_MS)
    );
    queueVocabOverlayTimer(
      setTimeout(() => {
        setVocabOverlayImagePhase("idle");
      }, VOCAB_OVERLAY_IMAGE_FADE_MS * 2)
    );
  }, [
    isVocabOverlayOpen,
    vocabOverlayAnimatedTotal,
    vocabOverlayImageLevel,
    vocabOverlayImagePhase,
    vocabOverlayStartLevelKey,
  ]);

  useEffect(() => {
    return () => {
      clearVocabOverlayTimers();
    };
  }, []);

  const vocabOverlayTotalValue = Number.isFinite(vocabOverlayAnimatedTotal)
    ? vocabOverlayAnimatedTotal
    : 0;
  const vocabOverlayDeltaValue = Number.isFinite(vocabOverlayAnimatedDelta)
    ? vocabOverlayAnimatedDelta
    : 0;
  const vocabOverlayWeeklyTotalValue = Number.isFinite(vocabOverlayWeeklyAnimatedTotal)
    ? vocabOverlayWeeklyAnimatedTotal
    : 0;
  const vocabOverlayWeeklyDeltaValue = Number.isFinite(vocabOverlayWeeklyAnimatedDelta)
    ? vocabOverlayWeeklyAnimatedDelta
    : 0;
  const vocabOverlayDeltaLabel = `+${formatNumber(vocabOverlayDeltaValue)}`;
  const vocabOverlayWeeklyDeltaLabel = `+${formatNumber(vocabOverlayWeeklyDeltaValue)}`;
  const vocabOverlayTotalLabel = `${formatNumber(vocabOverlayTotalValue)} mots uniques`;
  const vocabOverlayWeeklyTotalLabel = `${formatNumber(vocabOverlayWeeklyTotalValue)} cette semaine`;
  const vocabOverlayActiveLevel = vocabOverlayImageLevel || getVocabLevelMeta(vocabOverlayTotalValue);
  const vocabOverlayRange = Math.max(
    1,
    (vocabOverlayActiveLevel?.max ?? vocabOverlayTotalValue) -
      (vocabOverlayActiveLevel?.min ?? 0)
  );
  const vocabOverlayCurrentWithin = clampValue(
    vocabOverlayTotalValue - (vocabOverlayActiveLevel?.min ?? 0),
    0,
    vocabOverlayRange
  );
  const vocabOverlayBaseWithin = clampValue(
    vocabOverlayBaseCount - (vocabOverlayActiveLevel?.min ?? 0),
    0,
    vocabOverlayRange
  );
  const vocabOverlayTargetWithin = clampValue(
    vocabOverlayTargetCount - (vocabOverlayActiveLevel?.min ?? 0),
    0,
    vocabOverlayRange
  );
  const vocabOverlayProgressPct = clampValue(
    (vocabOverlayCurrentWithin / vocabOverlayRange) * 100,
    0,
    100
  );
  const vocabOverlayBasePct = clampValue(
    (vocabOverlayBaseWithin / vocabOverlayRange) * 100,
    0,
    100
  );
  const vocabOverlayFinalPct = clampValue(
    (vocabOverlayTargetWithin / vocabOverlayRange) * 100,
    0,
    100
  );
  const vocabOverlayDeltaPct = Math.max(0, vocabOverlayProgressPct - vocabOverlayBasePct);
  const vocabOverlayBaseFillPct = vocabOverlayAbsorbing
    ? vocabOverlayFinalPct
    : vocabOverlayBasePct;
  const vocabOverlayDeltaFillPct = vocabOverlayAbsorbing ? 0 : vocabOverlayDeltaPct;
  const vocabOverlayWeeklyRange = Math.max(
    1,
    vocabOverlayWeeklyTargetCount,
    vocabOverlayWeeklyAnimatedTotal
  );
  const vocabOverlayWeeklyProgressPct = clampValue(
    (vocabOverlayWeeklyTotalValue / vocabOverlayWeeklyRange) * 100,
    0,
    100
  );
  const vocabOverlayWeeklyBasePct = clampValue(
    (vocabOverlayWeeklyBaseCount / vocabOverlayWeeklyRange) * 100,
    0,
    100
  );
  const vocabOverlayWeeklyFinalPct = clampValue(
    (vocabOverlayWeeklyTargetCount / vocabOverlayWeeklyRange) * 100,
    0,
    100
  );
  const vocabOverlayWeeklyDeltaPct = Math.max(
    0,
    vocabOverlayWeeklyProgressPct - vocabOverlayWeeklyBasePct
  );
  const vocabOverlayWeeklyBaseFillPct = vocabOverlayAbsorbing
    ? vocabOverlayWeeklyFinalPct
    : vocabOverlayWeeklyBasePct;
  const vocabOverlayWeeklyDeltaFillPct = vocabOverlayAbsorbing ? 0 : vocabOverlayWeeklyDeltaPct;
  const vocabOverlayCursorStyle = {
    left: `${vocabOverlayProgressPct}%`,
    borderTopColor:
      vocabOverlayImageLevel?.color || (darkMode ? "#f8fafc" : "#0f172a"),
  };
  const vocabOverlayImage = vocabOverlayActiveLevel || fallbackLevel;
  const vocabOverlayImageSrc = vocabOverlayImage?.imageKey
    ? getImageUrl(vocabOverlayImage.imageKey)
    : "";
  const vocabOverlayImageAlt = vocabOverlayImage?.label || "Niveau vocabulaire";
  const vocabOverlayImageClass =
    vocabOverlayImagePhase === "out"
      ? "vocab-image-fade-out"
      : vocabOverlayImagePhase === "in"
      ? "vocab-image-fade-in"
      : "";
  const vocabOverlayCountClass = vocabOverlayBounce ? "vocab-count-bounce" : "";
  const vocabOverlayAbsorbClass = vocabOverlayAbsorbing ? "vocab-count-absorb" : "";
  const vocabOverlayAbsorbStyle = {
    "--vocab-absorb-x": `${vocabOverlayAbsorbVec.x}px`,
    "--vocab-absorb-y": `${vocabOverlayAbsorbVec.y}px`,
  };
  useEffect(() => {
    if (!vocabOverlayAbsorbing) return undefined;
    const rafId = requestAnimationFrame(() => {
      const deltaEl = vocabOverlayDeltaRef.current;
      const cursorEl = vocabOverlayCursorRef.current;
      if (!deltaEl || !cursorEl) return;
      const deltaRect = deltaEl.getBoundingClientRect();
      const cursorRect = cursorEl.getBoundingClientRect();
      const dx =
        cursorRect.left +
        cursorRect.width / 2 -
        (deltaRect.left + deltaRect.width / 2);
      const dy =
        cursorRect.top +
        cursorRect.height / 2 -
        (deltaRect.top + deltaRect.height / 2);
      setVocabOverlayAbsorbVec({
        x: Math.round(dx),
        y: Math.round(dy),
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [vocabOverlayAbsorbing, vocabOverlayProgressPct, isMobileLayout]);
  const vocabOverlayRankDelta =
    Number.isFinite(vocabOverlayRankStart) && Number.isFinite(vocabOverlayRankEnd)
      ? vocabOverlayRankStart - vocabOverlayRankEnd
      : 0;
  const vocabOverlayRankDeltaAbs = Math.abs(vocabOverlayRankDelta);
  const vocabOverlayRankNumber = Number.isFinite(vocabOverlayRank) ? vocabOverlayRank : "?";
  const vocabOverlayRaceMin = Number.isFinite(vocabOverlayRace?.min)
    ? vocabOverlayRace.min
    : vocabOverlayWeeklyBaseCount;
  const vocabOverlayRaceMax = Math.max(
    vocabOverlayRaceMin + 1,
    Number.isFinite(vocabOverlayRace?.max)
      ? vocabOverlayRace.max
      : Math.max(vocabOverlayWeeklyTargetCount, vocabOverlayWeeklyAnimatedTotal)
  );
  const vocabOverlayRaceRange = Math.max(1, vocabOverlayRaceMax - vocabOverlayRaceMin);
  const getVocabRacePct = (count, { clipped = false } = {}) =>
    clipped
      ? 96
      : clampValue(((Number(count) - vocabOverlayRaceMin) / vocabOverlayRaceRange) * 100, 0, 100);
  const vocabOverlayRaceCurrentPct = getVocabRacePct(vocabOverlayWeeklyTotalValue);
  const vocabOverlayRaceMarks = Array.isArray(vocabOverlayRace?.competitors)
    ? vocabOverlayRace.competitors.slice(0, 7)
    : [];
  const vocabOverlayNextAhead = vocabOverlayRace?.nextAhead || null;
  const vocabOverlayNextAheadGap = Number(vocabOverlayNextAhead?.gap);
  const vocabOverlayWeeklyHint = Number.isFinite(vocabOverlayNextAheadGap)
    ? `Encore ${formatNumber(Math.max(1, Math.ceil(vocabOverlayNextAheadGap)))} pour ${vocabOverlayNextAhead.nick}`
    : Number(vocabOverlayRankEnd) === 1
    ? "En tête de la course"
    : "Course hebdo";
  const vocabOverlayPanelMaxClass = isMobileLayout ? "max-w-xl" : "max-w-3xl";
  const vocabOverlayRaceHeightClass = isMobileLayout ? "h-12" : "h-20";
  const vocabOverlayRaceTrackTopClass = isMobileLayout ? "top-5" : "top-9";
  const vocabOverlayRaceStartLabelClass = isMobileLayout
    ? "top-8 text-[8px]"
    : "top-14 text-[10px]";
  const vocabOverlayRaceMarkClass = isMobileLayout ? "top-2 bottom-1" : "top-3 bottom-2";
  const vocabOverlayRaceLineClass = isMobileLayout ? "h-7" : "h-12";
  const vocabOverlayRaceLabelClass = isMobileLayout
    ? "max-w-[54px] text-[8px]"
    : "max-w-[96px] text-[11px]";
  const vocabOverlayRaceLabelTopClass = isMobileLayout ? "-top-2" : "-top-3";
  const vocabOverlayRaceLabelBottomClass = isMobileLayout ? "top-8" : "top-14";
  const renderVocabOverlayPanel = () => (
    <div className="flex flex-col items-center gap-3">
      <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
        Vocabulaire
      </div>
      <div className={`grid w-full ${vocabOverlayPanelMaxClass} grid-cols-1 gap-3`}>
        <div
          className={`rounded-[8px] px-4 py-3 ${
            darkMode ? "bg-slate-900/70" : "bg-white/85"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-65">
            Semaine
          </div>
          <div className="mt-1 mb-2 flex items-center gap-2">
            <div
              key={`vocab-weekly-rank-${vocabOverlayRankNumber}`}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                darkMode
                  ? "border-amber-300/80 bg-slate-950 text-amber-100"
                  : "border-amber-500/80 bg-white text-slate-900"
              } shadow-inner ${vocabOverlayCountClass}`}
              title="Rang vocabulaire hebdomadaire"
            >
              <span className="text-lg font-black tabular-nums">{vocabOverlayRankNumber}</span>
            </div>
            <div className="min-w-0 text-[10px] uppercase tracking-[0.14em] leading-tight">
              <div className="font-bold opacity-70">Rang hebdo</div>
              {Number.isFinite(vocabOverlayRankStart) &&
              Number.isFinite(vocabOverlayRankEnd) ? (
                vocabOverlayRankDelta > 0 ? (
                  <div className="mt-0.5 flex items-center gap-1 text-green-500 font-black">
                    <span aria-hidden="true">▲</span>
                    <span>+{vocabOverlayRankDeltaAbs}</span>
                    <span className="opacity-75 normal-case tracking-normal">
                      place{vocabOverlayRankDeltaAbs > 1 ? "s" : ""}
                    </span>
                  </div>
                ) : vocabOverlayRankDelta < 0 ? (
                  <div className="mt-0.5 flex items-center gap-1 text-red-500 font-black">
                    <span aria-hidden="true">▼</span>
                    <span>-{vocabOverlayRankDeltaAbs}</span>
                    <span className="opacity-75 normal-case tracking-normal">
                      place{vocabOverlayRankDeltaAbs > 1 ? "s" : ""}
                    </span>
                  </div>
                ) : (
                  <div className="mt-0.5 font-bold opacity-55 normal-case tracking-normal">
                    inchangé
                  </div>
                )
              ) : (
                <div className="mt-0.5 font-bold opacity-55 normal-case tracking-normal">
                  non classé
                </div>
              )}
            </div>
          </div>
          <div className={`text-4xl font-black tabular-nums ${vocabOverlayCountClass}`}>
            {vocabOverlayWeeklyDeltaLabel}
          </div>
          <div className={`text-xs font-semibold opacity-75 -mt-1 ${vocabOverlayCountClass}`}>
            {vocabOverlayWeeklyTotalLabel}
          </div>
          <div className="mt-3">
            <div className={`relative ${vocabOverlayRaceHeightClass}`}>
              <div className={`absolute left-0 right-0 ${vocabOverlayRaceTrackTopClass} h-2 rounded-full bg-slate-500/20 overflow-hidden`}>
                <div
                  className="absolute inset-y-0 left-0 vocab-delta-fill"
                  style={{
                    width: `${vocabOverlayRaceCurrentPct}%`,
                    opacity: vocabOverlayAbsorbing ? 0.55 : 1,
                    transition: vocabOverlayAbsorbing
                      ? `width ${VOCAB_OVERLAY_ABSORB_MS}ms ease, opacity 0.6s ease`
                      : "none",
                  }}
                />
              </div>
              <div className="absolute top-3 bottom-2 left-0 w-px bg-slate-400/70" />
              <div
                className="absolute top-3 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent"
                style={{
                  left: `${vocabOverlayRaceCurrentPct}%`,
                  transform: "translateX(-50%)",
                  borderTopColor: darkMode ? "#6ee7b7" : "#059669",
                  filter: darkMode
                    ? "drop-shadow(0 0 6px rgba(110, 231, 183, 0.65))"
                    : "drop-shadow(0 1px 2px rgba(15, 23, 42, 0.25))",
                }}
                title="Position actuelle"
                aria-hidden="true"
              />
              <div className={`absolute left-0 -translate-x-1 font-bold uppercase tracking-[0.08em] opacity-60 ${vocabOverlayRaceStartLabelClass}`}>
                départ
              </div>
              {vocabOverlayRaceMarks.map((entry, idx) => {
                const markPct = getVocabRacePct(entry.count, { clipped: entry.clipped });
                const isPassed = entry.status === "passed" && vocabOverlayWeeklyTotalValue >= entry.count;
                const labelTop = idx % 2 === 0;
                return (
                  <div
                    key={`${entry.playerKey || entry.nick}-${entry.rank}-${idx}`}
                    className={`absolute ${vocabOverlayRaceMarkClass}`}
                    style={{
                      left: `${markPct}%`,
                      transform: "translateX(-50%)",
                    }}
                    title={`${entry.nick} - ${formatNumber(entry.count)} mots`}
                  >
                    <div
                      className={`mx-auto w-px ${vocabOverlayRaceLineClass} ${
                        isPassed
                          ? "bg-emerald-400 vocab-race-passed"
                          : entry.status === "ahead"
                          ? "bg-amber-400/90"
                          : "bg-slate-400/80"
                      }`}
                    />
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 truncate text-center font-black leading-none ${vocabOverlayRaceLabelClass} ${
                        labelTop ? vocabOverlayRaceLabelTopClass : vocabOverlayRaceLabelBottomClass
                      } ${
                        isPassed
                          ? "text-emerald-500"
                          : entry.status === "ahead"
                          ? "text-amber-500"
                          : "opacity-70"
                      }`}
                    >
                      {entry.clipped ? "+" : ""}
                      {entry.nick}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.08em] opacity-70">
              <span>{formatNumber(vocabOverlayRaceMin)} mots</span>
              <span className="truncate text-right normal-case tracking-normal">
                {vocabOverlayWeeklyHint}
              </span>
            </div>
          </div>
        </div>
        <div
          className={`rounded-[8px] px-4 py-3 ${
            darkMode ? "bg-slate-900/55" : "bg-white/75"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-65">
            Global
          </div>
          <div
            ref={vocabOverlayDeltaRef}
            className={`text-3xl font-black tabular-nums ${vocabOverlayCountClass} ${vocabOverlayAbsorbClass}`}
            style={vocabOverlayAbsorbStyle}
          >
            {vocabOverlayDeltaLabel}
          </div>
          <div className={`text-xs font-semibold opacity-75 -mt-1 ${vocabOverlayCountClass}`}>
            {vocabOverlayTotalLabel}
          </div>
        </div>
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em] min-h-[14px]">
        <div
          className={`truncate text-center ${vocabOverlayWordFading ? "vocab-word-fade-out" : ""}`}
        >
          {vocabOverlayCurrentWord || ""}
        </div>
      </div>
      <div className="mt-2 w-full max-w-lg flex flex-col items-center gap-2">
        {vocabOverlayImageSrc ? (
          <div className="relative">
            <img
              src={vocabOverlayImageSrc}
              alt={vocabOverlayImageAlt}
              className={`h-28 sm:h-32 w-auto select-none ${vocabOverlayImageClass}`}
              draggable={false}
            />
            {vocabOverlayHasLevelUp ? (
              <div className="absolute -top-2 -right-3 rotate-6 rounded-full bg-red-500 text-white text-[9px] font-extrabold px-2 py-0.5 shadow-lg animate-pulse">
                nouveau !!
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm font-extrabold uppercase tracking-widest">
            {vocabOverlayImageAlt}
          </div>
        )}
        <div className="w-full">
          <div className="relative w-full px-1">
            <div
              className={`h-3 rounded-full overflow-hidden ${
                darkMode ? "bg-slate-800/80" : "bg-slate-200/80"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{
                  width: `${vocabOverlayBaseFillPct}%`,
                  background: darkMode
                    ? "rgba(248, 250, 252, 0.85)"
                    : "rgba(15, 23, 42, 0.85)",
                  transition: vocabOverlayAbsorbing
                    ? `width ${VOCAB_OVERLAY_ABSORB_MS}ms ease`
                    : "none",
                }}
              />
              <div
                className="absolute inset-y-0 vocab-delta-fill"
                style={{
                  left: `${vocabOverlayBasePct}%`,
                  width: `${vocabOverlayDeltaFillPct}%`,
                  opacity: vocabOverlayAbsorbing ? 0 : 1,
                  transition: vocabOverlayAbsorbing
                    ? `width ${VOCAB_OVERLAY_ABSORB_MS}ms ease, opacity 0.6s ease`
                    : "none",
                }}
              />
            </div>
            <div
              ref={vocabOverlayCursorRef}
              className="absolute -top-3"
              style={{
                ...vocabOverlayCursorStyle,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className="w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent border-t-[8px]"
                style={{ borderTopColor: vocabOverlayCursorStyle.borderTopColor }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const vocabOverlayClass =
    vocabOverlayPhase === "in"
      ? "vocab-overlay-in"
      : vocabOverlayPhase === "out"
      ? "vocab-overlay-out"
      : "";
  const vocabOverlayView =
    isVocabOverlayOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`fixed inset-0 z-[12040] flex items-center justify-center px-4 py-6 ${vocabOverlayClass}`}
            role="dialog"
            aria-modal="true"
            onClick={skipVocabOverlayAnimation}
          >
            <div
              className={`absolute inset-0 backdrop-blur-sm ${
                darkMode ? "bg-black/55" : "bg-white/65"
              }`}
            />
            <div
              className={`relative w-full ${
                isMobileLayout ? "max-w-lg p-4" : "max-w-4xl p-5"
              } rounded-2xl border shadow-2xl ${
                darkMode
                  ? "bg-slate-900/95 border-slate-700 text-slate-100"
                  : "bg-white/95 border-slate-200 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`absolute top-3 right-3 z-10 rounded-full h-9 px-3 text-xs font-bold border ${
                  darkMode
                    ? "bg-slate-800/80 border-white/10 text-slate-100"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  skipVocabOverlayAnimation();
                }}
                aria-label="Passer l'animation vocabulaire"
              >
                Passer
              </button>
              {renderVocabOverlayPanel()}
            </div>
          </div>,
          document.body
        )
      : null;
  return vocabOverlayView;
  })
);

export default VocabProgressOverlay;
