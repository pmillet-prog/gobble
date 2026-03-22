import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "gobble.db");

export const THEME_UNLOCK_COST = 500;
export const WEEKLY_WIN_GOBBLARS_BONUS = 100;
export const GLOBAL_GRANT_GOBBLARS_BONUS = 500;
const GLOBAL_GRANT_KEY = "all_players_bonus_2026_02_22";

const LOCKABLE_THEME_CATEGORIES = [
  "tileColor",
  "font",
  "letterColor",
  "background",
  "material",
  "specialIndicator",
];

const TILE_COLOR_IDS = new Set([
  "native",
  "white",
  "amber",
  "sand",
  "ivory",
  "mint",
  "ocean",
  "lavender",
  "rose",
  "slate",
  "charcoal",
  "neon",
  "wood",
  "marble",
  "jeans",
  "concrete",
]);
const FONT_IDS = new Set([
  "classic",
  "serif",
  "rounded",
  "mono",
  "kgp",
  "display",
  "draft",
  "starwars",
]);
const LETTER_COLOR_IDS = new Set([
  "slate",
  "white",
  "ink",
  "navy",
  "emerald",
  "choco",
  "burgundy",
  "violet",
  "teal",
  "coral",
  "gold",
]);
const BACKGROUND_IDS = new Set([
  "app-default",
  "solid-white",
  "solid-sky",
  "solid-forest",
  "solid-night",
  "solid-sand",
  "solid-rose",
  "paper-letters",
  "paper-hearts",
  "paper-stars",
  "paper-bubbles",
  "paper-confetti",
]);
const MATERIAL_IDS = new Set([
  "native",
  "bubble",
  "rounded-square",
  "square",
  "wood",
  "classic",
]);
const SPECIAL_INDICATOR_IDS = new Set(["fill", "ring", "badge"]);
const UI_CONTRAST_IDS = new Set(["normal", "soft", "strong"]);
const TILE_LETTER_SCALE_MIN = 0.8;
const TILE_LETTER_SCALE_MAX = 1.45;
const TILE_LETTER_SCALE_DEFAULT = 1.2;

const DEFAULT_THEME = {
  darkMode: false,
  tileColor: "native",
  font: "classic",
  letterScale: TILE_LETTER_SCALE_DEFAULT,
  letterColor: "slate",
  background: "app-default",
  material: "native",
  specialIndicator: "fill",
  uiContrast: "normal",
};

const LOCKABLE_OPTION_IDS_BY_CATEGORY = {
  tileColor: TILE_COLOR_IDS,
  font: FONT_IDS,
  letterColor: LETTER_COLOR_IDS,
  background: BACKGROUND_IDS,
  material: MATERIAL_IDS,
  specialIndicator: SPECIAL_INDICATOR_IDS,
};

function getThemeUnlockItemKey(category, optionId) {
  return `${String(category || "").trim()}:${String(optionId || "").trim()}`;
}

function isThemeCategoryLockable(category) {
  return LOCKABLE_THEME_CATEGORIES.includes(String(category || "").trim());
}

function isThemeOptionIdKnown(category, optionId) {
  const key = String(category || "").trim();
  const target = String(optionId || "").trim();
  if (!isThemeCategoryLockable(key)) return false;
  const bucket = LOCKABLE_OPTION_IDS_BY_CATEGORY[key];
  if (!bucket) return false;
  return bucket.has(target);
}

function isThemeOptionLockable(category, optionId) {
  const key = String(category || "").trim();
  const target = String(optionId || "").trim();
  if (!isThemeOptionIdKnown(key, target)) return false;
  return String(DEFAULT_THEME[key] || "") !== target;
}

function isThemeOptionUnlocked(unlocks, category, optionId) {
  if (!isThemeOptionLockable(category, optionId)) return true;
  return !!unlocks?.[getThemeUnlockItemKey(category, optionId)];
}

let db = null;
let writeQueue = Promise.resolve();
const SQLITE_BUSY_MAX_RETRIES = 10;
const SQLITE_BUSY_RETRY_BASE_MS = 40;

function isSqliteBusyError(err) {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "SQLITE_BUSY" ||
    msg.includes("database is locked") ||
    msg.includes("sqlite_busy")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithBusyRetry(task, retries = SQLITE_BUSY_MAX_RETRIES) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      if (!isSqliteBusyError(err) || attempt >= retries) {
        throw err;
      }
      const waitMs = SQLITE_BUSY_RETRY_BASE_MS * (attempt + 1);
      await sleep(waitMs);
    }
  }
}

function runSerializedWrite(task) {
  const execute = () => runWithBusyRetry(task);
  const next = writeQueue.then(execute, execute);
  writeQueue = next.catch(() => {});
  return next;
}

async function runInImmediateTransaction(task) {
  await db.exec("BEGIN IMMEDIATE");
  let committed = false;
  try {
    const result = await task();
    await db.exec("COMMIT");
    committed = true;
    return result;
  } catch (err) {
    if (!committed) {
      try {
        await db.exec("ROLLBACK");
      } catch (_) {}
    }
    throw err;
  }
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function normalizeTileLetterScale(value, fallback = TILE_LETTER_SCALE_DEFAULT) {
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : TILE_LETTER_SCALE_DEFAULT;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return base;
  return Math.min(TILE_LETTER_SCALE_MAX, Math.max(TILE_LETTER_SCALE_MIN, raw));
}

function sanitizeThemeInput(rawTheme) {
  const raw = rawTheme && typeof rawTheme === "object" ? rawTheme : {};
  const migratedFont =
    raw.font === "script" ||
    raw.font === "warning" ||
    raw.font === "danger" ||
    raw.font === "bubble"
      ? "draft"
      : raw.font;
  const legacyMaterial = String(raw.material || "");
  const migratedTileColor =
    TILE_COLOR_IDS.has(raw.tileColor)
      ? raw.tileColor
      : legacyMaterial === "wood"
      ? "wood"
      : DEFAULT_THEME.tileColor;
  const migratedMaterial =
    legacyMaterial === "bubble" ||
    legacyMaterial === "rounded-square" ||
    legacyMaterial === "square" ||
    legacyMaterial === "native"
      ? legacyMaterial
      : legacyMaterial === "classic" || legacyMaterial === "wood"
      ? "native"
      : DEFAULT_THEME.material;
  return {
    darkMode: !!raw.darkMode,
    tileColor: migratedTileColor,
    font: FONT_IDS.has(migratedFont) ? migratedFont : DEFAULT_THEME.font,
    letterScale: normalizeTileLetterScale(raw.letterScale, DEFAULT_THEME.letterScale),
    letterColor: LETTER_COLOR_IDS.has(raw.letterColor) ? raw.letterColor : DEFAULT_THEME.letterColor,
    background: BACKGROUND_IDS.has(raw.background) ? raw.background : DEFAULT_THEME.background,
    material: MATERIAL_IDS.has(migratedMaterial) ? migratedMaterial : DEFAULT_THEME.material,
    specialIndicator: SPECIAL_INDICATOR_IDS.has(raw.specialIndicator)
      ? raw.specialIndicator
      : DEFAULT_THEME.specialIndicator,
    uiContrast: UI_CONTRAST_IDS.has(raw.uiContrast) ? raw.uiContrast : DEFAULT_THEME.uiContrast,
  };
}

function sanitizeUnlocksInput(rawUnlocks, rawTheme = DEFAULT_THEME) {
  const source = rawUnlocks && typeof rawUnlocks === "object" ? rawUnlocks : {};
  const safeTheme = sanitizeThemeInput(rawTheme || DEFAULT_THEME);
  const sourceItems =
    source.items && typeof source.items === "object" ? source.items : source;
  const out = {};
  for (const category of LOCKABLE_THEME_CATEGORIES) {
    if (source[category] === true) {
      const optionId = String(safeTheme?.[category] || DEFAULT_THEME[category] || "").trim();
      if (isThemeOptionLockable(category, optionId)) {
        out[getThemeUnlockItemKey(category, optionId)] = true;
      }
    }
  }
  for (const [rawKey, rawVal] of Object.entries(sourceItems)) {
    if (!rawVal) continue;
    const key = String(rawKey || "").trim();
    const sep = key.indexOf(":");
    if (sep <= 0 || sep >= key.length - 1) continue;
    const category = key.slice(0, sep);
    const optionId = key.slice(sep + 1);
    if (!isThemeOptionLockable(category, optionId)) continue;
    out[getThemeUnlockItemKey(category, optionId)] = true;
  }
  return out;
}

async function getOrCreateProfileRow(installId) {
  if (!db || !installId) return null;
  return runWithBusyRetry(async () => {
    const existing = await db.get(
      "SELECT installId, balance, themeApplied, themeUnlocks, updatedAt FROM gobblar_profiles WHERE installId = ?",
      installId
    );
    if (existing) return existing;
    const now = Date.now();
    const defaultThemeJson = JSON.stringify(DEFAULT_THEME);
    const defaultUnlocksJson = JSON.stringify(sanitizeUnlocksInput({}, DEFAULT_THEME));
    await db.run(
      `INSERT OR IGNORE INTO gobblar_profiles
       (installId, balance, themeApplied, themeUnlocks, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      installId,
      0,
      defaultThemeJson,
      defaultUnlocksJson,
      now
    );
    const row = await db.get(
      "SELECT installId, balance, themeApplied, themeUnlocks, updatedAt FROM gobblar_profiles WHERE installId = ?",
      installId
    );
    if (row) return row;
    return {
      installId,
      balance: 0,
      themeApplied: defaultThemeJson,
      themeUnlocks: defaultUnlocksJson,
      updatedAt: now,
    };
  });
}

async function getProfileParsed(installId) {
  try {
    let row = await getOrCreateProfileRow(installId);
    if (!row) return null;
    const granted = await applyGlobalGrantOnce(row.installId);
    if (granted) {
      const refreshed = await runWithBusyRetry(() =>
        db.get(
          "SELECT installId, balance, themeApplied, themeUnlocks, updatedAt FROM gobblar_profiles WHERE installId = ?",
          installId
        )
      );
      if (refreshed) row = refreshed;
    }
    return {
      installId: row.installId,
      balance: Number(row.balance) || 0,
      themeApplied: sanitizeThemeInput(safeJsonParse(row.themeApplied, DEFAULT_THEME)),
      themeUnlocks: sanitizeUnlocksInput(
        safeJsonParse(row.themeUnlocks, {}),
        safeJsonParse(row.themeApplied, DEFAULT_THEME)
      ),
      updatedAt: Number(row.updatedAt) || 0,
    };
  } catch (err) {
    console.warn("Gobblars profile read failed", err);
    return null;
  }
}

async function updateProfileRow(installId, { balance, themeApplied, themeUnlocks, now = Date.now() } = {}) {
  if (!db || !installId) return null;
  const current = await getProfileParsed(installId);
  if (!current) return null;
  const nextBalance = Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : current.balance;
  const nextThemeApplied = sanitizeThemeInput(themeApplied || current.themeApplied);
  const nextThemeUnlocks = sanitizeUnlocksInput(
    themeUnlocks || current.themeUnlocks,
    nextThemeApplied
  );
  await db.run(
    `UPDATE gobblar_profiles
     SET balance = ?, themeApplied = ?, themeUnlocks = ?, updatedAt = ?
     WHERE installId = ?`,
    nextBalance,
    JSON.stringify(nextThemeApplied),
    JSON.stringify(nextThemeUnlocks),
    now,
    installId
  );
  return {
    installId,
    balance: nextBalance,
    themeApplied: nextThemeApplied,
    themeUnlocks: nextThemeUnlocks,
    updatedAt: now,
  };
}

async function insertLedgerEntry(installId, delta, reason, meta = null, ts = Date.now()) {
  if (!db || !installId || !Number.isFinite(delta) || !reason) return;
  await db.run(
    "INSERT INTO gobblar_ledger (installId, ts, delta, reason, meta) VALUES (?, ?, ?, ?, ?)",
    installId,
    ts,
    Math.trunc(delta),
    String(reason),
    meta ? JSON.stringify(meta) : null
  );
}

async function applyGlobalGrantOnce(installId, amount = GLOBAL_GRANT_GOBBLARS_BONUS) {
  if (!db || !installId) return false;
  const safeAmount = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!safeAmount) return false;
  return runWithBusyRetry(async () => {
    const ts = Date.now();
    const insertRes = await db.run(
      `INSERT OR IGNORE INTO gobblar_global_grants (installId, grantKey, amount, awardedAt)
       VALUES (?, ?, ?, ?)`,
      installId,
      GLOBAL_GRANT_KEY,
      safeAmount,
      ts
    );
    const changed = Number(insertRes?.changes) || 0;
    if (!changed) return false;
    await db.run(
      "UPDATE gobblar_profiles SET balance = balance + ?, updatedAt = ? WHERE installId = ?",
      safeAmount,
      ts,
      installId
    );
    await insertLedgerEntry(installId, safeAmount, "global_bonus", { key: GLOBAL_GRANT_KEY }, ts);
    return true;
  });
}

async function applyGlobalGrantToAllExistingProfilesOnce() {
  if (!db) return;
  const rows = await db.all("SELECT installId FROM gobblar_profiles");
  for (const row of rows || []) {
    const installId = typeof row?.installId === "string" ? row.installId.trim() : "";
    if (!installId) continue;
    await applyGlobalGrantOnce(installId);
  }
}

export async function initGobblarsService() {
  if (db) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.exec("PRAGMA journal_mode = WAL;");
    await db.exec("PRAGMA busy_timeout = 5000;");
    await db.exec(`
      CREATE TABLE IF NOT EXISTS gobblar_profiles (
        installId TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        themeApplied TEXT NOT NULL DEFAULT '{}',
        themeUnlocks TEXT NOT NULL DEFAULT '{}',
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gobblar_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        installId TEXT NOT NULL,
        ts INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        meta TEXT
      );
      CREATE TABLE IF NOT EXISTS gobblar_week_rewards (
        installId TEXT NOT NULL,
        weekId TEXT NOT NULL,
        source TEXT NOT NULL,
        amount INTEGER NOT NULL,
        awardedAt INTEGER NOT NULL,
        PRIMARY KEY(installId, weekId, source)
      );
      CREATE TABLE IF NOT EXISTS gobblar_global_grants (
        installId TEXT NOT NULL,
        grantKey TEXT NOT NULL,
        amount INTEGER NOT NULL,
        awardedAt INTEGER NOT NULL,
        PRIMARY KEY(installId, grantKey)
      );
    `);
    await applyGlobalGrantToAllExistingProfilesOnce();
  } catch (err) {
    console.warn("Gobblars service init failed", err);
    db = null;
  }
}

export async function getGobblarProfile(installId) {
  if (!installId) return null;
  if (!db) {
    const fallbackTheme = sanitizeThemeInput(DEFAULT_THEME);
    return {
      installId,
      balance: 0,
      themeApplied: fallbackTheme,
      themeUnlocks: sanitizeUnlocksInput({}, fallbackTheme),
      updatedAt: Date.now(),
      lockableCategories: LOCKABLE_THEME_CATEGORIES,
      unlockCost: THEME_UNLOCK_COST,
    };
  }
  const profile = await getProfileParsed(installId);
  if (!profile) return null;
  return {
    ...profile,
    lockableCategories: LOCKABLE_THEME_CATEGORIES,
    unlockCost: THEME_UNLOCK_COST,
  };
}

export async function addGobblars({
  installId,
  amount = 0,
  reason = "manual",
  meta = null,
  ts = Date.now(),
} = {}) {
  if (!db || !installId) return null;
  const safeAmount = Math.trunc(Number(amount) || 0);
  if (!safeAmount) {
    return getProfileParsed(installId);
  }
  return runSerializedWrite(async () => {
    try {
      return await runInImmediateTransaction(async () => {
        const profile = await getProfileParsed(installId);
        if (!profile) throw new Error("profile_missing");
        const nextBalance = profile.balance + safeAmount;
        if (nextBalance < 0) {
          return {
            ok: false,
            error: "insufficient_funds",
            balance: profile.balance,
            required: Math.abs(safeAmount),
          };
        }
        const updated = await updateProfileRow(installId, {
          balance: nextBalance,
          themeApplied: profile.themeApplied,
          themeUnlocks: profile.themeUnlocks,
          now: ts,
        });
        await insertLedgerEntry(installId, safeAmount, reason, meta, ts);
        return { ok: true, ...updated };
      });
    } catch (err) {
      console.warn("Gobblars add failed", err);
      return null;
    }
  });
}

export async function grantWeeklyWinnerGobblars({
  installId,
  weekId,
  amount = WEEKLY_WIN_GOBBLARS_BONUS,
} = {}) {
  if (!db || !installId || !weekId) return null;
  const safeAmount = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!safeAmount) return getProfileParsed(installId);
  const ts = Date.now();
  return runSerializedWrite(async () => {
    try {
      return await runInImmediateTransaction(async () => {
        const profile = await getProfileParsed(installId);
        if (!profile) throw new Error("profile_missing");
        const insertRes = await db.run(
          `INSERT OR IGNORE INTO gobblar_week_rewards (installId, weekId, source, amount, awardedAt)
           VALUES (?, ?, ?, ?, ?)`,
          installId,
          weekId,
          "duel_winner",
          safeAmount,
          ts
        );
        const changed = Number(insertRes?.changes) || 0;
        if (!changed) {
          return { ok: true, awarded: false, ...profile };
        }
        const updated = await updateProfileRow(installId, {
          balance: profile.balance + safeAmount,
          themeApplied: profile.themeApplied,
          themeUnlocks: profile.themeUnlocks,
          now: ts,
        });
        await insertLedgerEntry(installId, safeAmount, "weekly_duel_winner", { weekId }, ts);
        return { ok: true, awarded: true, ...updated };
      });
    } catch (err) {
      console.warn("Weekly winner gobblars failed", err);
      return null;
    }
  });
}

function getThemeValueByCategory(theme, category) {
  if (!theme || typeof theme !== "object") return undefined;
  switch (category) {
    case "tileColor":
      return theme.tileColor;
    case "font":
      return theme.font;
    case "letterScale":
      return normalizeTileLetterScale(theme.letterScale, DEFAULT_THEME.letterScale);
    case "letterColor":
      return theme.letterColor;
    case "background":
      return theme.background;
    case "material":
      return theme.material;
    case "specialIndicator":
      return theme.specialIndicator;
    case "uiContrast":
      return theme.uiContrast;
    case "darkMode":
      return !!theme.darkMode;
    default:
      return undefined;
  }
}

export async function applyThemeSelection({
  installId,
  draftTheme = null,
  mode = "full",
  category = "",
  unlockCost = THEME_UNLOCK_COST,
} = {}) {
  if (!db || !installId) return null;
  const safeMode = mode === "single" ? "single" : "full";
  const safeCategory = String(category || "").trim();
  const themeDraft = sanitizeThemeInput(draftTheme || {});
  const categoryOrder = [
    "darkMode",
    "tileColor",
    "font",
    "letterScale",
    "letterColor",
    "background",
    "material",
    "specialIndicator",
    "uiContrast",
  ];
  const categoriesToApply =
    safeMode === "single" ? [safeCategory].filter((x) => categoryOrder.includes(x)) : categoryOrder;

  return runSerializedWrite(async () => {
    try {
      return await runInImmediateTransaction(async () => {
        const profile = await getProfileParsed(installId);
        if (!profile) throw new Error("profile_missing");
        const currentTheme = sanitizeThemeInput(profile.themeApplied);
        const currentUnlocks = sanitizeUnlocksInput(profile.themeUnlocks, currentTheme);
        const changedCategories = [];
        for (const key of categoriesToApply) {
          if (getThemeValueByCategory(currentTheme, key) !== getThemeValueByCategory(themeDraft, key)) {
            changedCategories.push(key);
          }
        }
        const requiredUnlocks = changedCategories
          .map((key) => {
            if (!LOCKABLE_THEME_CATEGORIES.includes(key)) return "";
            const optionId = getThemeValueByCategory(themeDraft, key);
            const defaultId = getThemeValueByCategory(DEFAULT_THEME, key);
            if (optionId === defaultId) return "";
            if (isThemeOptionUnlocked(currentUnlocks, key, optionId)) return "";
            return getThemeUnlockItemKey(key, optionId);
          })
          .filter(Boolean);
        const parsedUnlockCost = Number(unlockCost);
        const unlockPrice = Math.max(
          0,
          Math.trunc(Number.isFinite(parsedUnlockCost) ? parsedUnlockCost : THEME_UNLOCK_COST)
        );
        const spent = requiredUnlocks.length * unlockPrice;
        if (spent > profile.balance) {
          return {
            ok: false,
            error: "insufficient_funds",
            balance: profile.balance,
            required: spent,
          };
        }

        const nextUnlocks = { ...currentUnlocks };
        for (const unlockKey of requiredUnlocks) nextUnlocks[unlockKey] = true;
        const nextTheme = { ...currentTheme };
        for (const key of categoriesToApply) {
          nextTheme[key] = themeDraft[key];
        }
        const nextBalance = profile.balance - spent;
        const ts = Date.now();
        await updateProfileRow(installId, {
          balance: nextBalance,
          themeApplied: nextTheme,
          themeUnlocks: nextUnlocks,
          now: ts,
        });
        if (spent > 0) {
          await insertLedgerEntry(
            installId,
            -spent,
            safeMode === "single" ? "theme_unlock_single" : "theme_unlock_full",
            { requiredUnlocks, categoriesToApply },
            ts
          );
        }
        return {
          ok: true,
          balance: nextBalance,
          spent,
          requiredUnlocks,
          changedCategories,
          themeApplied: nextTheme,
          themeUnlocks: nextUnlocks,
          unlockCost: unlockPrice,
          lockableCategories: LOCKABLE_THEME_CATEGORIES,
        };
      });
    } catch (err) {
      console.warn("Theme apply failed", err);
      return null;
    }
  });
}

export async function migrateGobblarProfile(targetInstallId, sourceInstallIds = []) {
  const target = typeof targetInstallId === "string" ? targetInstallId.trim() : "";
  const sources = Array.from(
    new Set(
      (Array.isArray(sourceInstallIds) ? sourceInstallIds : [])
        .map((installId) => (typeof installId === "string" ? installId.trim() : ""))
        .filter((installId) => installId && installId !== target)
    )
  );
  if (!db || !target || sources.length === 0) {
    return getGobblarProfile(target);
  }

  return runSerializedWrite(async () => {
    try {
      await runInImmediateTransaction(async () => {
        const rows = await db.all(
          `SELECT installId, balance, themeApplied, themeUnlocks, updatedAt
           FROM gobblar_profiles
           WHERE installId IN (${[target, ...sources].map(() => "?").join(",")})`,
          target,
          ...sources
        );
        let balance = 0;
        let latestThemeTs = 0;
        let mergedTheme = DEFAULT_THEME;
        let mergedUnlocks = {};

        for (const row of rows || []) {
          balance += Math.max(0, Number(row?.balance) || 0);
          const updatedAt = Number(row?.updatedAt) || 0;
          const themeApplied = sanitizeThemeInput(safeJsonParse(row?.themeApplied, DEFAULT_THEME));
          const themeUnlocks = sanitizeUnlocksInput(
            safeJsonParse(row?.themeUnlocks, {}),
            themeApplied
          );
          if (updatedAt >= latestThemeTs) {
            latestThemeTs = updatedAt;
            mergedTheme = themeApplied;
          }
          mergedUnlocks = { ...mergedUnlocks, ...themeUnlocks };
        }

        const now = Math.max(Date.now(), latestThemeTs);
        await db.run(
          `INSERT INTO gobblar_profiles (installId, balance, themeApplied, themeUnlocks, updatedAt)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(installId)
           DO UPDATE SET balance = excluded.balance, themeApplied = excluded.themeApplied,
             themeUnlocks = excluded.themeUnlocks, updatedAt = excluded.updatedAt`,
          target,
          balance,
          JSON.stringify(sanitizeThemeInput(mergedTheme)),
          JSON.stringify(sanitizeUnlocksInput(mergedUnlocks, mergedTheme)),
          now
        );

        for (const source of sources) {
          await db.run("UPDATE gobblar_ledger SET installId = ? WHERE installId = ?", target, source);
          await db.run(
            `INSERT OR IGNORE INTO gobblar_week_rewards (installId, weekId, source, amount, awardedAt)
             SELECT ?, weekId, source, amount, awardedAt
             FROM gobblar_week_rewards
             WHERE installId = ?`,
            target,
            source
          );
          await db.run("DELETE FROM gobblar_week_rewards WHERE installId = ?", source);
          await db.run(
            `INSERT OR IGNORE INTO gobblar_global_grants (installId, grantKey, amount, awardedAt)
             SELECT ?, grantKey, amount, awardedAt
             FROM gobblar_global_grants
             WHERE installId = ?`,
            target,
            source
          );
          await db.run("DELETE FROM gobblar_global_grants WHERE installId = ?", source);
          await db.run("DELETE FROM gobblar_profiles WHERE installId = ?", source);
        }
      });
    } catch (err) {
      console.warn("Gobblars migration failed", err);
    }
    return getGobblarProfile(target);
  });
}
