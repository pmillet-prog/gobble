import packs from "./tutorialBoardPacks.json" with { type: "json" };
import { computeScore, FAKE_TWINS_WORD_BONUS, FAKE_TWINS_COMPLETION_TARGET_RATIO } from "../../components/gameLogic.js";
import { FAKE_TWINS_COMPLETION_BONUS } from "../../../shared/gameLogic.js";
import { TUTORIAL_PATHS } from "./tutorialBoards.js";
import { THREE_WORDS_TUTORIAL } from "./tutorialThreeWords.js";

export const TUTORIAL_CHAPTERS = [
  {
    id: "basics", title: "Ta première manche", board: "discovery", duration: "3 min", icon: "gesture",
    description: "Trois mots, un joli score… et tu connais les bases.",
    steps: [
      { id: "trace", kind: "word", word: "arme", guidePath: true, title: "On commence par un mot tout simple", text: "Relie A → R → M → E, puis relâche. Tu peux aller dans toutes les directions, même en diagonale.", detail: "2 lettres minimum · Une case ne sert qu’une fois par mot. Ici, le chrono est en pause pour apprendre.", success: "Et voilà ! Les cases restent disponibles pour les autres mots. Retrouver le même mot ne rapporte rien de plus." },
      { id: "letters", kind: "word", word: "quad", guidePath: true, title: "Certaines lettres valent de l’or", text: "Essaie QUAD, en haut à gauche. Les petits chiffres sont les valeurs du Scrabble : Qu vaut 11 (Q : 10, U : 1), contre 1 pour A. Une tuile Qu contient les deux lettres.", detail: "Le L2 sur Qu double sa valeur : 11 × 2 = 22.", success: "QUAD : Qu doublé (22) + A (1) + D (2) = 25 points. Trois cases, quatre lettres !" },
      { id: "long-word", kind: "word", word: "quadrilatere", guidePath: true, title: "Et si on voyait beaucoup plus grand ?", text: "Cette grille cache QUADRILATÈRE : 12 lettres ! Prolonge QUAD en suivant le chemin vert. Les cases colorées vont amplifier ton score.", success: "300 points ! 35 pour les lettres bonifiées, +15 de longueur, puis ×2 ×3. C’est le mot le plus long de la grille ET le mot le plus rentable de la grille : deux Gobbles !", summary: "bonuses" },
      { id: "live-ranking", kind: "read", focus: "ranking", title: "Tu viens de remonter au classement", text: "Tes points s’additionnent ici, en direct. Tous les joueurs cherchent sur la même grille. Dans ce didacticiel, les autres joueurs sont simulés." },
      { id: "live-feed", kind: "read", focus: "feed", title: "Le flux raconte la manche", text: "Tu y retrouves tes mots, les gros coups et les Gobbles. Chaque Gobble ajoute 1 point au mini-tournoi ; plusieurs joueurs peuvent en gagner sur la même grille.", detail: "Les mots signalés comme rares reçoivent aussi +10 points sur les manches concernées." },
      { id: "presenters", kind: "presenter", focus: "presenters", title: "Tu n’es pas seul devant la grille", text: "Les pastilles s’allument quand un présentateur a quelque chose à dire. Touche Maître Gobbello pour découvrir une terminaison à chercher.", summary: "presenters" },
      { id: "to-results", kind: "read", focus: "grid", title: "On regarde ce que tu as trouvé ?", text: "Tes mots et tes points vont suivre dans les résultats. Tu peux aussi chercher encore un peu avant de continuer.", nextLabel: "Voir mes résultats", finishRound: true },
      { id: "vocabulary", kind: "vocabulary", phase: "results", title: "Ces mots enrichissent ton vocabulaire", text: "Chaque mot que tu découvres pour la première fois ajoute 1 à ton vocabulaire. Regarde la progression avec les mots que tu viens de trouver.", detail: "Cette démonstration est simulée ; dans le jeu, seuls tes nouveaux mots comptent.", nextLabel: "Voir ma progression" },
      { id: "result-ranking", kind: "ranking", phase: "results", focus: "ranking", title: "Un score de manche… puis des points de tournoi", text: "La place compte : 10 points pour le premier, 9 pour le deuxième, 8 pour le troisième… plus les Gobbles. Ouvre « Total » pour voir le cumul.", mobileText: "La place compte : 10 points pour le premier, 9 pour le deuxième… plus les Gobbles. Glisse vers la gauche pour passer au classement « Total »." },
      { id: "result-words", kind: "words", phase: "results", focus: "words", title: "Tes trouvailles, puis les mots manqués", text: "La liste « Trouvés » contient tes vrais mots de cette manche. Ouvre « Tous » pour découvrir tout ce que la grille permettait.", mobileText: "Les pages suivantes contiennent tes mots, puis tous les mots possibles. Fais défiler les pages jusqu’à « Tous »." },
      { id: "word-finders", kind: "finders", phase: "results", focus: "words", word: "arme", title: "Qui avait trouvé ce mot ?", text: "Survole ARME dans la liste : son chemin apparaît sur la grille et les joueurs qui l’ont trouvé sont mis en évidence.", mobileText: "Touche ARME dans la liste. Sa fiche te montre les joueurs qui l’ont trouvé." },
      { id: "dictionary", kind: "definition", phase: "results", focus: "words", word: "arme", title: "Un mot inconnu ? La loupe est là", text: "Ouvre la définition d’ARME avec sa loupe. Tu peux faire la même chose avec les mots que tu as manqués.", mobileText: "Dans la fiche d’ARME, touche la loupe pour ouvrir sa définition. Tu peux aussi regarder les mots que tu as manqués.", nextLabel: "Découvrir le mini-tournoi" },
    ],
  },
  {
    id: "speed", title: "Rapidité", board: "speed", duration: "40 s", icon: "bolt", description: "Chaque mot vaut autant. À toi la rafale !",
    special: { type: "speed", fixedWordScore: 11 },
    steps: [
      { id: "speed-word", kind: "word", word: "chant", title: "Ici, chaque mot vaut 11 points", text: "Essaie CHANT. Petit ou grand, chaque nouveau mot vaut 11 points. La longueur, les tuiles et la rareté ne changent rien.", success: "11 points ! Pour cette manche, accumule les mots différents. Les petits mots sont précieux." },
      { id: "speed-play", kind: "practice", duration: 20, title: "20 secondes pour une rafale", text: "Cherche librement. Tu peux terminer quand tu veux ; ouvrir « Aide et options » met le chrono en pause." },
      { id: "speed-results", kind: "read", phase: "results", focus: "words", title: "Une autre façon de chercher", text: "C’est le nombre de mots qui fait la différence. Le Gobble du plus long mot reste possible ; celui du meilleur score est désactivé.", nextLabel: "Retour aux manches" },
    ],
  },
  {
    id: "massive", title: "Massive Boggle", board: "length", duration: "40 s", icon: "text_increase", description: "La troisième manche : tout miser sur la longueur.",
    special: { type: "massive_boggle", classicBoggleScoring: true, disableBonuses: true, minWordLength: 3 },
    steps: [
      { id: "massive-word", kind: "word", word: "organisation", title: "Un nouveau barème, un grand mot", text: "Trace ORGANISATION. Ici, il faut au moins 3 lettres. Les valeurs des lettres et les tuiles bonus disparaissent : seule la longueur compte.", detail: "3/4 lettres : 1 · 5 : 2 · 6 : 3 · 7 : 5 · 8+ : 11", success: "11 points et le Gobble du plus long mot ! Le Gobble du meilleur score et la rareté sont désactivés.", nextLabel: "Voir les résultats", finishRound: true },
      { id: "massive-results", kind: "read", phase: "results", focus: "words", title: "La manche 3 de chaque mini-tournoi", text: "Ce barème change ta stratégie : cherche des prolongements. Tu peux explorer les mots possibles avant de quitter cet atelier.", nextLabel: "Retour aux manches" },
    ],
  },
  {
    id: "gold", title: "Lettre en or", board: "gold", duration: "30 s", icon: "stars", description: "Une lettre à 20 points ouvre de nouvelles pistes.",
    special: { type: "bonus_letter", bonusLetter: "Z", bonusLetterScore: 20, disableBonuses: true },
    steps: [
      { id: "gold-word", kind: "word", word: "zebre", title: "Aujourd’hui, le Z vaut 20", text: "Trace ZÈBRE sur la première ligne, puis le E juste en dessous du R. Chaque occurrence de la lettre en or vaut 20 points.", success: "Les autres lettres et le bonus de longueur comptent normalement. Les mots sans Z restent jouables ; les tuiles L2/L3/M2/M3 sont désactivées.", nextLabel: "Voir les résultats", finishRound: true },
      { id: "gold-results", kind: "read", phase: "results", focus: "words", title: "Repère les mots autour de la lettre en or", text: "La liste des mots te permet de comparer les possibilités autour du Z. Une lettre en or peut rapporter plusieurs fois dans un même mot.", nextLabel: "Retour aux manches" },
    ],
  },
  {
    id: "twins", title: "Faux jumeaux", board: "twins", duration: "1 min", icon: "call_split", description: "Pense avec deux lettres et concentre ta recherche autour de leur tuile.",
    special: { type: "fake_twins" },
    steps: [
      { id: "twins-b", kind: "word", word: "bras", guidePath: true, title: "Une tuile, deux façons de chercher", text: "En haut à gauche, la tuile peut être B ou P. Imagine d’abord un B et trace BRAS en suivant le chemin vert.", detail: `Chaque mot qui utilise cette tuile gagne +${FAKE_TWINS_WORD_BONUS} points, qu’on la lise B ou P.`, success: `BRAS reçoit +${FAKE_TWINS_WORD_BONUS} points en plus de son score habituel. Même les mots courts deviennent très rentables !` },
      { id: "twins-p", kind: "word", word: "perle", guidePath: true, title: "Maintenant, pense avec un P", text: "Lis la même tuile comme un P et cherche ailleurs autour d’elle : trace PERLE. Alterner mentalement entre B et P ouvre d’autres mots, d’autres chemins.", success: `PERLE reçoit lui aussi +${FAKE_TWINS_WORD_BONUS} points. Pour gagner, privilégie cette tuile, quitte à délaisser le reste de la grille.` },
      { id: "twins-objective", kind: "read", focus: "objective", title: `Vise les ${FAKE_TWINS_COMPLETION_TARGET_RATIO * 100} % pour +${FAKE_TWINS_COMPLETION_BONUS}`, text: `Trouve ${FAKE_TWINS_COMPLETION_TARGET_RATIO * 100} % des mots possibles passant par la tuile double pour gagner ${FAKE_TWINS_COMPLETION_BONUS} points supplémentaires. Les mots utilisant B et ceux utilisant P font avancer le même objectif. Le compteur indique combien il t’en manque.`, nextLabel: "Voir les résultats", finishRound: true },
      { id: "twins-results", kind: "read", phase: "results", focus: "words", title: "Cherche en priorité autour de la tuile double", text: "Alterne B et P et explore les prolongements. Un mot peut contenir les deux lettres s’il utilise aussi d’autres cases. Petit confort : si un tracé forme deux mots valides (BAIN/PAIN), ils sont comptés ensemble pour t’éviter de recommencer.", nextLabel: "Retour aux manches" },
    ],
  },
  THREE_WORDS_TUTORIAL,
  {
    id: "target-long", title: "Mot le plus long", board: "length", duration: "40 s", icon: "straighten", description: "Une seule cible, à trouver le plus vite possible.",
    special: { type: "target_long", disableBonuses: true },
    steps: [
      { id: "target-long-word", kind: "word", word: "$longest", title: "Un seul mot à trouver", text: "Le but est le mot le plus long de cette grille. Les autres mots ne suffisent pas. Les indices révèlent progressivement des lettres ; tu peux demander le chemin ici.", success: "Cible trouvée ! Dans les vraies manches, le temps départage les joueurs qui l’ont trouvée.", nextLabel: "Voir les résultats", finishRound: true },
      { id: "target-long-results", kind: "read", phase: "results", focus: "ranking", title: "Une course au mot cible", text: "Ce classement met en avant le temps de découverte. Une seule bonne trouvaille suffit.", nextLabel: "Retour aux manches" },
    ],
  },
  {
    id: "target-score", title: "Meilleur mot", board: "spectacular", duration: "40 s", icon: "workspace_premium", description: "Chercher le meilleur chemin vers le plus gros score.",
    special: { type: "target_score" },
    steps: [
      { id: "target-score-word", kind: "word", word: "$best", title: "La cible est le mot le plus rentable", text: "Cette fois, les bonus sont décisifs. Cherche le meilleur mot de la grille ; les indices sont là si tu bloques.", success: "Tu as trouvé la cible ! Longueur et multiplicateurs se combinent pour départager les possibilités.", nextLabel: "Voir les résultats", finishRound: true },
      { id: "target-score-results", kind: "read", phase: "results", focus: "ranking", title: "Le bon mot, le plus vite possible", text: "Comme pour le plus long mot, une seule cible et un classement au temps.", nextLabel: "Retour aux manches" },
    ],
  },
  {
    id: "monstrous", title: "Grille monstrueuse", board: "spectacular", duration: "30 s", icon: "local_fire_department", description: "Une grille particulièrement riche à explorer.",
    special: { type: "monstrous" },
    steps: [
      { id: "monstrous-word", kind: "word", word: "extraordinaire", title: "Une grille qui promet de gros coups", text: "Le barème reste habituel, mais la grille est choisie pour son potentiel. Essaie EXTRAORDINAIRE et profite de ses multiplicateurs.", success: "Pas de nouveau barème à apprendre : cherche les mots longs et les chemins les plus rentables.", nextLabel: "Voir les résultats", finishRound: true },
      { id: "monstrous-results", kind: "read", phase: "results", focus: "words", title: "Explore ce que tu as manqué", text: "Les résultats aident à repérer les prolongements et les chemins à bonus. Tous les mots de cette grille ont été précalculés.", nextLabel: "Retour aux manches" },
    ],
  },
];

export const TUTORIAL_PACKS = packs;
export const getTutorialChapter = (id) => TUTORIAL_CHAPTERS.find((entry) => entry.id === id) || TUTORIAL_CHAPTERS[0];
export function getTutorialTarget(chapter, step) {
  const solutions = packs[chapter.board].solutions;
  if (step.word === "$best") return solutions[0];
  if (step.word === "$longest") return [...solutions].sort((a, b) => b.word.length - a.word.length || b.pts - a.pts)[0];
  const entry = solutions.find((candidate) => candidate.word === step.word);
  // A deliberate non-word is a trace exercise in 3 mots, never a dictionary entry.
  if (!entry) return step.kind === "slot" && step.path ? { word: step.word, path: step.path } : null;
  const path = step.path || TUTORIAL_PATHS[entry.word] || entry.path;
  return { ...entry, path, pts: chapter.special?.fixedWordScore ?? computeScore(entry.word, path, packs[chapter.board].grid, chapter.special) };
}
