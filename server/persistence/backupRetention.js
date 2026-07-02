import path from "path";
import { promises as fs } from "fs";

const DEFAULT_BACKUP_RETENTION = 168;
const MIN_BACKUP_RETENTION = 2;
const MAX_BACKUP_RETENTION = 24 * 31;

export function getBackupRetentionLimit() {
  const configured = Number(process.env.GOBBLE_JSON_BACKUP_RETENTION);
  if (!Number.isFinite(configured)) return DEFAULT_BACKUP_RETENTION;
  return Math.min(
    MAX_BACKUP_RETENTION,
    Math.max(MIN_BACKUP_RETENTION, Math.trunc(configured))
  );
}

export async function pruneTimestampedBackups(
  filePath,
  { keep = getBackupRetentionLimit() } = {}
) {
  const directory = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.bak.`;
  const entries = await fs.readdir(directory);
  const backups = entries
    .map((name) => {
      if (!name.startsWith(prefix)) return null;
      const timestamp = Number(name.slice(prefix.length));
      if (!Number.isFinite(timestamp)) return null;
      return { name, timestamp };
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);
  const stale = backups.slice(Math.max(0, Math.trunc(keep)));

  for (const entry of stale) {
    await fs.unlink(path.join(directory, entry.name)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  return stale.length;
}
