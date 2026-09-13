import React from "react";
import { createPortal } from "react-dom";
import useThreeWordsRecapSound from "./useThreeWordsRecapSound.js";
import "./dailySpecialRecap.css";

export default function DailySpecialRecapDialog({ result, review, animate = false, onClose,
  contextLabel = "Grille du jour · 3 mots",
  footerNote = "Tu peux retrouver ce bilan en cliquant sur ton pseudo dans le classement 3 mots.",
}) {
  const dialogRef = React.useRef(null);
  const playVerdictSound = useThreeWordsRecapSound();
  const [revealed, setRevealed] = React.useState(() =>
    animate && typeof window !== "undefined" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : review.length
  );

  React.useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  React.useEffect(() => {
    if (revealed >= review.length) return;
    const timer = window.setTimeout(() => {
      playVerdictSound(review[revealed]);
      setRevealed(count => count + 1);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [revealed, review, playVerdictSound]);

  const complete = revealed >= review.length;
  const validCount = review.filter(entry => entry.valid).length;
  return createPortal(
    <dialog ref={dialogRef} className="daily-special-recap" aria-labelledby="daily-special-recap-title"
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <div className="daily-special-recap-heading">
        <div><p>{contextLabel}</p><h2 id="daily-special-recap-title">Tes mots à la loupe</h2></div>
        <button type="button" className="daily-special-recap-close" onClick={onClose} aria-label="Fermer le récapitulatif">×</button>
      </div>
      <p className="daily-special-recap-intro">Voici les mots retenus et les points qu’ils t’ont rapportés.</p>
      <ol className="daily-special-recap-words" aria-live="polite" aria-relevant="text">
        {review.map((entry, index) => {
          const visible = index < revealed;
          const status = !visible ? "pending" : !entry.word ? "empty" : entry.valid ? "valid" : "invalid";
          return <li key={index} className={`daily-special-recap-word is-${status}`}>
            <div className="daily-special-recap-word-heading">
              <span className="daily-special-recap-number" aria-hidden="true">{index + 1}</span>
              <strong>{entry.word || "Emplacement vide"}</strong>
              <span className="daily-special-recap-points">{visible ? entry.points == null ? "—" : `${entry.points} pts` : "…"}</span>
            </div>
            <div className="daily-special-recap-verdict">
              <span aria-hidden="true">{!visible ? "·" : entry.valid ? "✓" : entry.word ? "×" : "—"}</span>
              <b>{visible ? entry.label : "Révélation…"}</b>
              {visible && entry.explanation ? <p>{entry.explanation}</p> : null}
            </div>
          </li>;
        })}
      </ol>
      <div className="daily-special-recap-total" aria-live="polite">
        <span>{complete ? `${validCount} mot${validCount > 1 ? "s" : ""} validé${validCount > 1 ? "s" : ""} sur 3` : "Découvrons ton résultat…"}</span>
        <strong>{complete ? `${Number(result.score) || 0} pts` : "…"}</strong>
      </div>
      {complete && review.some(entry => entry.valid && entry.points == null) ?
        <p className="daily-special-recap-note">Le détail des points par mot n’a pas été conservé pour cette ancienne partie.</p> : null}
      {footerNote ? <p className="daily-special-recap-note">{footerNote}</p> : null}
      <button type="button" className="daily-special-recap-done" onClick={complete ? onClose : () => setRevealed(review.length)}>
        {complete ? "Voir le classement" : "Tout afficher"}
      </button>
    </dialog>, document.body
  );
}
