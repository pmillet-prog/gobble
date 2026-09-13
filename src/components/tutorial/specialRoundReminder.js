import {
  FAKE_TWINS_TYPE, FAKE_TWINS_WORD_BONUS, FAKE_TWINS_COMPLETION_BONUS,
  FAKE_TWINS_COMPLETION_TARGET_RATIO, OCID_TYPE,
} from "../../../shared/gameLogic.js";
import { FINALE_TYPE } from "../../../shared/finaleRules.js";
import { MASSIVE_BOGGLE_TYPE } from "../../game/specialRoundTypes.js";
import { DAILY_SPECIAL_MODE, DAILY_FAKE_TWINS_MODE } from "../daily/dailyModes.js";
import { getFinaleTutorialSteps } from "../finale/finalePresentation.js";

export function getSpecialRoundReminder(plan) {
  if (!plan?.type) return null;
  const title = plan.label || "Manche spéciale";
  switch (plan.type) {
    case DAILY_SPECIAL_MODE:
      return { title, rules: [
        "Compose jusqu’à 3 mots, chacun depuis une case de départ différente. Les autres cases peuvent servir à plusieurs mots.",
        "Déplace librement L2, L3, M2 et M3 : leurs positions finales déterminent les points de ton trio.",
        "Tu peux supprimer et remplacer un mot. Les scores sont provisoires : le dictionnaire tranche aux résultats, où un mot refusé vaut zéro.",
        "Un seul Gobble est possible, pour l’un des mots les plus longs de la grille.",
      ] };
    case FAKE_TWINS_TYPE:
    case DAILY_FAKE_TWINS_MODE:
      return { title, rules: [
        "Une tuile peut se lire avec l’une ou l’autre de ses deux lettres.",
        `Privilégie les mots qui passent par cette tuile : chacun rapporte ${FAKE_TWINS_WORD_BONUS} points de bonus.`,
        `Trouve ${FAKE_TWINS_COMPLETION_TARGET_RATIO * 100} % de ces mots pour gagner ${FAKE_TWINS_COMPLETION_BONUS} points supplémentaires.`,
        "Si deux mots partagent exactement le même tracé, ils sont validés ensemble.",
      ] };
    case "target_long":
    case "target_score":
      return { title, rules: [
        plan.type === "target_long" ? "Trouve le mot le plus long de la grille." : "Trouve le mot qui rapporte le plus de points sur la grille.",
        "Les indices apparaissent progressivement. Un seul mot cible suffit.",
        "Plus tu le trouves vite, plus tu marques. Le flux affiche les joueurs qui l’ont trouvé et leur temps.",
      ] };
    case OCID_TYPE:
      return { title, rules: [
        "Une définition est affichée : le vrai mot est présent dans la grille.",
        "Trace le mot qui semble correspondre, ou bluffe. La proposition visible à la fin du chrono est retenue.",
        "Au vote, choisis la proposition qui te semble être le vrai mot.",
        "Tu marques pour la cible trouvée, un vote correct, un mot valide proposé et les votes reçus sur ton bluff.",
      ] };
    case "speed":
      return { title, rules: [
        `Tous les mots valent ${plan.fixedWordScore ?? 11} points : privilégie les petits mots rapides.`,
        "Le Gobble du mot le plus long reste disponible.",
      ] };
    case "bonus_letter":
      return { title, rules: [
        `La lettre ${String(plan.bonusLetter || "?").toUpperCase()} vaut ${plan.bonusLetterScore ?? 20} points.`,
        "Les autres lettres gardent leur valeur habituelle.",
      ] };
    case MASSIVE_BOGGLE_TYPE:
      return { title, rules: [
        "Barème : 3 ou 4 lettres = 1 point ; 5 = 2 ; 6 = 3 ; 7 = 5 ; 8 ou plus = 11.",
        "Les bonus de tuiles sont désactivés. Seuls les Gobbles des mots les plus longs sont actifs.",
      ] };
    case "monstrous":
      return { title, rules: [
        "Cette grille est particulièrement riche en mots longs : cherche les grandes constructions et leurs variantes.",
        Number.isFinite(plan.minLongWordCount) && Number.isFinite(plan.minLongWordLen)
          ? `Elle contient au moins ${plan.minLongWordCount} mots de ${plan.minLongWordLen} lettres ou plus.` : null,
      ].filter(Boolean) };
    case FINALE_TYPE: {
      const [step] = getFinaleTutorialSteps(plan);
      return { title, rules: [step.lead, ...step.bullets] };
    }
    default:
      return { title, rules: [plan.description || `Découvre la manche ${title}.`] };
  }
}
