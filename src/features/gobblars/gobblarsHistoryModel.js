import { THEME_PICKER_LABELS, THEME_PICKER_OPTIONS } from "../../theme/themeConfig.js";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short",
});
const number = new Intl.NumberFormat("fr-FR");
const labels = {
  avatar_starter: "Cadeau de bienvenue · avatars",
  avatar_face_gift: "Cadeau · visages gratuits",
  avatar_unlock: "Achat d’éléments d’avatar",
  avatar_refund: "Avatar réinitialisé · remboursement",
  theme_unlock_single: "Achat d’un élément de thème",
  theme_unlock_full: "Achat d’éléments de thème",
  global_bonus: "Bonus offert",
  weekly_duel_winner: "Prime · équipe gagnante du duel hebdomadaire",
  target_quiz_milestone: "Qui veut gagner des Gobblars · palier de 10 000 points",
};
const dayLabel = day => /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day.split("-").reverse().join("/") : "";
const avatarFamilies = {
  base: "Visage", eyes: "Yeux", hair: "Cheveux", brows: "Sourcils", nose: "Nez",
  mouths: "Bouche", facialhair: "Barbe", clothes: "Vêtement", backdrops: "Décor",
  headwear: "Chapeau", glasses: "Lunettes", accessories: "Accessoire", auras: "Aura",
};

function presentItem(item, theme) {
  const key = typeof item?.key === "string" ? item.key : "";
  const separator = key.indexOf(":");
  const family = separator > 0 ? key.slice(0, separator) : "";
  const id = separator > 0 ? key.slice(separator + 1) : key;
  const familyLabel = (theme ? THEME_PICKER_LABELS : avatarFamilies)[family];
  const label = item?.label || (theme && THEME_PICKER_OPTIONS[family]?.find(option => option.id === id)?.label)
    || id || "Élément ancien";
  const amount = Number.isSafeInteger(item?.amount) && item.amount > 0 ? ` : ${number.format(item.amount)} gobblars` : "";
  return `${familyLabel ? `${familyLabel} · ` : ""}${label}${amount}`;
}

export function presentGobblarsMovement(entry) {
  const isDebit = entry.amount < 0;
  const amount = number.format(Math.abs(entry.amount));
  const signedAmount = `${isDebit ? "−" : "+"}${amount}`;
  const amountLabel = `${amount} gobblars ${isDebit ? "dépensés" : entry.kind === "avatar_refund" ? "restitués" : "reçus"}`;
  const time = dateTime.format(new Date(entry.at));
  const title = entry.kind === "tournament" ? "Mini-tournoi"
    : entry.kind === "legacy_live" ? "Anciens gains live"
    : entry.kind === "daily_gobbles" ? "Défis du jour"
    : entry.kind === "manual" ? (isDebit ? "Débit de gobblars" : "Crédit de gobblars")
    : labels[entry.kind] || (isDebit ? "Dépense de gobblars" : "Gain de gobblars");
  const date = entry.kind === "legacy_live" ? `${dayLabel(entry.dateId)} (UTC)`
    : entry.kind === "daily_gobbles" && dayLabel(entry.dateId) ? dayLabel(entry.dateId) : time;
  const details = [];
  if (entry.kind === "weekly_duel_winner") {
    const week = /^(\d{4})-W(\d{2})$/.exec(entry.weekId || "");
    if (week) details.push(`Semaine ${Number(week[2])} de ${week[1]}`);
  }
  if (entry.gobbles > 0) details.push(`${number.format(entry.gobbles)} gobble${entry.gobbles > 1 ? "s" : ""} : +${number.format(entry.gobbles)}`);
  if (entry.medalAmount > 0) {
    const medals = [["gold", "or"], ["silver", "argent"], ["bronze", "bronze"]]
      .filter(([key]) => entry.medals?.[key] > 0)
      .map(([key, label]) => `${entry.medals[key]} ${label}`);
    details.push(`Médailles${medals.length ? ` (${medals.join(", ")})` : ""} : +${number.format(entry.medalAmount)}`);
  }
  const items = Array.isArray(entry.items) ? entry.items.map(item => presentItem(item, entry.kind.startsWith("theme_unlock_"))) : [];
  return { title, date, amount, signedAmount, amountLabel, isDebit, detail: details.join(" · "), items };
}
export const presentGobblarsGain = presentGobblarsMovement;
