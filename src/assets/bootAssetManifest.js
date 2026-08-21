import { IMAGE_KEYS } from "./assetKeys.js";
import ASSET_MANIFEST_BASE from "./assetManifest.js";

const BOOT_ASSET_IMAGES = [
  { key: IMAGE_KEYS.favicon, url: "/favicon.png", priority: "critical" },
  { key: IMAGE_KEYS.gobbleBadge, url: "/g.png", priority: "critical" },
  { key: IMAGE_KEYS.gobblarsBadge, url: "/Gobblars.png", priority: "critical" },
  { key: IMAGE_KEYS.bigwords.gobble, url: "/bigwords/gobble.webp", priority: "critical" },
  {
    key: IMAGE_KEYS.bigwords.doubleGobble,
    url: "/bigwords/doublegobble.webp",
    priority: "critical",
  },
  { key: IMAGE_KEYS.bigwords.epique, url: "/bigwords/epique.webp", priority: "critical" },
  { key: IMAGE_KEYS.bigwords.enorme, url: "/bigwords/enorme.webp", priority: "high" },
  { key: IMAGE_KEYS.bigwords.excellent, url: "/bigwords/excellent.webp", priority: "high" },
  { key: IMAGE_KEYS.bigwords.fabuleux, url: "/bigwords/fabuleux.webp", priority: "high" },
  { key: IMAGE_KEYS.bigwords.bonus, url: "/bigwords/bonus.webp", priority: "high" },
  { key: IMAGE_KEYS.vocab.creche, url: "/vocab-ranks/creche.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.maternelle, url: "/vocab-ranks/maternelle.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.primaire, url: "/vocab-ranks/primaire.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.college, url: "/vocab-ranks/college.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.lycee, url: "/vocab-ranks/lycee.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.bac, url: "/vocab-ranks/bac.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.prepa, url: "/vocab-ranks/prepa.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.universite, url: "/vocab-ranks/universite.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.licence, url: "/vocab-ranks/licence.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.master, url: "/vocab-ranks/master.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.doctorat, url: "/vocab-ranks/doctorat.png", priority: "low" },
  { key: IMAGE_KEYS.vocab.academie, url: "/vocab-ranks/academie.png", priority: "low" },
];

const BOOT_ASSET_FILES = [
  "/privacy.html",
  "/privacy/index.html",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/icon.svg",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/sw.js",
  "/.well-known/assetlinks.json",
];

function splitUrlPathAndSuffix(src) {
  const raw = String(src || "").trim();
  if (!raw) return { path: "", suffix: "" };
  const queryIdx = raw.indexOf("?");
  const hashIdx = raw.indexOf("#");
  let cut = raw.length;
  if (queryIdx >= 0) cut = Math.min(cut, queryIdx);
  if (hashIdx >= 0) cut = Math.min(cut, hashIdx);
  return { path: raw.slice(0, cut), suffix: raw.slice(cut) };
}

function stripExtension(src) {
  const { path, suffix } = splitUrlPathAndSuffix(src);
  if (!path) return String(src || "");
  return `${path.replace(/\.[a-z0-9]{2,5}$/i, "")}${suffix}`;
}

function buildImageCandidates(url) {
  const cleaned = stripExtension(url);
  const { path, suffix } = splitUrlPathAndSuffix(cleaned);
  if (!path) return [url];
  return ["webp", "png"].map((extension) => `${path}.${extension}${suffix}`);
}

function buildImageManifest(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    key: item.key,
    type: "image",
    candidates: buildImageCandidates(item.url),
    priority: item.priority,
  }));
}

export function makeFileKey(url) {
  return `file_${String(url || "")
    .replace(/^\//, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()}`;
}

export function buildFileManifest(items) {
  return (Array.isArray(items) ? items : []).map((url) => ({
    key: makeFileKey(url),
    type: "file",
    candidates: [url],
    priority: "low",
  }));
}

export function dedupeManifest(entries) {
  const map = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (entry?.key) map.set(entry.key, entry);
  });
  return Array.from(map.values());
}

export const IMAGE_FALLBACKS = new Map(
  BOOT_ASSET_IMAGES.map((entry) => [entry.key, entry.url])
);

export const BOOT_ASSET_MANIFEST_BASE = dedupeManifest([
  ...ASSET_MANIFEST_BASE.filter((entry) => entry?.type !== "sfx"),
  ...buildImageManifest(BOOT_ASSET_IMAGES),
  ...buildFileManifest(BOOT_ASSET_FILES),
]);
