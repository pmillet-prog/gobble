const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function getParisParts(date) {
  const parts = formatter.formatToParts(date);
  const getNum = type => Number(parts.find(part => part.type === type)?.value || 0);
  return { year: getNum("year"), month: getNum("month"), day: getNum("day"),
    hour: getNum("hour"), minute: getNum("minute"), second: getNum("second") };
}

function getParisMidnightTs(year, month, day) {
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  const parts = getParisParts(utcMidnight);
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMinutes = Math.round((asUTC - utcMidnight.getTime()) / 60_000);
  return utcMidnight.getTime() - offsetMinutes * 60_000;
}

export function getWeekStartTs(now = Date.now()) {
  const parts = getParisParts(new Date(now));
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return getParisMidnightTs(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function getNextResetTs(weekStartTs) {
  const parts = getParisParts(new Date(weekStartTs));
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + 7);
  return getParisMidnightTs(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
