// Add donors here: accountName is the exact account nickname, distinct from the
// public thank-you name. The server permanently binds each id to its first account.
export const SUPPORT_DONORS = Object.freeze([
  { id: "isabelle-locher-dizerens", name: "Isabelle Locher-Dizerens", accountName: "Isa1958" },
  { id: "voggle", name: "Voggle", accountName: "Voggle" },
  { id: "beerman", name: "Beerman", accountName: "Beerman" },
  { id: "axioum", name: "Axioum", accountName: "Axioum" },
  { id: "warzowie", name: "Warzowie", accountName: "Warzowie" },
]);
export const DONOR_AVATAR_REWARD = Object.freeze({
  family: "auras", id: "donor_prismatic", key: "auras:donor_prismatic",
  objective: "donor", label: "Aura des donateurs",
  description: "Débloquée automatiquement pour les donateurs du jeu.",
});
export function normalizeDonorAccountName(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr-FR");
}
