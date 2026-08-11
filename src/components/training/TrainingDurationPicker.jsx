import React from "react";

import AnimatedTimeWheel, {
  TIME_WHEEL_MULTI_ROLL_DURATION_MS,
  TIME_WHEEL_ROLL_DURATION_MS,
  buildTimeWheelRollSegments,
  clampTimeWheelValue,
  getTimeWheelIndex,
  shiftTimeWheelValue,
} from "../time/AnimatedTimeWheel.jsx";
import {
  TRAINING_DURATION_MIN_MS,
  TRAINING_DURATION_PRESETS_MS,
  formatTrainingDuration,
} from "../../training/standaloneTraining.js";

const MINUTE_OPTIONS = Array.from({ length: 11 }, (_, value) => value);
const SECOND_OPTIONS = [0, 15, 30, 45];

export default function TrainingDurationPicker({
  darkMode = false,
  label = "",
  busy = false,
  onBack,
  onStart,
  playUiClickSound,
}) {
  const [minutes, setMinutes] = React.useState(2);
  const [seconds, setSeconds] = React.useState(0);
  const [wheelAnimation, setWheelAnimation] = React.useState({
    minutes: { token: 0, direction: 0, durationMs: TIME_WHEEL_ROLL_DURATION_MS },
    seconds: { token: 0, direction: 0, durationMs: TIME_WHEEL_ROLL_DURATION_MS },
  });
  const rollTimersRef = React.useRef([]);
  const rollSequenceRef = React.useRef(0);
  const secondOptions = minutes >= 10 ? [0] : SECOND_OPTIONS;
  const durationMs = (minutes * 60 + seconds) * 1000;

  const clearRollTimers = React.useCallback(() => {
    rollSequenceRef.current += 1;
    for (const timerId of rollTimersRef.current) window.clearTimeout(timerId);
    rollTimersRef.current = [];
  }, []);

  React.useEffect(() => clearRollTimers, [clearRollTimers]);

  const playRollClick = React.useCallback(() => {
    if (typeof playUiClickSound === "function") playUiClickSound();
  }, [playUiClickSound]);

  const triggerWheelAnimation = React.useCallback(
    (column, direction, duration = TIME_WHEEL_ROLL_DURATION_MS) => {
      if (!direction) return;
      setWheelAnimation((previous) => {
        const current = previous[column] || {
          token: 0,
          direction: 0,
          durationMs: TIME_WHEEL_ROLL_DURATION_MS,
        };
        return {
          ...previous,
          [column]: {
            token: current.token + 1,
            direction: direction > 0 ? 1 : -1,
            durationMs: Math.max(120, Math.round(Number(duration) || TIME_WHEEL_ROLL_DURATION_MS)),
          },
        };
      });
    },
    []
  );

  const setDurationAnimated = React.useCallback(
    (nextDurationMs) => {
      const totalSeconds = Math.max(0, Math.min(10 * 60, Math.round(nextDurationMs / 1000)));
      const nextMinutes = Math.floor(totalSeconds / 60);
      const nextSeconds = clampTimeWheelValue(SECOND_OPTIONS, totalSeconds % 60);
      const currentMinuteIndex = getTimeWheelIndex(MINUTE_OPTIONS, minutes);
      const targetMinuteIndex = getTimeWheelIndex(MINUTE_OPTIONS, nextMinutes);
      const currentSecondIndex = getTimeWheelIndex(SECOND_OPTIONS, seconds);
      const targetSecondIndex = getTimeWheelIndex(SECOND_OPTIONS, nextSeconds);
      const minuteDelta = targetMinuteIndex - currentMinuteIndex;
      const secondDelta = targetSecondIndex - currentSecondIndex;
      const minuteSteps = Math.abs(minuteDelta);
      const secondSteps = Math.abs(secondDelta);
      clearRollTimers();
      if (minuteSteps <= 0 && secondSteps <= 0) return;

      const totalRollDurationMs =
        Math.max(minuteSteps, secondSteps) > 1
          ? TIME_WHEEL_MULTI_ROLL_DURATION_MS
          : TIME_WHEEL_ROLL_DURATION_MS;
      const sequenceId = rollSequenceRef.current;

      const scheduleColumnRoll = ({ column, steps, direction, options, currentIndex, setValue }) => {
        if (!steps || !direction || currentIndex < 0) return;
        const segments = buildTimeWheelRollSegments(steps, totalRollDurationMs);
        for (let step = 1; step <= steps; step += 1) {
          const segment = segments[step - 1] || {
            delayMs: Math.round(((step - 1) * totalRollDurationMs) / steps),
            durationMs: Math.max(140, Math.round(totalRollDurationMs / steps)),
          };
          const timerId = window.setTimeout(() => {
            if (rollSequenceRef.current !== sequenceId) return;
            const value = options[currentIndex + direction * step];
            if (typeof value === "undefined") return;
            triggerWheelAnimation(column, direction, segment.durationMs);
            setValue(value);
            playRollClick();
          }, Math.round(segment.delayMs));
          rollTimersRef.current.push(timerId);
        }
      };

      scheduleColumnRoll({
        column: "minutes",
        steps: minuteSteps,
        direction: Math.sign(minuteDelta),
        options: MINUTE_OPTIONS,
        currentIndex: currentMinuteIndex,
        setValue: setMinutes,
      });
      scheduleColumnRoll({
        column: "seconds",
        steps: secondSteps,
        direction: Math.sign(secondDelta),
        options: SECOND_OPTIONS,
        currentIndex: currentSecondIndex,
        setValue: setSeconds,
      });
      const cleanupTimerId = window.setTimeout(() => {
        if (rollSequenceRef.current !== sequenceId) return;
        setMinutes(nextMinutes);
        setSeconds(nextSeconds);
      }, totalRollDurationMs + 40);
      rollTimersRef.current.push(cleanupTimerId);
    },
    [clearRollTimers, minutes, playRollClick, seconds, triggerWheelAnimation]
  );

  const shiftMinutes = React.useCallback(
    (delta) => {
      clearRollTimers();
      const current = clampTimeWheelValue(MINUTE_OPTIONS, minutes);
      const next = shiftTimeWheelValue(MINUTE_OPTIONS, current, delta);
      if (next === current) return;
      triggerWheelAnimation("minutes", delta);
      if (next >= 10 && seconds !== 0) {
        triggerWheelAnimation("seconds", -1);
        setSeconds(0);
      }
      setMinutes(next);
      playRollClick();
    }, [clearRollTimers, minutes, playRollClick, seconds, triggerWheelAnimation]
  );

  const shiftSeconds = React.useCallback(
    (delta) => {
      clearRollTimers();
      const current = clampTimeWheelValue(secondOptions, seconds);
      const next = shiftTimeWheelValue(secondOptions, current, delta);
      if (next === current) return;
      triggerWheelAnimation("seconds", delta);
      setSeconds(next);
      playRollClick();
    }, [clearRollTimers, playRollClick, secondOptions, seconds, triggerWheelAnimation]
  );

  const wheelTheme = darkMode
    ? {}
    : {
        containerClassName: "border-amber-300 bg-amber-50/60",
        controlClassName: "border-amber-300/50 bg-white/55",
        reelClassName: "border-amber-300/50 bg-black/10",
      };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/40"
          aria-label="Revenir aux types de manche"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <div className="text-xs font-extrabold uppercase tracking-widest opacity-70">
            Durée de la manche
          </div>
          <div className="text-sm font-black">{label}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <AnimatedTimeWheel
          {...wheelTheme}
          animation={wheelAnimation.minutes}
          label="Minutes"
          options={MINUTE_OPTIONS}
          value={minutes}
          formatValue={(value) => String(value).padStart(2, "0")}
          onShift={shiftMinutes}
        />
        <AnimatedTimeWheel
          {...wheelTheme}
          animation={wheelAnimation.seconds}
          label="Secondes"
          options={secondOptions}
          value={seconds}
          formatValue={(value) => String(value).padStart(2, "0")}
          onShift={shiftSeconds}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {TRAINING_DURATION_PRESETS_MS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setDurationAnimated(preset)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-black tabular-nums ${
              durationMs === preset
                ? "border-amber-400 bg-amber-300/25"
                : "border-slate-400/40"
            }`}
          >
            {formatTrainingDuration(preset)}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || durationMs < TRAINING_DURATION_MIN_MS}
        onClick={() => onStart?.(durationMs)}
        className="mt-4 w-full rounded-xl border border-amber-400 bg-amber-400/20 px-3 py-3 text-sm font-black disabled:opacity-45"
      >
        {busy ? "Préparation…" : `Jouer ${formatTrainingDuration(durationMs)}`}
      </button>
    </div>
  );
}
