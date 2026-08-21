export const ENABLE_FAKE_DAILY_HISTORY = false;

function parseIsoDateId(raw) {
  const match = String(raw || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function formatIsoDateId(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftIsoDateId(dateId, deltaDays) {
  const parsed = parseIsoDateId(dateId);
  const base = parsed
    ? new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
    : new Date();
  base.setUTCDate(base.getUTCDate() + Number(deltaDays || 0));
  return formatIsoDateId(base);
}

export function getParisDateIdClient(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value || "";
    const month = parts.find((part) => part.type === "month")?.value || "";
    const day = parts.find((part) => part.type === "day")?.value || "";
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (_) {}
  return formatIsoDateId(date);
}

export function buildFakeDailyHistoryDays(
  todayDateId,
  { enabled = ENABLE_FAKE_DAILY_HISTORY } = {}
) {
  if (!enabled) return [];
  const seeds = [0, 1, 2];
  const redNames = ["Atlas", "Nora", "Silo", "Iris", "Milo", "Romy"];
  const blueNames = ["Lena", "Axel", "Maya", "Noe", "Sami", "Loup"];
  return seeds.map((seed, seedIndex) => {
    const makeEntries = (names, team, baseScore) =>
      names.map((nick, index) => ({
        installId: `fake-${team}-${seedIndex}-${index}`,
        nick: `${nick}${seedIndex + 1}`,
        score: baseScore - seed * (team === "red" ? 70 : 65) - index * (team === "red" ? 55 : 52),
        wordsCount: (team === "red" ? 24 : 23) - index,
        team,
        playerKey: `fake-${team}-${seedIndex}-${index}`,
        isPalier: false,
      }));
    const redEntries = makeEntries(redNames, "red", 1200);
    const blueEntries = makeEntries(blueNames, "blue", 1160);
    const entries = [...redEntries, ...blueEntries].sort((a, b) => {
      const difference = (Number(b?.score) || 0) - (Number(a?.score) || 0);
      return difference || String(a?.nick || "").localeCompare(String(b?.nick || ""));
    });
    const redBalanced = redEntries.reduce((sum, entry) => sum + entry.score, 0);
    const blueBalanced = blueEntries.reduce((sum, entry) => sum + entry.score, 0);
    return {
      dateId: `TEST-${shiftIsoDateId(todayDateId || null, -(seedIndex + 1))}`,
      totalPlayers: entries.length,
      entries,
      battle: {
        totalsRawByTeam: { red: redBalanced, blue: blueBalanced },
        totalsBalancedByTeam: { red: redBalanced, blue: blueBalanced },
        winnerTeam: redBalanced === blueBalanced ? null : redBalanced > blueBalanced ? "red" : "blue",
      },
      isFake: true,
    };
  });
}
