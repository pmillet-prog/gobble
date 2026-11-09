export const PRESENTER_IDENTITIES = Object.freeze({
  pivot: { nick: "Bernard Pinot", buttonUrl: "/bots/presenters/pivot/button.webp" },
  bafouille: { nick: "Laurent Bafouille", buttonUrl: "/bots/presenters/bafouille/button.webp" },
  romejko: { nick: "Laurent Rhum&Co", buttonUrl: "/bots/presenters/romejko/button.webp" },
  lepers: { nick: "Julien Lechéper", buttonUrl: "/bots/presenters/lepers/button.webp" },
  capello: { nick: "Maître Gobbello", buttonUrl: "/bots/presenters/capello/button.webp" },
  foucault: { nick: "Jean-Bière FouKro", buttonUrl: "/bots/presenters/foucault/frame-1.webp" },
});

// A portrait being available does not change the wheel's established guest pool.
export const INFORTUNE_PRESENTER_KEYS = Object.freeze(["pivot", "bafouille", "romejko", "lepers", "capello"]);
