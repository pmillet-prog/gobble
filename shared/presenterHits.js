export const PRESENTER_HIT_IDENTITIES = Object.freeze([
  { presenterId: "pivot", nick: "Bernard Pinot", portraitUrl: "/bots/presenters/pivot/button.webp" },
  { presenterId: "bafouille", nick: "Laurent Bafouille", portraitUrl: "/bots/presenters/bafouille/button.webp" },
  { presenterId: "romejko", nick: "Laurent Rhum&Co", portraitUrl: "/bots/presenters/romejko/button.webp" },
  { presenterId: "lepers", nick: "Julien Lechéper", portraitUrl: "/bots/presenters/lepers/button.webp" },
  { presenterId: "capello", nick: "Maître Gobbello", portraitUrl: "/bots/presenters/capello/button.webp" },
  { presenterId: "foucault", nick: "Jean-Bière FouKro", portraitUrl: "/bots/foucault/stars.png" },
].map(Object.freeze));

export const isPresenterHitId = value => PRESENTER_HIT_IDENTITIES.some(entry => entry.presenterId === value);

// Cached formatter: no formatter allocation on the per-hit path.
const parisDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const parisClock = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const partsOf = (formatter, time) => Object.fromEntries(formatter.formatToParts(time).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));

export function getPresenterHitsWeekStartTs(time = Date.now()) {
  const parts = partsOf(parisDate, time);
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const clock = partsOf(parisClock, monday);
  const offset = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) - monday.getTime();
  return monday.getTime() - offset;
}
