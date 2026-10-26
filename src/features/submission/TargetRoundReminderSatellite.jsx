import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";

export function TargetRoundReminderOverlay({ reminder, onDismiss }) {
  if (!reminder || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[1190] flex items-center justify-center px-5">
      <aside className="pointer-events-auto relative w-full max-w-sm rounded-2xl border-2 border-amber-200 bg-slate-950 p-5 pr-12 text-amber-50 shadow-2xl">
        <button type="button" onClick={onDismiss} aria-label="Fermer le rappel de manche"
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-2xl hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200">
          <span aria-hidden="true">×</span>
        </button>
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="text-base font-extrabold leading-snug">{reminder.line}</p>
          <p className="mt-3 text-sm leading-relaxed">
            Dans cette manche, il faut {reminder.action} <strong className="text-amber-200">UN SEUL MOT</strong>
            {reminder.action === "trouver" ? " : " : " "}{reminder.detail}
          </p>
        </div>
      </aside>
    </div>,
    document.body
  );
}

export default function TargetRoundReminderSatellite() {
  const feature = useFeatureRuntime("targetRoundReminder");
  const reminder = useFeatureSelector(feature, state => state.reminder);
  return <TargetRoundReminderOverlay reminder={reminder} onDismiss={feature.dismiss} />;
}
