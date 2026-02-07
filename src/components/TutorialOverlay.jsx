import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tileScore } from "./gameLogic";

const DEMO_GRID_SIZE = 4;
const DEMO_GRID = [
  "G", "O", "B", "L",
  "A", "B", "E", "E",
  "R", "L", "E", "T",
  "N", "S", "I", "X",
];
const DEMO_PATH = [0, 1, 2, 5, 9, 10];
const SCORE_SAMPLE_TILES = ["E", "D", "B", "F", "J", "Z"];
const BONUS_TILE_CLASSES = {
  L2: "bg-[rgba(163,196,243,0.85)] border-[rgba(99,147,230,0.9)] border-2",
  L3: "bg-[rgba(51,93,227,0.8)] border-[rgba(30,64,175,0.95)] text-white border-2",
  M2: "bg-[rgba(255,191,180,0.9)] border-[rgba(248,113,113,0.95)] border-2",
  M3: "bg-[rgba(239,68,68,0.85)] border-[rgba(185,28,28,0.95)] text-white border-2",
};
const BONUS_LETTER_TILES = ["L2", "L3"];
const BONUS_WORD_TILES = ["M2", "M3"];

const STEPS = [
  {
    key: "basics",
    title: "Tracer un mot",
    lead:
      "Glisse ton doigt pour relier des tuiles adjacentes sur la grille.",
    bullets: [
      "Adjacentes = haut, bas, gauche, droite, diagonale.",
      "Minimum 2 lettres, une tuile ne peut pas etre réutilisée.",
      "Relâche pour valider le mot.",
    ],
    showDemo: true,
  },
  {
    key: "score",
    title: "Score",
    lead:
      "Le score dépend des lettres, de la longueur du mot et des bonus.",
    bullets: [
      "Score = somme des lettres + bonus de longueur.",
      "Bonus L2/L3 multiplient la lettre.",
      "Bonus M2/M3 multiplient le mot.",
    ],
  },
  {
    key: "dictionary",
    title: "Dictionnaire",
    lead:
      "Le dictionnaire est la pour aider, mais il n'est pas toujours intelligent (:p).",
    bullets: [
      "En fin de manche, la petite loupe peut afficher la definition d'un mot.",
      "Cliquer sur n'importe quel mot indique qui l'a trouve.",
      "La liste des mots permet aussi d'ouvrir leur definition.",
    ],
  },
  {
    key: "tournament",
    title: "Mini tournoi",
    lead:
      "Chaque partie se joue en 5 manches, avec des variantes en milieu de tournoi.",
    bullets: [
      "5 manches au total.",
      "Les manches 2 et 4 sont spéciales.",
      "Speciales possibles : mot le plus long, meilleur mot, rapidite (11 pts), lettre en or, grille monstrueuse.",
    ],
  },
  {
    key: "gobble",
    title: "Gobbles",
    lead:
      "Hors certaines manches speciales, chaque grille peut rapporter 2 gobbles.",
    bullets: [
      "1 gobble pour le ou les mots les plus longs de la grille.",
      "1 gobble pour le mot qui rapporte le plus de points.",
      "Chaque gobble ajoute automatiquement 1 point au classement du mini-tournoi.",
    ],
    imageSrc: "/bigwords/gobble.png",
    imageAlt: "Gobble",
    imageAspect: 823 / 223,
  },
  {
    key: "vocab",
    title: "Vocabulaire",
    lead:
      "Le jeu suit ta progression avec les mots uniques que tu decouvres.",
    bullets: [
      "Chaque mot unique ajoute 1 a ton vocabulaire.",
      "Un mot déjà trouvé ne compte pas.",
      "Plus tu accumules, plus ton niveau de vocabulaire monte.",
      "sauras-tu atteindre le haut du classement ?"
    ],
    imageSrc: "/vocab-ranks/debutant.png",
    imageAlt: "Grade debutant",
    imageAspect: 1,
  },
];

function buildFingerKeyframes(name, path, cellSize, gap, fingerSize) {
  const step = cellSize + gap;
  const frames = path
    .map((index, idx) => {
      const row = Math.floor(index / DEMO_GRID_SIZE);
      const col = index % DEMO_GRID_SIZE;
      const x = col * step + cellSize / 2 - fingerSize / 2;
      const y = row * step + cellSize / 2 - fingerSize / 2;
      const pct = Math.round((idx / (path.length - 1)) * 100);
      return `${pct}% { transform: translate(${x}px, ${y}px); }`;
    })
    .join("\n");
  return `@keyframes ${name} {\n${frames}\n}`;
}

function getBonusBadgeClass(bonus) {
  if (bonus === "M3") return "bg-red-600 text-white";
  if (bonus === "M2") return "bg-blue-700 text-white";
  return "bg-amber-600 text-white";
}

function TutorialOverlay({
  open,
  darkMode,
  onComplete,
  initialStep = 0,
}) {
  const [stepIndex, setStepIndex] = useState(initialStep);
  const imageCacheRef = useRef(new Set());
  const [, forceImageTick] = useState(0);
  const step = STEPS[stepIndex] || STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  useEffect(() => {
    if (open) setStepIndex(initialStep);
  }, [open, initialStep]);
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    let cancelled = false;
    const sources = STEPS.map((entry) => entry.imageSrc).filter(Boolean);
    sources.forEach((src) => {
      if (imageCacheRef.current.has(src)) return;
      const img = new Image();
      const finalize = () => {
        if (cancelled) return;
        imageCacheRef.current.add(src);
        forceImageTick((tick) => tick + 1);
      };
      img.onload = finalize;
      img.onerror = finalize;
      img.src = src;
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const demo = useMemo(() => {
    if (!step?.showDemo) return null;
    const cellSize = 44;
    const gap = 6;
    const fingerSize = 20;
    const keyframeName = `tutorialFinger${step.key}`;
    const keyframeCss = buildFingerKeyframes(
      keyframeName,
      DEMO_PATH,
      cellSize,
      gap,
      fingerSize
    );
    const gridStyle = {
      width: `${DEMO_GRID_SIZE * cellSize + (DEMO_GRID_SIZE - 1) * gap}px`,
      height: `${DEMO_GRID_SIZE * cellSize + (DEMO_GRID_SIZE - 1) * gap}px`,
      gridTemplateColumns: `repeat(${DEMO_GRID_SIZE}, ${cellSize}px)`,
      gridTemplateRows: `repeat(${DEMO_GRID_SIZE}, ${cellSize}px)`,
      gap: `${gap}px`,
      boxSizing: "content-box",
    };
    const pathSet = new Set(DEMO_PATH);
    const pathDelayMap = new Map();
    DEMO_PATH.forEach((index, order) => {
      pathDelayMap.set(index, order);
    });

    return (
      <div className="relative">
        <style>{`
${keyframeCss}
@keyframes tutorialPulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.6); }
  60% { transform: scale(1.03); box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
}
`}</style>
        <div
          className={`grid rounded-xl border p-2 ${
            darkMode
              ? "bg-slate-900/60 border-slate-700"
              : "bg-white/80 border-slate-200"
          }`}
          style={gridStyle}
          aria-hidden="true"
        >
          {DEMO_GRID.map((letter, idx) => (
            <div
              key={`${letter}-${idx}`}
              className={`flex items-center justify-center rounded-lg text-sm font-black tracking-wide ${
                darkMode ? "bg-slate-800 text-slate-100" : "bg-slate-50 text-slate-900"
              }`}
              style={{
                animation: pathSet.has(idx) ? "tutorialPulse 2.6s ease-in-out infinite" : "none",
                animationDelay: pathSet.has(idx)
                  ? `${pathDelayMap.get(idx) * 0.2}s`
                  : "0s",
              }}
            >
              {letter}
            </div>
          ))}
        </div>
        <div
          className="absolute top-2 left-2 pointer-events-none"
          style={{
            width: `${fingerSize}px`,
            height: `${fingerSize}px`,
            borderRadius: "9999px",
            background: darkMode ? "rgba(251, 191, 36, 0.9)" : "rgba(245, 158, 11, 0.95)",
            boxShadow: darkMode
              ? "0 0 0 4px rgba(30, 41, 59, 0.7)"
              : "0 0 0 4px rgba(255, 255, 255, 0.8)",
            animation: `${keyframeName} 3.6s ease-in-out infinite`,
          }}
        />
      </div>
    );
  }, [darkMode, step]);

  const scoreTileStyle = {
    width: 44,
    height: 44,
    fontSize: "18px",
  };
  const scoreLetterStyle = {
    color: "#0f172a",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.85), 0 3px 10px rgba(0, 0, 0, 0.22)",
  };
  const scorePointsStyle = {
    position: "absolute",
    right: "6px",
    bottom: "6px",
    fontSize: "0.60rem",
    lineHeight: 1,
    fontWeight: 900,
    padding: 0,
    background: "transparent",
    color: "#000",
    boxShadow: "none",
  };
  const bonusLetter = "A";
  const bonusLetterPoints = tileScore({ letter: bonusLetter });
  const scoreExtras =
    step.key === "score" ? (
      <div className="mt-1 flex flex-col gap-3" aria-hidden="true">
        <div>
          <div className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            Valeurs des lettres (Scrabble)
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {SCORE_SAMPLE_TILES.map((letter) => {
              const points = tileScore({ letter });
              return (
                <div
                  key={letter}
                  className="relative rounded-lg flex items-center justify-center font-extrabold select-none bg-orange-200 border-orange-500 border-2"
                  style={scoreTileStyle}
                >
                  <span className="tile-letter" style={scoreLetterStyle}>
                    {letter}
                  </span>
                  <span className="tile-points" style={scorePointsStyle}>
                    {points}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            Tuiles speciales
          </div>
          <div className="mt-1 flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                L2/L3
              </span>
              <div className="flex gap-2">
                {BONUS_LETTER_TILES.map((bonus) => (
                  <div
                    key={bonus}
                    className={`relative rounded-lg flex items-center justify-center font-extrabold select-none ${BONUS_TILE_CLASSES[bonus]}`}
                    style={scoreTileStyle}
                  >
                    <span className="tile-letter" style={scoreLetterStyle}>
                      {bonusLetter}
                    </span>
                    <span className="tile-points" style={scorePointsStyle}>
                      {bonusLetterPoints}
                    </span>
                    <span
                      className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${getBonusBadgeClass(
                        bonus
                      )}`}
                    >
                      {bonus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                M2/M3
              </span>
              <div className="flex gap-2">
                {BONUS_WORD_TILES.map((bonus) => (
                  <div
                    key={bonus}
                    className={`relative rounded-lg flex items-center justify-center font-extrabold select-none ${BONUS_TILE_CLASSES[bonus]}`}
                    style={scoreTileStyle}
                  >
                    <span className="tile-letter" style={scoreLetterStyle}>
                      {bonusLetter}
                    </span>
                    <span className="tile-points" style={scorePointsStyle}>
                      {bonusLetterPoints}
                    </span>
                    <span
                      className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${getBonusBadgeClass(
                        bonus
                      )}`}
                    >
                      {bonus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null;
  const stepImageMaxWidth = step.key === "vocab" ? 140 : 220;
  const stepImageRatio = Number.isFinite(step.imageAspect)
    ? step.imageAspect
    : 1;
  const stepImageLoaded = step.imageSrc
    ? imageCacheRef.current.has(step.imageSrc)
    : true;
  const stepImage = step.imageSrc ? (
    <div
      className={`self-start rounded-xl border p-2 ${
        darkMode ? "bg-slate-900/60 border-slate-700" : "bg-white/80 border-slate-200"
      }`}
    >
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          width: `${stepImageMaxWidth}px`,
          aspectRatio: `${stepImageRatio}`,
        }}
      >
        {!stepImageLoaded ? (
          <div
            className={`absolute inset-0 ${darkMode ? "bg-slate-700/40" : "bg-slate-200/70"} animate-pulse`}
          />
        ) : null}
        <img
          src={step.imageSrc}
          alt={step.imageAlt || ""}
          loading="eager"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
            stepImageLoaded ? "opacity-100" : "opacity-0"
          }`}
          draggable="false"
        />
      </div>
    </div>
  ) : null;

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[13050] flex items-center justify-center px-4 py-6">
      <div
        className={`absolute inset-0 ${
          darkMode ? "bg-black/60" : "bg-white/60"
        } backdrop-blur-sm`}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-w-lg rounded-2xl border p-4 shadow-2xl ${
          darkMode
            ? "bg-slate-900/95 border-slate-700 text-slate-100"
            : "bg-white/95 border-slate-200 text-slate-900"
        }`}
      >
        <div className="text-[11px] font-extrabold tracking-widest uppercase text-amber-500">
          Didacticiel
        </div>
        <div className="mt-1 flex items-center justify-between">
          <div className="text-lg font-black">{step.title}</div>
          <div className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
            {stepIndex + 1}/{STEPS.length}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {demo}
          <p className={`text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            {step.lead}
          </p>
          {stepImage}
          <ul className="text-[12px] list-disc list-inside space-y-1">
            {step.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {step.key === "vocab" ? (
            <p className={`text-[11px] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
              Pour toute question, réclamation ou suggestion, écrire à{" "}
              <a
                href="mailto:support@gobble.fr"
                className="underline underline-offset-2"
              >
                support@gobble.fr
              </a>
            </p>
          ) : null}
          {scoreExtras}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              isFirst
                ? "opacity-0 pointer-events-none"
                : darkMode
                ? "bg-slate-800 hover:bg-slate-700"
                : "bg-slate-100 hover:bg-slate-200"
            }`}
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
          >
            Précédent
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
              darkMode ? "bg-amber-500 hover:bg-amber-400" : "bg-amber-500 hover:bg-amber-400"
            }`}
            onClick={() => {
              if (isLast) {
                onComplete?.();
              } else {
                setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1));
              }
            }}
          >
            {isLast ? "Compris" : "Suivant"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default React.memo(TutorialOverlay);
