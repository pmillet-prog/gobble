import React from "react";
import { createPortal } from "react-dom";
import { sanitizeDefinitionText } from "../../utils/definitionPayload.js";
import DefinitionDetails from "../DefinitionDetails.jsx";
import DefinitionVaultButton from "../DefinitionVaultButton.jsx";

export default function DefinitionOverlays({ runtime }) {
  const {
    closeDefinition,
    closeWordInfoModal,
    darkMode,
    definitionModal,
    GUIDED_RESULTS_STEPS,
    guidedResultsStep,
    handleDefinitionVaultAction,
    homeSurfaceUsesFixedFantasyTheme,
    isAccountAuthenticated,
    isWordInVault,
    menuDarkMode,
    openDefinition,
    playCloseSound,
    wordInfoModal,
    wordVaultActionPending,
  } = runtime;

  const definitionHint =
    definitionModal.phraseGuess && definitionModal.matchedTitle
      ? `D\u00e9finition trouv\u00e9e pour ${definitionModal.matchedTitle} (li\u00e9 \u00e0 '${definitionModal.word}')`
      : definitionModal.lemmaGuess && definitionModal.lemma
      ? definitionModal.lemmaLabel
        ? `${definitionModal.lemmaLabel} ${definitionModal.lemma}`
        : `Forme conjugu\u00e9e probable - d\u00e9finition de ${definitionModal.lemma}`
      : definitionModal.participleGuess &&
        definitionModal.participleLabel &&
        definitionModal.participleBase
      ? `${definitionModal.participleLabel} ${definitionModal.participleBase}`
      : definitionModal.inflectionGuess &&
        definitionModal.inflectionLabel &&
        definitionModal.inflectionBase
      ? `${definitionModal.inflectionLabel} ${definitionModal.inflectionBase}`
      : "";
  const isLemmaHint = !!(definitionModal.lemmaGuess && definitionModal.lemma);
  const definitionVaultWord = String(definitionModal.word || "").trim();
  const definitionWordInVault = isAccountAuthenticated && isWordInVault(definitionVaultWord);
  const definitionVaultShowsSavedState = !definitionModal.fromVault && definitionWordInVault;
  const definitionModalDarkMode =
    definitionModal.fromVault || homeSurfaceUsesFixedFantasyTheme ? menuDarkMode : darkMode;
  const definitionModalDefinitions = Array.isArray(definitionModal.definitions)
    ? definitionModal.definitions.map((item) => sanitizeDefinitionText(item)).filter(Boolean)
    : [];
  const definitionModalEtymology = definitionModal.preferLongDefinition
    ? sanitizeDefinitionText(definitionModal.etymology)
    : "";

  const definitionModalView =
    definitionModal.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4"
            style={{ zIndex: 2147483647 }}
            onClick={closeDefinition}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`w-full ${
                definitionModal.preferLongDefinition ? "max-w-xl" : "max-w-sm"
              } rounded-xl border p-4 shadow-xl max-h-[82vh] flex flex-col ${
                definitionModal.fromWordInfo
                  ? definitionModalDarkMode
                    ? "bg-slate-900 text-slate-100 border-slate-600"
                    : "bg-white text-slate-900 border-slate-200"
                  : definitionModalDarkMode
                  ? "bg-slate-900/80 text-slate-100 border-slate-600"
                  : "bg-white/80 text-slate-900 border-slate-200"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-extrabold">Définition</div>
              <div className="mt-2 text-sm font-semibold">
                {definitionModal.title &&
                definitionModal.title !== definitionModal.word
                  ? `${definitionModal.word} \u2192 ${definitionModal.title}`
                  : definitionModal.word}
              </div>
              {definitionHint ? (
                <div
                  className={`mt-1 opacity-80 ${
                    isLemmaHint ? "text-[10px] italic" : "text-[11px] font-semibold"
                  }`}
                >
                  {definitionHint}
                </div>
              ) : null}
              <div
                className={`mt-3 text-sm ${
                  definitionModal.preferLongDefinition
                    ? "overflow-y-auto pr-1 min-h-0 flex-1 custom-scrollbar custom-scrollbar-gray"
                    : ""
                }`}
              >
                {definitionModal.loading ? (
                  <span>Chargement...</span>
                ) : definitionModal.ok && definitionModal.definition ? (
                  <DefinitionDetails
                    definition={definitionModal.definition}
                    definitions={
                      definitionModal.preferLongDefinition ? definitionModalDefinitions : []
                    }
                    etymology={definitionModalEtymology}
                    darkMode={definitionModalDarkMode}
                    showEtymology={definitionModal.preferLongDefinition}
                  />
                ) : (
                  <span>Définition non disponible</span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                {definitionModal.ok &&
                (definitionModal.url || definitionModal.source) ? (
                  definitionModal.url ? (
                    <a
                      href={definitionModal.url}
                      target="_blank"
                      rel="noreferrer"
                      className={definitionModalDarkMode ? "text-amber-300" : "text-blue-600"}
                    >
                      Source :{" "}
                      {definitionModal.source === "wiktionary"
                        ? "Wiktionary"
                        : definitionModal.source === "wikipedia"
                        ? "Wikipedia"
                        : definitionModal.source === "dictionaryapi.dev"
                        ? "Dictionary API"
                        : "Source"}
                    </a>
                  ) : (
                    <span className={definitionModalDarkMode ? "text-amber-300" : "text-blue-600"}>
                      Source :{" "}
                      {definitionModal.source === "wiktionary"
                        ? "Wiktionary"
                        : definitionModal.source === "wikipedia"
                        ? "Wikipedia"
                        : definitionModal.source === "dictionaryapi.dev"
                        ? "Dictionary API"
                        : "Source"}
                    </span>
                  )
                ) : (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      definitionModal.word || ""
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className={definitionModalDarkMode ? "text-amber-300" : "text-blue-600"}
                  >
                    Rechercher sur Google
                  </a>
                )}
                <div className="flex items-center gap-2">
                  <DefinitionVaultButton
                    darkMode={definitionModalDarkMode}
                    fromVault={definitionModal.fromVault}
                    wordInVault={definitionVaultShowsSavedState}
                    pending={wordVaultActionPending}
                    onClick={handleDefinitionVaultAction}
                  />
                  <button
                    type="button"
                    className={`px-2 py-1 rounded border text-[11px] ${
                      definitionModalDarkMode
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : "bg-gray-50 border-gray-200 text-slate-900"
                    }`}
                    onClick={() => {
                      playCloseSound();
                      closeDefinition();
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const wordInfoModalView =
    wordInfoModal.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[12040] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 py-6"
            onClick={closeWordInfoModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-visible ${
                darkMode
                  ? "bg-slate-900/85 border-white/10 text-white"
                  : "bg-white/85 border-slate-200/80 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_DEFINITION ? (
                <div
                  className="absolute -top-14 right-2 z-30 flex items-center gap-2 rounded-full px-3 py-2 text-[16px] font-semibold shadow-xl pointer-events-none border border-amber-300 bg-amber-500 text-slate-900"
                  style={{
                    maxWidth: "360px",
                    opacity: 1,
                  }}
                >
                  La loupe ouvre la définition
                </div>
              ) : null}
              <button
                type="button"
                className="absolute top-3 right-3 z-20 rounded-full h-9 w-12 flex items-center justify-center text-base font-bold text-white cursor-pointer pointer-events-auto select-none"
                onClick={() => {
                  playCloseSound();
                  closeWordInfoModal();
                }}
                aria-label="Fermer"
              >
                <span className="pointer-events-none">X</span>
              </button>
              <div className="p-4 pb-2">
                <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-70">
                  Mot
                </div>
                <div className="text-xl font-extrabold flex items-center gap-2 relative">
                  <span>{wordInfoModal.word}</span>
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] ${
                      darkMode
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : "bg-white border-gray-300 text-gray-700"
                    } ${
                      guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_DEFINITION
                        ? "ring-2 ring-amber-400 guide-pulse"
                        : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDefinition(wordInfoModal.word, { fromWordInfo: true });
                    }}
                    aria-label="Voir la definition"
                    title="Voir la definition"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.65" y1="16.65" x2="21" y2="21" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2 text-xs opacity-70">Trouvé par :</div>
              </div>
              <div className="px-4 pb-4">
                {wordInfoModal.foundBy && wordInfoModal.foundBy.length ? (
                  <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
                    {wordInfoModal.foundBy.map((nick) => (
                      <div
                        key={nick}
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <span>{nick}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm opacity-70 py-4 text-center">
                    Aucun joueur pour ce mot.
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
      {definitionModalView}
      {wordInfoModalView}
    </>
  );
}
