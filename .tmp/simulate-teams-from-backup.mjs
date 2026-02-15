import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

function pad2(v){ return String(v).padStart(2, "0"); }
function getISOWeekDataFromUTCDate(utcDate) {
  const d = new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { isoYear, week };
}
function getWeekIdFromUTCDate(utcDate) {
  const { isoYear, week } = getISOWeekDataFromUTCDate(utcDate);
  return `${isoYear}-W${pad2(week)}`;
}
function shiftWeekId(weekId, deltaWeeks) {
  const match = String(weekId || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekId;
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  const mondayWeek1 = new Date(firstThursday);
  mondayWeek1.setUTCDate(firstThursday.getUTCDate() - firstDay);
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1 + Number(deltaWeeks || 0)) * 7);
  return getWeekIdFromUTCDate(monday);
}

const dataDir = path.resolve('.tmp/live_runtime_2026-02-15/gobble_runtime');
process.env.GOBBLE_DATA_DIR = dataDir;

const svcPath = pathToFileURL(path.resolve('server/stats/teamDuelService.js')).href;
const svc = await import(svcPath);
const { getTeamForInstall, getParisWeekId } = svc;

const statsPath = path.join(dataDir, 'weekly-stats.json');
const raw = await fs.readFile(statsPath, 'utf8');
const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

const rootWeekStartTs = Number(parsed?.weekStartTs) || 0;
const sourceWeekId = rootWeekStartTs > 0 ? getParisWeekId(new Date(rootWeekStartTs)) : null;
if (!sourceWeekId) throw new Error('Impossible de determiner la semaine source');
const targetWeekId = shiftWeekId(sourceWeekId, 1);

const candidates = [];
const scanWeek = (value) => {
  if (!value || typeof value !== 'object') return;
  const ts = Number(value.weekStartTs);
  if (!Number.isFinite(ts) || ts <= 0) return;
  const weekId = getParisWeekId(new Date(ts));
  if (weekId !== sourceWeekId) return;
  const totalScore = value.totalScore && typeof value.totalScore === 'object' ? value.totalScore : {};
  candidates.push(totalScore);
};
scanWeek(parsed);
const history = parsed?.history && typeof parsed.history === 'object' ? parsed.history : {};
Object.values(history).forEach(scanWeek);

const merged = {};
for (const board of candidates) {
  for (const [playerKey, entry] of Object.entries(board || {})) {
    const current = merged[playerKey];
    const nextTotal = Number(entry?.totalScore) || 0;
    if (!current || nextTotal > (Number(current?.totalScore) || 0)) merged[playerKey] = entry;
  }
}

const players = [];
for (const [playerKey, entry] of Object.entries(merged)) {
  if (!String(playerKey).startsWith('install:')) continue;
  const installId = String(playerKey).slice('install:'.length).trim();
  if (!installId) continue;
  const totalScore = Number(entry?.totalScore) || 0;
  const roundsPlayedRaw = Number(entry?.roundsPlayed) || 0;
  if (totalScore <= 0 && roundsPlayedRaw <= 0) continue;
  players.push({
    installId,
    nick: String(entry?.nick || ''),
    totalScore,
    roundsPlayed: Math.max(1, roundsPlayedRaw),
  });
}

for (const p of players) {
  p.team = await getTeamForInstall(p.installId, { weekId: targetWeekId });
}

let levelsByInstall = {};
try {
  const duelRaw = await fs.readFile(path.join(dataDir, 'team-duel.json'), 'utf8');
  const duel = JSON.parse(duelRaw.charCodeAt(0) === 0xfeff ? duelRaw.slice(1) : duelRaw);
  levelsByInstall = duel?.weeks?.[targetWeekId]?.levelByInstallId || {};
} catch (_) {}
for (const p of players) p.level = Number(levelsByInstall[p.installId]) || null;

const byTeam = { red: [], blue: [] };
for (const p of players) if (p.team === 'red' || p.team === 'blue') byTeam[p.team].push(p);
const sortFn = (a,b) => (Number(b.level)||0) - (Number(a.level)||0) || (Number(b.totalScore)||0)-(Number(a.totalScore)||0) || String(a.nick).localeCompare(String(b.nick));
byTeam.red.sort(sortFn);
byTeam.blue.sort(sortFn);

const summary = {
  sourceWeekId,
  targetWeekId,
  playersCount: players.length,
  counts: { red: byTeam.red.length, blue: byTeam.blue.length },
};

const output = { summary, red: byTeam.red, blue: byTeam.blue };
const outPath = path.join(dataDir, `team-simulation-${targetWeekId}.json`);
await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

console.log(JSON.stringify({
  summary,
  outPath,
  redTop: byTeam.red.slice(0, 15).map((p) => ({ nick: p.nick, level: p.level, totalScore: p.totalScore })),
  blueTop: byTeam.blue.slice(0, 15).map((p) => ({ nick: p.nick, level: p.level, totalScore: p.totalScore })),
}, null, 2));
