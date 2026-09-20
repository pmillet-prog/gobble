import React from "react";
import { useOptionalApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { playerProfileUserId } from "../../features/overlays/playerProfileTarget.js";

export default function PlayerProfileLink({ entry, children, className = "" }) {
  // The application already owns the overlay feature. A nickname needs no
  // subscription or per-row lease; standalone visual previews remain passive.
  const kernel = useOptionalApplicationKernel();
  const userId = playerProfileUserId(entry);
  const label = children ?? entry?.nick ?? "Joueur";
  if (!userId || !kernel) return <span className={className}>{label}</span>;
  return <button type="button" className={`text-left hover:underline underline-offset-2 ${className}`}
    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}
    title={`Voir le profil de ${entry.nick || "ce joueur"}`} onClick={event => {
      event.stopPropagation();
      kernel.features.prepare("overlays").openPlayerProfile({ userId, nick: entry.nick });
    }}>{label}</button>;
}
