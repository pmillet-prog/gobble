import React from "react";
export default function WorkshopLinks({ className = "" }) {
  return (
    <details className={`rounded-xl border px-3 py-3 ${className}`}>
      <summary className="cursor-pointer font-semibold">Ateliers et simulations</summary>
      <nav className="mt-3 grid gap-2 text-xs" aria-label="Ateliers de développement">
        {[
          ["/dev/infortune-perspective/", "Roue · atelier 3D, caméra et échanges"],
          ["/dev/infortune/", "Roue · maquette 2D et physique"],
          ["/dev/infortune-finale/", "Finale · atelier et relecture des énigmes"],
          ["/dev/round-intro/", "Annonces des manches · aperçu"],
          ["/entrainement/roue/", "Roue · test proposé aux joueurs"],
          ["/entrainement/roue/?diagnostics=1", "Roue · diagnostics et retours des joueurs"],
        ].map(([href, label]) => <a key={href} href={href} target="_blank" rel="noopener"
          className="rounded-lg border border-current/20 px-3 py-2 text-inherit no-underline hover:underline">{label} ↗</a>)}
      </nav>
    </details>
  );
}
