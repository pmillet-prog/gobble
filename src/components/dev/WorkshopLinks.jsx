import React from "react";
export default function WorkshopLinks({ className = "" }) {
  return (
    <details className={`rounded-xl border px-3 py-3 ${className}`}>
      <summary className="cursor-pointer font-semibold">Ateliers et simulations</summary>
      <nav className="mt-3 grid gap-2 text-xs" aria-label="Ateliers de développement">
        {[
          // Explicit documents bypass the production serve -s SPA fallback.
          ["/dev/infortune-perspective/index.html", "Roue · atelier 3D, caméra et échanges"],
          ...(import.meta.env.DEV ? [["/entrainement/roue/index.html?reglage=1", "Roue · réglage automatique de l’affichage"]] : []),
          ["/dev/infortune/index.html", "Roue · maquette 2D et physique"],
          ["/dev/infortune-finale/index.html", "Finale · atelier et relecture des énigmes"],
          ["/dev/round-intro/index.html", "Annonces des manches · aperçu"],
          ["/entrainement/roue/index.html", "Roue · test proposé aux joueurs"],
          ["/entrainement/roue/index.html?diagnostics=1", "Roue · diagnostics et retours des joueurs"],
        ].map(([href, label]) => <a key={href} href={href} target="_blank" rel="noopener"
          className="rounded-lg border border-current/20 px-3 py-2 text-inherit no-underline hover:underline">{label} ↗</a>)}
      </nav>
    </details>
  );
}
