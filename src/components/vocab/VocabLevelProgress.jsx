import React from "react";

import "./vocabProgressOverlay.css";

const number = new Intl.NumberFormat("fr-FR");
const clamp = value => Math.max(0, Math.min(1, value));

export default React.memo(function VocabLevelProgress({
  baseCount, count, delta, level, imageSrc, imageClass, levelUp, settling,
}) {
  const min = Number(level?.min) || 0;
  const max = Math.max(min + 1, Number(level?.max) || count);
  const progress = clamp((count - min) / (max - min));
  const baseProgress = clamp((baseCount - min) / (max - min));
  const remaining = Math.max(0, max - count);

  return (
    <section className="vocab-level-card" aria-label="Progression des mots uniques">
      <div className="vocab-level-heading">
        <div className="vocab-level-portrait">
          {imageSrc ? (
            <img src={imageSrc} alt="" className={imageClass} draggable={false} />
          ) : <span aria-hidden="true">✦</span>}
        </div>
        <div className="vocab-level-details">
          <div className="vocab-section-label">Mots uniques · saison</div>
          <div className="vocab-level-name">{level?.label || "Votre niveau"}</div>
          <div className="vocab-level-total"><strong>{number.format(count)}</strong> mots</div>
        </div>
        <div className={`vocab-level-gain${settling && delta > 0 ? " vocab-level-gain-settle" : ""}`}>
          <strong>+{number.format(delta)}</strong>
          <span>{levelUp ? "Niveau gagné !" : delta === 1 ? "nouveau mot" : "nouveaux mots"}</span>
        </div>
      </div>
      <div
        className="vocab-level-track"
        role="progressbar"
        aria-label={`Progression du niveau ${level?.label || "vocabulaire"}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.min(max, Math.max(min, count))}
        aria-valuetext={`${number.format(count)} mots uniques`}
      >
        <div className="vocab-level-fill vocab-level-fill-new" style={{ transform: `scaleX(${progress})` }} />
        <div
          className={`vocab-level-fill vocab-level-fill-base${settling ? " vocab-level-fill-settle" : ""}`}
          style={{ transform: `scaleX(${settling ? progress : baseProgress})` }}
        />
      </div>
      <div className="vocab-level-caption">
        <span>{number.format(min)}</span>
        <span>{remaining > 0 ? `${number.format(remaining)} mots avant ${number.format(max)}` : "Palier atteint"}</span>
      </div>
    </section>
  );
});
