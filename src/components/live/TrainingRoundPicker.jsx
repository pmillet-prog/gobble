import React from "react";
import { createPortal } from "react-dom";
import { getLiveTeamImageKey, getUiImageUrl } from "../../assets/uiAssetManifest.js";

const DEFAULT_TRAINING_ROUNDS = [
  { value: "normal", label: "Classique" },
  { value: "finale", label: "Finale · bonus ×2" },
  { value: "self_specials_3_words", label: "3 mots" },
  { value: "speed", label: "Rapidite" },
  { value: "monstrous", label: "Grille monstrueuse" },
  { value: "target_long", label: "Mot le plus long" },
  { value: "target_score", label: "Meilleur mot" },
  { value: "bonus_letter", label: "Lettre en or" },
  { value: "massive_boggle", label: "Massive Boggle" },
  { value: "fake_twins", label: "Faux jumeaux" },
  { value: "ocid", label: "OCID" },
];

export default function TrainingRoundPicker({
  darkMode = false,
  devRoundTypes = [],
  lobby = null,
  onTrainingStart,
  team = null,
  trainingBusy = false,
  variant = "panel",
}) {
  const [open, setOpen] = React.useState(false);
  const isCountdown = lobby?.phase === "countdown";
  const isIntro = lobby?.phase === "intro";
  const available =
    !!lobby?.trainingAvailable &&
    !trainingBusy &&
    !isCountdown &&
    !isIntro &&
    !lobby?.maintenanceMode;
  const trainingRounds = (Array.isArray(devRoundTypes) && devRoundTypes.length
    ? devRoundTypes
    : DEFAULT_TRAINING_ROUNDS
  ).filter((entry) => entry?.value);
  const panelClass = darkMode
    ? "border-white/10 bg-slate-950/85 text-slate-100"
    : "border-slate-200 bg-white text-slate-900";
  const buttonClass = darkMode
    ? "border-amber-300/40 bg-amber-400/15 text-amber-50 hover:bg-amber-400/25"
    : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100";

  if (variant === "art") {
    const imageSrc = getUiImageUrl(getLiveTeamImageKey("training", team));
    const picker =
      open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[21120] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Choisir une manche d'entraînement"
                className={`w-full max-w-lg rounded-2xl border p-4 shadow-2xl ${panelClass}`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-widest opacity-70">
                      Entraînement solo
                    </div>
                    <div className="mt-1 text-sm font-semibold opacity-75">
                      Choisis une manche hors mini-tournoi.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`h-9 w-9 rounded-full border text-lg font-black ${buttonClass}`}
                    onClick={() => setOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {trainingRounds.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      disabled={trainingBusy}
                      onClick={() => {
                        setOpen(false);
                        onTrainingStart?.(entry.value, entry.label);
                      }}
                      className={`rounded-lg border px-2 py-3 text-xs font-bold transition disabled:opacity-50 ${
                        darkMode
                          ? "border-slate-600 bg-slate-900 hover:bg-slate-800"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
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
          disabled={!available}
          onClick={() => setOpen(true)}
          className="h-full w-full border-0 bg-transparent p-0 transition hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-45"
          aria-label={available ? "Ouvrir les entraînements" : "Entraînement indisponible"}
          title={available ? "Entraînement" : "Disponible lorsque tu es seul dans le salon"}
        >
          <img
            className="block h-full w-full object-contain drop-shadow-lg"
            src={imageSrc}
            alt=""
            draggable="false"
          />
        </button>
        {picker}
      </>
    );
  }

  if (!available) return null;

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${panelClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-widest opacity-70">
            Entrainement
          </div>
          <div className="mt-0.5 text-xs font-semibold opacity-70">
            Manche solo hors tournoi
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition ${buttonClass}`}
          aria-label="Ouvrir le menu entrainement"
          title="Entrainement"
          aria-expanded={open ? "true" : "false"}
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden="true">
            fitness_center
          </span>
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {trainingRounds.map((entry) => (
            <button
              key={entry.value}
              type="button"
              disabled={trainingBusy}
              onClick={() => {
                setOpen(false);
                onTrainingStart?.(entry.value, entry.label);
              }}
              className={`rounded-lg border px-2 py-2 text-xs font-bold transition disabled:opacity-50 ${
                darkMode
                  ? "border-slate-600 bg-slate-900 hover:bg-slate-800"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
