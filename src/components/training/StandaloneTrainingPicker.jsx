import React from "react";
import { createPortal } from "react-dom";

import { getLiveTeamImageKey, getUiImageUrl } from "../../assets/uiAssetManifest.js";
import TrainingDurationPicker from "./TrainingDurationPicker.jsx";

const TRAINING_ROUNDS = Object.freeze([
  { value: "normal", label: "Classique" },
  { value: "finale", label: "Finale · bonus ×2" },
  { value: "self_specials_3_words", label: "3 mots" },
  { value: "speed", label: "Rapidité" },
  { value: "monstrous", label: "Grille monstrueuse" },
  { value: "target_long", label: "Mot le plus long" },
  { value: "target_score", label: "Meilleur mot" },
  { value: "bonus_letter", label: "Lettre en or" },
  { value: "massive_boggle", label: "Massive Boggle" },
  { value: "fake_twins", label: "Faux jumeaux" },
]);

export default function StandaloneTrainingPicker({
  busy = false,
  darkMode = false,
  disabled = false,
  onRequestOpen,
  onStart,
  playUiClickSound,
  team = null,
}) {
  const [open, setOpen] = React.useState(false);
  const [selectedRound, setSelectedRound] = React.useState(null);
  const imageSrc = getUiImageUrl(getLiveTeamImageKey("training", team));
  const panelClass = darkMode
    ? "border-white/10 bg-slate-950/95 text-slate-100"
    : "border-amber-200 bg-white/95 text-slate-900";

  const close = () => {
    setOpen(false);
    setSelectedRound(null);
  };

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[21120] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choisir un entraînement"
              className={`max-h-[94svh] w-full max-w-lg overflow-y-auto rounded-2xl border p-4 shadow-2xl ${panelClass}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-widest text-amber-500">
                    Entraînement libre
                  </div>
                  <div className="mt-1 text-sm font-semibold opacity-75">
                    {selectedRound
                      ? "Choisis la durée de cette grille."
                      : "Choisis le type de manche. Le jeu reste local."}
                  </div>
                </div>
                <button
                  type="button"
                  className="h-9 w-9 shrink-0 rounded-full border border-amber-300/50 text-lg font-black"
                  onClick={close}
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
              <div className="mt-4">
                {selectedRound ? (
                  <TrainingDurationPicker
                    busy={busy}
                    darkMode={darkMode}
                    label={selectedRound.label}
                    onBack={() => setSelectedRound(null)}
                    onStart={(durationMs) => {
                      onStart?.(selectedRound.value, selectedRound.label, durationMs);
                      close();
                    }}
                    playUiClickSound={playUiClickSound}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TRAINING_ROUNDS.map((entry) => (
                      <button
                        key={entry.value}
                        type="button"
                        disabled={busy}
                        onClick={() => setSelectedRound(entry)}
                        className={`rounded-xl border px-2 py-3 text-xs font-bold transition disabled:opacity-50 ${
                          darkMode
                            ? "border-slate-600 bg-slate-900 hover:bg-slate-800"
                            : "border-amber-200 bg-amber-50/70 hover:bg-amber-100"
                        }`}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="h-full w-full border-0 bg-transparent p-0 transition hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-50"
        disabled={disabled || busy}
        onClick={() => {
          if (typeof onRequestOpen === "function" && onRequestOpen() === false) return;
          setOpen(true);
        }}
        aria-label="Entraînement libre"
        title="Entraînement libre"
      >
        <img
          className="block h-full w-full object-contain drop-shadow-lg"
          src={imageSrc}
          alt=""
          draggable="false"
        />
      </button>
      {dialog}
    </>
  );
}
