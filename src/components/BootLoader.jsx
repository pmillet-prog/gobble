import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const BOOT_FUN_MESSAGES = [
  "Jonglage avec les tuiles",
  "Mélange des lettres",
  "Secouage du gobelet",
  "Polissage des cases",
  "Affûtage des consonnes",
  "Hydratation des voyelles",
  "Préparation du plateau",
  "Réglage du chrono",
  "Synchronisation des cerveaux",
  "Dressage des G",
  "Mise en orbite des tuiles",
  "Calibrage du score",
  "Tri des mots trop faciles",
  "Chasse aux doublons",
  "Compression du dictionnaire",
  "Remplissage des sacs de lettres",
  "Cuisson des anagrammes",
];

function pickNextFunMessage(previous = "") {
  if (BOOT_FUN_MESSAGES.length <= 1) return BOOT_FUN_MESSAGES[0] || "Préparation du jeu";
  const candidates = BOOT_FUN_MESSAGES.filter((message) => message !== previous);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function resolveProgressValue(progress) {
  if (typeof progress === "number") return progress;
  if (
    Number.isFinite(progress?.loaded) &&
    Number.isFinite(progress?.total) &&
    progress.total > 0
  ) {
    return progress.loaded / progress.total;
  }
  return 0;
}

function BootLoader({
  fadeDurationMs = 500,
  fadingOut = false,
  gifSrc = "/introgobble.gif",
  progress = 0,
  slowThresholdMs = 3500,
}) {
  const [gifLoadFailed, setGifLoadFailed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [funMessage, setFunMessage] = useState(() => pickNextFunMessage());
  const startedAtRef = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const tick = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      setElapsedMs(Math.max(0, now - startedAtRef.current));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let timerId = null;
    const scheduleNext = () => {
      const delayMs = 1200 + Math.floor(Math.random() * 700);
      timerId = window.setTimeout(() => {
        setFunMessage((previous) => pickNextFunMessage(previous));
        scheduleNext();
      }, delayMs);
    };
    scheduleNext();
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  if (typeof document === "undefined") return null;

  const progressValue = resolveProgressValue(progress);
  const clamped = Number.isFinite(progressValue)
    ? Math.min(Math.max(progressValue, 0), 1)
    : 0;
  const percent = Math.round(clamped * 100);
  const isBootDone = !!(typeof progress === "object" && progress?.done);
  const isSlowLoading = !isBootDone && elapsedMs >= slowThresholdMs;
  const transitionMs = Math.max(0, Number(fadeDurationMs) || 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[14000] flex min-h-dvh items-center justify-center overflow-hidden bg-white text-black"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: "#ffffff",
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${transitionMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
      role="status"
      aria-live="polite"
      aria-label={`Préparation du jeu, ${percent} %`}
    >
      <style>{`
@keyframes gobbleBootArtIn {
  0% { opacity: 0; transform: scale(0.975); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes gobbleBootStatusIn {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes gobbleBootDot {
  0%, 70%, 100% { opacity: 0.18; transform: scale(0.72); }
  35% { opacity: 0.72; transform: scale(1); }
}
.gobble-boot-art {
  animation: gobbleBootArtIn 850ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.gobble-boot-status {
  animation: gobbleBootStatusIn 650ms 180ms ease-out both;
}
.gobble-boot-dot {
  animation: gobbleBootDot 1.35s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .gobble-boot-art,
  .gobble-boot-status,
  .gobble-boot-dot {
    animation: none;
  }
}
`}</style>

      <div className="relative flex w-full flex-col items-center justify-center px-0 pb-[3vh]">
        <img
          src={gifLoadFailed ? "/favicon.png" : gifSrc}
          alt="Gobble"
          className={`gobble-boot-art block h-auto object-contain ${
            gifLoadFailed ? "w-24 sm:w-28" : "w-full max-w-[512px]"
          }`}
          style={{ maxHeight: gifLoadFailed ? "112px" : "min(62dvh, 560px)" }}
          draggable="false"
          onError={() => setGifLoadFailed(true)}
        />

        <div className="gobble-boot-status mt-1 flex min-h-8 flex-col items-center text-neutral-400">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.28em] sm:text-[11px]">
            <span>{funMessage}</span>
            <span className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="gobble-boot-dot h-1 w-1 rounded-full bg-current"
                  style={{ animationDelay: `${index * 150}ms` }}
                />
              ))}
            </span>
          </div>
          {isSlowLoading ? (
            <div className="mt-2 text-[10px] font-medium tracking-wide text-neutral-300">
              Connexion plus lente que prévu…
            </div>
          ) : null}
        </div>

        <span className="sr-only">Chargement à {percent} %</span>
      </div>
    </div>,
    document.body
  );
}

export default React.memo(BootLoader);
