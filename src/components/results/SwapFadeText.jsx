import React, { useEffect, useRef, useState } from "react";

export const RESULTS_SLIDE_OUT_MS = 250;
export const RESULTS_SLIDE_IN_MS = 250;

export default function SwapFadeText({ value, className = "" }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [phase, setPhase] = useState("idle");
  const latestValueRef = useRef(value);
  const displayValueRef = useRef(value);
  const firstRenderRef = useRef(true);
  const outTimerRef = useRef(null);
  const inTimerRef = useRef(null);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      setDisplayValue(value);
      return undefined;
    }
    if (value === displayValueRef.current) return undefined;
    if (outTimerRef.current) clearTimeout(outTimerRef.current);
    if (inTimerRef.current) clearTimeout(inTimerRef.current);
    setPhase("out");
    outTimerRef.current = setTimeout(() => {
      setDisplayValue(latestValueRef.current);
      setPhase("in");
      inTimerRef.current = setTimeout(() => setPhase("idle"), RESULTS_SLIDE_IN_MS);
    }, RESULTS_SLIDE_OUT_MS);
    return () => {
      if (outTimerRef.current) {
        clearTimeout(outTimerRef.current);
        outTimerRef.current = null;
      }
      if (inTimerRef.current) {
        clearTimeout(inTimerRef.current);
        inTimerRef.current = null;
      }
    };
  }, [value]);

  const phaseClass =
    phase === "out" ? "results-fade-out" : phase === "in" ? "results-fade-in" : "";
  return <span className={`${className} ${phaseClass}`}>{displayValue}</span>;
}
