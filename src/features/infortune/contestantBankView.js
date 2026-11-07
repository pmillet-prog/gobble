const SPIN_LABELS = Object.freeze({
  pending: "Lancer en attente",
  done: "Lancer terminé",
  skipped: "Lancer passé",
});

// Both the desk and the 2D cards consume the authoritative snapshot. Missing
// balances are unknown, not zero; round four must conceal even stale amounts.
export function contestantBankView(economy, playerId) {
  const member = economy?.members?.[playerId];
  const hidden = Boolean(economy?.hidden) && member?.revealed !== true;
  return {
    amount: hidden ? "Cagnotte masquée"
      : Number.isFinite(member?.bank) ? `${member.bank.toLocaleString("fr-FR")} €` : "—",
    hidden,
    status: SPIN_LABELS[member?.spin] || null,
  };
}
