import { IMAGE_KEYS } from "./assets/assetKeys";

export const VOCAB_LEVELS = [
  { key: "creche", label: "Cr\u00e8che", min: 0, max: 500, imageKey: IMAGE_KEYS.vocab.creche, color: "#f59e0b" },
  { key: "maternelle", label: "Maternelle", min: 500, max: 1200, imageKey: IMAGE_KEYS.vocab.maternelle, color: "#f97316" },
  { key: "primaire", label: "Primaire", min: 1200, max: 2500, imageKey: IMAGE_KEYS.vocab.primaire, color: "#22c55e" },
  { key: "college", label: "Coll\u00e8ge", min: 2500, max: 5000, imageKey: IMAGE_KEYS.vocab.college, color: "#14b8a6" },
  { key: "lycee", label: "Lyc\u00e9e", min: 5000, max: 9000, imageKey: IMAGE_KEYS.vocab.lycee, color: "#3b82f6" },
  { key: "bac", label: "Bac", min: 9000, max: 15000, imageKey: IMAGE_KEYS.vocab.bac, color: "#6366f1" },
  { key: "prepa", label: "Pr\u00e9pa", min: 15000, max: 23000, imageKey: IMAGE_KEYS.vocab.prepa, color: "#8b5cf6" },
  { key: "universite", label: "Universit\u00e9", min: 23000, max: 34000, imageKey: IMAGE_KEYS.vocab.universite, color: "#ec4899" },
  { key: "licence", label: "Licence", min: 34000, max: 48000, imageKey: IMAGE_KEYS.vocab.licence, color: "#ef4444" },
  { key: "master", label: "Master", min: 48000, max: 68000, imageKey: IMAGE_KEYS.vocab.master, color: "#eab308" },
  { key: "doctorat", label: "Doctorat", min: 68000, max: 95000, imageKey: IMAGE_KEYS.vocab.doctorat, color: "#facc15" },
  { key: "academie", label: "Acad\u00e9mie", min: 95000, max: 300000, imageKey: IMAGE_KEYS.vocab.academie, color: "#f8fafc" },
];

export function getVocabLevelMeta(count) {
  const safe = Number.isFinite(count) ? Math.max(0, count) : 0;
  for (const level of VOCAB_LEVELS) {
    if (safe >= level.min && safe < level.max) return level;
  }
  return VOCAB_LEVELS[VOCAB_LEVELS.length - 1];
}

export function getVocabRankImageUrl(levelOrKey) {
  const key =
    typeof levelOrKey === "string"
      ? levelOrKey
      : typeof levelOrKey?.key === "string"
      ? levelOrKey.key
      : "";
  return key ? `/vocab-ranks/${key}.png` : "";
}
