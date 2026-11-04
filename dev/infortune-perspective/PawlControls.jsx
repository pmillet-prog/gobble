import React from "react";

const NOTES = {
  classic: "Le curseur actuel et son rappel élastique sont conservés.",
  needle: "Une aiguille fine et souple. Les taquets peuvent la retenir puis la libérer, ou la roue repartir en arrière.",
  pivot: "Une pièce rigide en goutte, articulée au centre de sa base ronde. Le ressort du pivot la rappelle après le passage des taquets, sans plier la pièce.",
};

export function PawlControls({ value, onChange, disabled }) {
  return <section className="perspective-workshop__camera" aria-label="Comparer les curseurs">
    <h2>Le curseur</h2>
    <div className="perspective-workshop__reflection-modes perspective-workshop__pawl-modes" role="group" aria-label="Forme du curseur">
      <button type="button" disabled={disabled} aria-pressed={value === "classic"} onClick={() => onChange("classic")}>Languette actuelle</button>
      <button type="button" disabled={disabled} aria-pressed={value === "needle"} onClick={() => onChange("needle")}>Aiguille souple</button>
      <button type="button" disabled={disabled} aria-pressed={value === "pivot"} onClick={() => onChange("pivot")}>Goutte sur pivot</button>
    </div>
    <p className="perspective-workshop__camera-note">{NOTES[value]}</p>
    <p className="perspective-workshop__camera-note">Changez de curseur entre deux lancers. Le changement prépare un nouveau tour.</p>
  </section>;
}
