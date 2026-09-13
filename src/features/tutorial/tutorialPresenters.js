import { CHAT_BOT_VISIBILITY_OPTIONS } from "../../components/chat/chatBotVisibility.js";

const nameFor = (category) => CHAT_BOT_VISIBILITY_OPTIONS.find((entry) => entry.key === category).nick;

export const TUTORIAL_PRESENTERS = Object.freeze([
  { key: "romejko", category: "statistician", name: nameFor("statistician"), role: "annonce les plus longs mots de la grille." },
  { key: "lepers", category: "culture", name: nameFor("culture"), role: "propose des défis et des indices culturels." },
  { key: "capello", category: "coach", name: nameFor("coach"), role: "suggère des terminaisons communes à plusieurs mots." },
]);

export function buildTutorialPresenterEvents(prepared) {
  // Same kind of clue and wording as buildCoachSuffixLine in the game.
  const suffix = "liez";
  const count = prepared.solutions.filter(({ word }) => word.length >= suffix.length + 2 && word.endsWith(suffix)).length;
  const lines = {
    capello: `Je conseille de tester la terminaison -${suffix}: ${count} mots possibles semblent s'y accrocher.`,
    romejko: "Le mot le plus long de cette grille comporte 12 lettres. Il y en a un seul : à vous de jouer !",
    lepers: "Un mot de géométrie se cache sur cette grille : une figure à quatre côtés. C’est votre défi du jour !",
  };
  return TUTORIAL_PRESENTERS.map(({ key, category, name }) => ({
    id: `${prepared.sessionId}:${key}`, roundId: prepared.sessionId, nick: name,
    text: lines[key], meta: { category },
  }));
}
