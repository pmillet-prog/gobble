import React, { useEffect, useMemo, useRef, useState } from "react";

function bucketLabel(bucket) {
  if (bucket === "easy") return "Facile";
  if (bucket === "medium") return "Moyen";
  if (bucket === "hard") return "Difficile";
  return bucket || "";
}

const CHECK_DROP_MS = 760;
const CHECK_LAND_MS = 560;
const AFTER_DROP_HOLD_MS = 40;
const SLIDE_OUT_MS = 420;
const COLLAPSE_MS = 300;
const ROW_STAGGER_MS = 80;

export default function DuelObjectivesPanel({
  darkMode = false,
  objectivesStatus = null,
  onReroll = null,
  rerollBusyBucket = null,
  onObjectiveValidated = null,
  hiddenValidatedKeys = null,
  onValidatedObjectiveConsumed = null,
  hasPlayedDaily = false,
}) {
  const objectives = Array.isArray(objectivesStatus?.objectives)
    ? objectivesStatus.objectives
    : [];
  const rerollUsed = !!objectivesStatus?.rerollUsed;
  const pointsAwarded = Number(objectivesStatus?.pointsAwarded) || 0;
  const pointsCap = Number(objectivesStatus?.pointsCap) || 85;
  const [animPhaseByKey, setAnimPhaseByKey] = useState({});
  const [dismissedByKey, setDismissedByKey] = useState({});
  const timersRef = useRef(new Map());
  const startedRef = useRef(new Set());
  const hiddenValidatedSet = useMemo(
    () => new Set(Array.isArray(hiddenValidatedKeys) ? hiddenValidatedKeys : []),
    [hiddenValidatedKeys]
  );

  const objectiveEntries = useMemo(
    () =>
      objectives.map((objective, index) => {
        const bucket = String(objective?.bucket || "");
        const rawId = objective?.id || objective?.title || String(index);
        return {
          key: `${bucket}-${rawId}`,
          objective,
        };
      }),
    [objectives]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerSet) => {
        timerSet.forEach((timerId) => clearTimeout(timerId));
      });
      timersRef.current.clear();
      startedRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const validKeys = new Set();
    objectiveEntries.forEach((entry) => {
      if (entry?.key) validKeys.add(entry.key);
    });

    setAnimPhaseByKey((prev) => {
      const next = {};
      let changed = false;
      Object.keys(prev).forEach((key) => {
        if (validKeys.has(key)) {
          next[key] = prev[key];
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setDismissedByKey((prev) => {
      const next = {};
      let changed = false;
      Object.keys(prev).forEach((key) => {
        if (validKeys.has(key)) {
          next[key] = prev[key];
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    timersRef.current.forEach((timerSet, key) => {
      if (validKeys.has(key)) return;
      timerSet.forEach((timerId) => clearTimeout(timerId));
      timersRef.current.delete(key);
    });
    const nextStarted = new Set();
    startedRef.current.forEach((key) => {
      if (validKeys.has(key)) nextStarted.add(key);
    });
    startedRef.current = nextStarted;
  }, [objectiveEntries]);

  useEffect(() => {
    objectiveEntries.forEach((entry, index) => {
      const validated = !!entry.objective?.validated;
      const key = entry.key;
      if (!validated) {
        startedRef.current.delete(key);
        return;
      }
      if (hiddenValidatedSet.has(key)) {
        startedRef.current.delete(key);
        return;
      }
      if (
        dismissedByKey[key] ||
        timersRef.current.has(key) ||
        startedRef.current.has(key)
      ) {
        return;
      }

      startedRef.current.add(key);
      const staggerMs = Math.max(0, Math.min(320, index * ROW_STAGGER_MS));

      setAnimPhaseByKey((prev) => ({ ...prev, [key]: "drop" }));
      const toLand = setTimeout(() => {
        if (typeof onObjectiveValidated === "function") {
          onObjectiveValidated(entry.objective);
        }
      }, CHECK_LAND_MS + staggerMs);
      const toSlide = setTimeout(() => {
        setAnimPhaseByKey((prev) => {
          if (!prev[key]) return prev;
          return { ...prev, [key]: "slide" };
        });
      }, CHECK_DROP_MS + AFTER_DROP_HOLD_MS + staggerMs);
      const toCollapse = setTimeout(() => {
        setAnimPhaseByKey((prev) => {
          if (!prev[key]) return prev;
          return { ...prev, [key]: "collapse" };
        });
      }, CHECK_DROP_MS + AFTER_DROP_HOLD_MS + SLIDE_OUT_MS + staggerMs);
      const toDismiss = setTimeout(() => {
        setDismissedByKey((prev) => ({ ...prev, [key]: true }));
        setAnimPhaseByKey((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        if (typeof onValidatedObjectiveConsumed === "function") {
          onValidatedObjectiveConsumed(entry.objective, key);
        }
        timersRef.current.delete(key);
      }, CHECK_DROP_MS + AFTER_DROP_HOLD_MS + SLIDE_OUT_MS + COLLAPSE_MS + staggerMs);
      timersRef.current.set(key, [toLand, toSlide, toCollapse, toDismiss]);
    });
  }, [
    dismissedByKey,
    hiddenValidatedSet,
    objectiveEntries,
    onObjectiveValidated,
    onValidatedObjectiveConsumed,
  ]);

  const visibleEntries = objectiveEntries.filter((entry) => {
    const key = entry.key;
    const validated = !!entry?.objective?.validated;
    if (dismissedByKey[key]) return false;
    if (validated && hiddenValidatedSet.has(key)) return false;
    return true;
  });
  const allObjectivesCompleted =
    objectives.length > 0 && objectives.every((objective) => !!objective?.validated);

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        darkMode ? "border-white/10 bg-slate-900/50 text-slate-100" : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      <style>{`
@keyframes duelObjectiveCheckDrop {
  0% {
    transform: translateY(-34px) scale(2.35) rotate(-8deg);
    opacity: 0.15;
  }
  65% {
    transform: translateY(2px) scale(0.9) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(0) scale(1) rotate(0deg);
    opacity: 1;
  }
}
`}</style>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold">Objectifs du jour</div>
        <div className="text-xs opacity-70">{pointsAwarded}/{pointsCap} pts équipe</div>
      </div>
      {visibleEntries.length > 0 ? (
        <div>
          {visibleEntries.map((entry, index) => {
            const objective = entry.objective;
            const key = entry.key;
            const progress = Number(objective?.progress) || 0;
            const target = Number(objective?.target) || 1;
            const validated = !!objective?.validated;
            const bucket = objective?.bucket || "";
            const canReroll = !validated && !rerollUsed && typeof onReroll === "function";
            const phase = animPhaseByKey[key] || "";
            const isDrop = phase === "drop";
            const isSlidingOut = phase === "slide";
            const isCollapsing = phase === "collapse";
            const shouldSlideOut = isSlidingOut || isCollapsing;
            const marginBottom = index + 1 < visibleEntries.length ? 8 : 0;
            return (
              <div
                key={key}
                className="will-change-[max-height,margin,opacity]"
                style={{
                  overflow: isCollapsing ? "hidden" : "visible",
                  maxHeight: isCollapsing ? 0 : 220,
                  marginBottom: isCollapsing ? 0 : marginBottom,
                  opacity: isCollapsing ? 0 : 1,
                  transition:
                    "max-height 300ms ease, margin-bottom 300ms ease, opacity 220ms ease",
                }}
              >
                <div
                  className={`rounded-lg border px-2 py-2 ${
                    darkMode ? "border-white/10 bg-black/20" : "border-slate-200 bg-slate-50"
                  }`}
                  style={{
                    transform: shouldSlideOut ? "translate3d(120%, 0, 0)" : "translate3d(0, 0, 0)",
                    opacity: shouldSlideOut ? 0.02 : 1,
                    transition:
                      "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold opacity-70">
                      {bucketLabel(bucket)} • +{Number(objective?.points) || 0}
                    </div>
                    <div className="text-sm font-semibold">{objective?.title || "Objectif"}</div>
                    <div className="text-xs opacity-70">
                      {Math.min(progress, target)}/{target}
                      {validated ? " • Validé" : ""}
                    </div>
                  </div>
                  <div className="h-8 w-8 shrink-0 inline-flex items-center justify-center overflow-visible">
                    {validated ? (
                      <span
                        className="material-symbols-outlined text-[20px] leading-none text-emerald-500 inline-flex"
                        style={{
                          animation: isDrop
                            ? `duelObjectiveCheckDrop ${CHECK_DROP_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both`
                            : "none",
                          filter: isDrop
                            ? "drop-shadow(0 0 7px rgba(16, 185, 129, 0.7))"
                            : "drop-shadow(0 0 1px rgba(16, 185, 129, 0.3))",
                        }}
                        aria-hidden="true"
                        title="Objectif validé"
                      >
                        check_circle
                      </span>
                    ) : canReroll ? (
                      <button
                        type="button"
                        className={`h-8 w-8 rounded border inline-flex items-center justify-center transition ${
                          darkMode
                            ? "border-slate-500 bg-slate-800 hover:bg-slate-700"
                            : "border-slate-300 bg-white hover:bg-slate-100"
                        }`}
                        disabled={rerollBusyBucket === bucket}
                        onClick={() => {
                          onReroll?.(bucket);
                        }}
                        aria-label="Reroll objectif"
                        title="Reroll"
                      >
                        <span
                          className={`material-symbols-outlined text-[18px] leading-none ${
                            rerollBusyBucket === bucket ? "animate-spin" : ""
                          }`}
                          aria-hidden="true"
                        >
                          recycling
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs opacity-80 space-y-1">
          {allObjectivesCompleted ? (
            <>
              <div className="font-semibold">Tous les objectifs du jour ont été accomplis !</div>
              {!hasPlayedDaily ? (
                <div className="opacity-80">
                  Mais n'oubliez pas que la grille du jour peut également rapporter des points à votre equipe.
                </div>
              ) : (
                <div className="opacity-80">
                  Mais les{" "}
                  <span className="font-semibold text-amber-500">gobbles</span>{" "}
                  que vous trouvez en jeu peuvent faire grappiller des points à votre equipe !
                </div>
              )}
            </>
          ) : (
            <div className="opacity-70">Aucun objectif disponible.</div>
          )}
        </div>
      )}
    </div>
  );
}
