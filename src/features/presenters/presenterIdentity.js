export const PRESENTER_IDENTITIES = Object.freeze({
  pivot: { nick: "Bernard Pinot", buttonUrl: "/bots/presenters/pivot/button.webp" },
  bafouille: { nick: "Laurent Bafouille", buttonUrl: "/bots/presenters/bafouille/button.webp" },
  romejko: { nick: "Laurent Rhum&Co", buttonUrl: "/bots/presenters/romejko/button.webp" },
  lepers: { nick: "Julien Lechéper", buttonUrl: "/bots/presenters/lepers/button.webp" },
  capello: { nick: "Maître Gobbello", buttonUrl: "/bots/presenters/capello/button.webp" },
});

const PRESENTER_BY_CATEGORY = Object.freeze({ coach: "capello", culture: "lepers", detective: "romejko", linguist: "pivot", humorist: "bafouille", statistician: "romejko" });
const PRESENTER_BY_AUTHOR = Object.freeze(Object.fromEntries(
  Object.entries(PRESENTER_IDENTITIES).map(([key, value]) => [value.nick.toLocaleLowerCase("fr"), key])
));

export function resolvePresenterKey(message) {
  const presenterKey = String(message?.meta?.presenterKey || message?.presenterKey || "").trim();
  const category = String(message?.meta?.category || "").trim();
  const author = String(message?.nick || message?.author || "").trim().toLocaleLowerCase("fr");
  const key = presenterKey || PRESENTER_BY_CATEGORY[category] || PRESENTER_BY_AUTHOR[author] || "";
  return Object.hasOwn(PRESENTER_IDENTITIES, key) ? key : "";
}
