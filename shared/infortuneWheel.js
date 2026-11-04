// Shared denominations: the client simulates the spin, the server accounts for
// the actual slot, never for an amount supplied by a browser.
export const WHEEL_SECTORS = Object.freeze([
  ["pass", "#b8c5d3"], [100, "#9bdb84"], [200, "#baa0ed"], [300, "#f58fb7"],
  [500, "#61d8ce"], [150, "#73bdf4"], ["bonus", "#ffd255"], [200, "#f6d668"],
  [250, "#f7a36e"], [100, "#83d4bc"], [150, "#76bff0"], [400, "#b6a0ea"],
  ["bankrupt", "#20212a"], [500, "#f49078"], [200, "#baa0ed"], [150, "#ff9b76"],
  [300, "#65d2cd"], [100, "#8ad7b5"], [1000, "#ffd255"], [150, "#ff995e"],
  [200, "#79b9ed"], [500, "#ee92b4"], [150, "#f4d86e"], [400, "#b7a0ef"],
].map(([value, color], index) => Object.freeze({
  id: `sector-${index}`, kind: typeof value === "number" ? "amount" : value,
  amount: typeof value === "number" ? value : value === "pass" ? 0 : null,
  label: value === "bankrupt" ? "Banqueroute" : value === "bonus" ? "Bonus" : value === "pass" ? "Passe" : `${value} €`, color,
})));

// Three 100s, eight sectors apart: every one becomes an exchange tile.
// The special pairs stay opposite; other amounts are spread around them.
export const EXCHANGE_SECTOR_INDICES = Object.freeze(WHEEL_SECTORS.flatMap((sector, index) =>
  sector.kind === "amount" && sector.amount === 100 ? [index] : []));
export const EXCHANGE_SECTORS = Object.freeze(WHEEL_SECTORS.map((sector, index) =>
  EXCHANGE_SECTOR_INDICES.includes(index) ? Object.freeze({ ...sector, kind: "exchange", amount: null, label: "Échange", color: "#56d9e9" }) : sector));
export const infortuneSectors = exchange => exchange ? EXCHANGE_SECTORS : WHEEL_SECTORS;
export const INFORTUNE_REWARDS = Object.freeze({ gobble: 100, bonus: 1000, good: 50, perfect: 100 });

export function applyInfortuneResult(bank, sector, quality) {
  const launchBonus = quality === "perfect" ? INFORTUNE_REWARDS.perfect : quality === "good" ? INFORTUNE_REWARDS.good : 0;
  if (sector.kind === "bankrupt") return 0;
  return bank + launchBonus + (sector.kind === "amount" ? sector.amount : sector.kind === "bonus" ? INFORTUNE_REWARDS.bonus : 0);
}
