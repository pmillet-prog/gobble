import { gobblarsHistoryDetails } from "./gobblarsHistoryDetails.js";

export const GOBBLARS_HISTORY_PAGE_SIZE = 30;

export async function initGobblarsHistory(db) {
  // Reuse the ledger, including gifts/refunds written by the avatar service.
  // Only movements for the requesting account are scanned, inside the worker.
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gobblar_ledger_movements
    ON gobblar_ledger (installId, id) WHERE delta != 0`);
}

function cursor(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("invalid_cursor");
  return number;
}

export async function readGobblarsHistory(db, { installId, before, snapshot } = {}) {
  if (!installId) throw new Error("auth_required");
  const beforeId = cursor(before);
  const snapshotId = cursor(snapshot) ?? (await db.get(
    "SELECT COALESCE(MAX(id), 0) AS id FROM gobblar_ledger WHERE installId = ? AND delta != 0", installId
  )).id;
  // Freeze the ledger boundary across pages: a new movement must not split or move
  // a tournament already being consulted. Refresh starts a new snapshot.
  const rows = await db.all(`
    WITH movements AS (
      SELECT id, ts, delta, reason, CASE WHEN json_valid(meta) THEN meta ELSE '{}' END AS data
      FROM gobblar_ledger WHERE installId = ? AND delta != 0 AND id <= ?
    ), normalized AS (
      SELECT *, json_extract(data, '$.tournamentId') AS tournamentId,
        json_extract(data, '$.tournamentStartedAt') AS tournamentStartedAt,
        json_extract(data, '$.roomId') AS roomId,
        json_extract(data, '$.medal') AS medal,
        json_extract(data, '$.dateId') AS dateId
      FROM movements
    ), grouped AS (
      SELECT *, CASE
        WHEN reason IN ('live_gobble', 'tournament_medal') AND length(tournamentId) > 0
          THEN json_array('tournament', roomId, tournamentId)
        WHEN reason IN ('live_gobble', 'tournament_medal')
          THEN json_array('legacy_live', strftime('%Y-%m-%d', ts / 1000, 'unixepoch'))
        WHEN reason = 'daily_gobbles' AND length(dateId) > 0 THEN json_array('daily_gobbles', dateId)
        ELSE json_array('entry', id) END AS groupKey
      FROM normalized
    )
    SELECT groupKey, MAX(id) AS id, MIN(ts) AS at, SUM(delta) AS amount,
      MIN(reason) AS reason, MAX(data) AS data, MAX(tournamentId) AS tournamentId,
      MIN(CASE WHEN tournamentStartedAt > 0 THEN tournamentStartedAt END) AS tournamentStartedAt,
      MAX(dateId) AS dateId,
      SUM(CASE WHEN reason IN ('live_gobble', 'daily_gobbles') THEN delta ELSE 0 END) AS gobbles,
      SUM(CASE WHEN reason = 'tournament_medal' THEN delta ELSE 0 END) AS medalAmount,
      SUM(CASE WHEN reason = 'tournament_medal' AND medal = 'gold' THEN 1 ELSE 0 END) AS gold,
      SUM(CASE WHEN reason = 'tournament_medal' AND medal = 'silver' THEN 1 ELSE 0 END) AS silver,
      SUM(CASE WHEN reason = 'tournament_medal' AND medal = 'bronze' THEN 1 ELSE 0 END) AS bronze
    FROM grouped GROUP BY groupKey HAVING (? IS NULL OR MAX(id) < ?)
    ORDER BY id DESC LIMIT ?`, installId, snapshotId, beforeId, beforeId, GOBBLARS_HISTORY_PAGE_SIZE + 1);
  const entries = await Promise.all(rows.slice(0, GOBBLARS_HISTORY_PAGE_SIZE).map(async row => {
    const [group, day] = JSON.parse(row.groupKey);
    return {
      id: row.id,
      kind: group === "entry" ? row.reason : group,
      at: row.tournamentStartedAt || row.at,
      dateId: group === "legacy_live" ? day : row.dateId,
      amount: row.amount,
      gobbles: row.gobbles,
      medalAmount: row.medalAmount,
      medals: { gold: row.gold, silver: row.silver, bronze: row.bronze },
      ...(group === "entry" ? await gobblarsHistoryDetails(row.reason, row.data) : {}),
    };
  }));
  return { entries, snapshot: snapshotId, nextBefore: rows.length > GOBBLARS_HISTORY_PAGE_SIZE ? entries.at(-1).id : null };
}
