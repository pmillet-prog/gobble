import { withMinimalAvatarEyes } from "./avatarEyes.js";
import { AVATAR_COSMETICS } from "./avatarCosmetics.js";
import { AVATAR_ADDITIONAL_NOSES } from "./avatarNoses.js";
import { AVATAR_COSTUMES } from "./avatarCostumes.js";
import { withAdditionalAvatarClothes } from "./avatarClothes.js";

// Add future in-game rewards here: server grants, workshop progress and toasts
// share these identifiers. Progress only comes from validated game events.
export const AVATAR_OBJECTIVES = Object.freeze({
  mini_tournament_wins: { target: 100, stat: "miniTournamentWins", family: "headwear", id: "crown", label: "Couronne", unit: "victoires",
    description: "Remporter 100 mini-tournois depuis la mise en place de cet objectif. Les anciennes victoires ne comptent pas." },
  lepers_correct_answers: { target: 100, stat: "lepersCorrectAnswers", family: "accessories", id: "participant_tag", label: "Étiquette de participant", unit: "bonnes réponses",
    description: "Donner 100 bonnes réponses aux questions de Julien Lechéper. Une réponse par question, en jeu, depuis le lancement de cet objectif." },
});

export const AVATAR_ACCESSORIES = Object.freeze([
  ...AVATAR_COSMETICS,
  { id: "participant_tag", label: "Étiquette de participant", file: "rewards/participant-tag-oval.svg", layers: {}, masks: {},
    unlock: { type: "lepers_correct_answers" } },
  { id: "tiger_plush", label: "Peluche de tigre", file: "extras/tiger-plush.png", layers: {}, masks: {} },
]);

export function withAvatarAccessories(catalog) {
  return { ...catalog, families: { ...catalog.families,
    eyes: withMinimalAvatarEyes(catalog.families.eyes), accessories: AVATAR_ACCESSORIES, costumes: AVATAR_COSTUMES,
    clothes: withAdditionalAvatarClothes(catalog.families.clothes),
    nose: [...(catalog.families.nose || []).filter(part => !AVATAR_ADDITIONAL_NOSES.some(extra => extra.id === part.id)), ...AVATAR_ADDITIONAL_NOSES],
  } };
}

export function getAvatarObjectiveProgress(inventory, objective) {
  const definition = AVATAR_OBJECTIVES[objective];
  return definition ? Math.max(0, Number(inventory?.[definition.stat]) || 0) : 0;
}
