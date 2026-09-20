import { normalizeAvatar } from "../../avatar/avatarState.js";
import { PRESENTER_IDENTITIES } from "../../presenters/presenterIdentity.js";

const LOOKS = [
  [
    { base: "homme", hair: "quiff", hairColor: "#653a23", clothes: "bomber_homme", clothesColor: "#35745d", brows: "angular", mouths: "wide_neutral", irisColor: "#658c6c" },
    { base: "femme", hair: "longwaves", hairColor: "#99532b", headwear: "newsboy", headwearColor: "#9f3b47", clothes: "mariniere_femme", eyes: "almond", mouths: "cupid_neutral", tone: "custom", customColor: "#d89c70" },
    { base: "homme", hair: "shortcurls", hairColor: "#292326", glasses: "vue_ronde", glassesColor: "#c49c58", clothes: "hoodie_homme", clothesColor: "#355a8b", mouths: "soft_neutral", tone: "custom", customColor: "#955f40" },
  ],
  [
    { base: "femme", hair: "bob", hairColor: "#477c96", glasses: "vue_papillon", clothes: "blazer_femme", clothesColor: "#9b6bb1", mouths: "heart_neutral", eyes: "soft" },
    { base: "homme", hair: "hipster", hairColor: "#653a23", headwear: "fedora", clothes: "costume_cravate_homme", mouths: "angular_neutral", facialhair: "courte", facialhairColor: "#653a23" },
    { base: "femme", hair: "ponytail", hairColor: "#d4ad64", headwear: "beanie", headwearColor: "#35745d", clothes: "sweat_femme", clothesColor: "#9f3b47", mouths: "full_neutral", eyes: "smiling" },
  ],
];

export function createCelebrationFixture(position = "winner", look = 0, botKey = "") {
  const names = position === "winner" ? ["Tigre", "Plume", "Pixel"] : position === "second" ? ["Plume", "Tigre", "Pixel"] : ["Plume", "Pixel", "Moka"];
  const scores = [2840, 2575, 2310];
  const players = names.map((nick, index) => ({
    userId: nick === "Tigre" ? "demo-self" : `demo-${nick}`, nick, rank: index + 1, score: scores[index],
    avatar: normalizeAvatar(LOOKS[look % LOOKS.length][index]),
  }));
  if (Object.hasOwn(PRESENTER_IDENTITIES, botKey)) {
    const index = position === "winner" ? 1 : 0;
    players[index] = { userId: `demo-bot-${botKey}`, nick: PRESENTER_IDENTITIES[botKey].nick, isBot: true, presenterKey: botKey, rank: index + 1, score: scores[index] };
  }
  return {
    players,
    self: { ...(players.find(player => player.userId === "demo-self") || { userId: "demo-self", nick: "Tigre", rank: 7, score: 1740, avatar: normalizeAvatar(LOOKS[look % LOOKS.length][0]) }), totalPlayers: 24 },
  };
}
