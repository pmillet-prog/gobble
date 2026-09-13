import React from "react";
import { DAILY_SPECIAL_MODE } from "../../components/daily/dailyModes.js";

export function isInvalidWordGuardEnabled({ isLoggedIn, appView, phase, roundType }) {
  return !!isLoggedIn && appView === "live" && phase === "playing" &&
    roundType !== "speed" && roundType !== "target_long" &&
    roundType !== "target_score" && roundType !== DAILY_SPECIAL_MODE;
}

export const INVALID_WORD_GUARD_THRESHOLD = 3;
export const INVALID_WORD_GUARD_DURATION_MS = 1500;

export const INVALID_WORD_GUARD_LINES = Object.freeze([
  "T'es en train de tester n'importe quoi, mon vieux !",
  "Doucement, le dictionnaire demande grâce !",
  "Trois essais au hasard : la grille porte plainte.",
  "Même les lettres commencent à avoir des doutes.",
  "Minute papillon, on vise un vrai mot cette fois !",
  "Le gobelin du dico te garde à l'œil.",
  "On respire… puis on tente avec de vraies syllabes.",
  "Le clavier n'est pas une machine à sous !",
  "La grille réclame une courte pause syndicale.",
  "Petit contrôle technique de l'inspiration en cours…",
]);

export function createInvalidWordGuardState() {
  return { blocked: false, consecutiveInvalid: 0, message: "" };
}

export function registerInvalidWordAttempt(state, pickIndex = 0) {
  const previous = state || createInvalidWordGuardState();
  if (previous.blocked) return previous;
  const consecutiveInvalid = Math.max(0, previous.consecutiveInvalid) + 1;
  if (consecutiveInvalid < INVALID_WORD_GUARD_THRESHOLD) {
    return { ...previous, consecutiveInvalid };
  }
  const index = Math.abs(Math.trunc(Number(pickIndex) || 0)) % INVALID_WORD_GUARD_LINES.length;
  return {
    blocked: true,
    consecutiveInvalid,
    message: INVALID_WORD_GUARD_LINES[index],
  };
}

export function releaseInvalidWordGuard(state) {
  return { ...(state || createInvalidWordGuardState()), blocked: false, message: "" };
}

export default function useInvalidWordGuard({ enabled, resetKey }) {
  const [state, setState] = React.useState(createInvalidWordGuardState);
  const stateRef = React.useRef(state);
  const timerRef = React.useRef(null);
  const blockedRef = React.useRef(false);
  stateRef.current = state;
  blockedRef.current = state.blocked;

  const clearTimer = React.useCallback(() => {
    if (timerRef.current == null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const reset = React.useCallback(() => {
    clearTimer();
    const next = createInvalidWordGuardState();
    stateRef.current = next;
    blockedRef.current = false;
    setState(next);
  }, [clearTimer]);

  const registerValid = React.useCallback(() => {
    if (
      !stateRef.current.blocked &&
      Math.max(0, Number(stateRef.current.consecutiveInvalid) || 0) === 0
    ) {
      return false;
    }
    clearTimer();
    const next = createInvalidWordGuardState();
    stateRef.current = next;
    blockedRef.current = false;
    setState(next);
    return true;
  }, [clearTimer]);

  const registerInvalid = React.useCallback(() => {
    if (!enabled || blockedRef.current) return false;
    const previous = stateRef.current;
    const next = registerInvalidWordAttempt(
      previous,
      Math.floor(Math.random() * INVALID_WORD_GUARD_LINES.length)
    );
    const triggered = next.blocked && !previous.blocked;
    stateRef.current = next;
    blockedRef.current = next.blocked;
    setState(next);
    if (!triggered) return false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const nextState = releaseInvalidWordGuard(stateRef.current);
      stateRef.current = nextState;
      blockedRef.current = false;
      setState(nextState);
    }, INVALID_WORD_GUARD_DURATION_MS);
    return true;
  }, [clearTimer, enabled]);

  React.useEffect(() => {
    reset();
  }, [enabled, reset, resetKey]);

  React.useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    blocked: state.blocked,
    blockedRef,
    message: state.message,
    registerInvalid,
    registerValid,
    reset,
  };
}
