export const WHEEL_VOTE_ID = 'wheel-future-2026-11';
export const WHEEL_VOTE_MIN_ROUNDS = 100;
export const WHEEL_VOTE_SUGGESTION_MAX = 2000;

export const WHEEL_VOTE_OPTIONS = Object.freeze([
  'Plus de roue du tout.',
  'Un seul tour de roue avec comme base de cagnotte les gobbles trouvés pendant le tournoi.',
  'Chaque premier tournoi de l’heure est un tournoi avec la roue, tous les autres sans.',
  'Plus de roue pendant les tournois mais un lancer de roue quotidien uniquement pour gagner des gobblars (plus d’énigme).',
  'Plus de roue pendant les tournois mais une énigme quotidienne avec ses lancers et des règles revues.',
  'On laisse comme ça, ça me va très bien !',
  'Indifférent.',
  'Suggérer autre chose',
].map((label, index) => Object.freeze({ id: index + 1, label })));

export const WHEEL_VOTE_INTRO = Object.freeze([
  'Bonjour à tous, j’ai bien compris que la nouvelle roue ne plaisait pas à tous, et je peux tout à fait le comprendre. J’ai voulu faire un jeu convivial, avec des rebondissements, mais j’admets moi-même qu’elle prend une part trop importante dans le jeu.',
  'Aussi je vous propose un vote pour décider de son avenir. Elle représente pas mal de travail donc je n’aimerais pas la jeter non plus à la poubelle.',
  'Je propose tout de même dans le vote de la supprimer complètement, mais parmi d’autres alternatives. Certains l’adorent donc je me dis qu’on pourrait tous les X tournois ou à chaque premier tournoi de l’heure, faire un tournoi avec la roue telle qu’elle est en place actuellement (avec de légers ajustements : moins de pause en fin de tournoi, après le podium, passage au podium dès lors que tout le monde a joué la finale de la roue…).',
  'Bref, à vos votes ! Je laisse quelques jours à tout le monde pour voter avant d’ajuster en conséquence.',
  'Bonne semaine et bon jeu !',
]);

export function normalizeWheelVote(value) {
  if (!value || !['voted', 'skipped'].includes(value.status) || !Array.isArray(value.choices)
    || value.choices.length > WHEEL_VOTE_OPTIONS.length
    || value.choices.some(id => !Number.isInteger(id) || !WHEEL_VOTE_OPTIONS.some(option => option.id === id)))
    throw new Error('invalid_vote');
  const choices = [...new Set(value.choices)].sort((a, b) => a - b);
  if (value.status === 'voted' ? !choices.length : choices.length) throw new Error('invalid_vote');
  const suggestion = choices.includes(8) && typeof value.suggestion === 'string' ? value.suggestion.trim() : '';
  if (choices.includes(8) && (!suggestion || suggestion.length > WHEEL_VOTE_SUGGESTION_MAX)) throw new Error('invalid_vote');
  return { status: value.status, choices, suggestion };
}

export function countWheelVotes(entries) {
  return WHEEL_VOTE_OPTIONS.map(option => ({ ...option,
    count: entries.filter(entry => entry.status === 'voted' && entry.choices.includes(option.id)).length,
  }));
}
