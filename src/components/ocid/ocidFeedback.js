export const OCID_NO_VOTER_MESSAGES = [
  "Personne n'a voté pour {word}, quel dommage, il avait pourtant un certain panache !",
  "{word} n'a convaincu personne, mais il avait une vraie présence scénique.",
  "Aucun vote pour {word}. Le public n'était pas prêt.",
  "{word} repart sans voix, mais avec une dignité intacte.",
  "Personne n'a choisi {word}. Audacieux, mais pas rentable.",
  "{word} a traversé le vote dans un silence presque artistique.",
  "Zéro vote pour {word}. Un choix de niche, manifestement très niche.",
  "{word} n'a pas trouvé son public, ce qui est injuste mais statistique.",
  "Aucun joueur n'a suivi {word}. Dommage, il avait du tempérament.",
  "{word} a fini seul au buffet des propositions.",
  "Personne n'a mordu à {word}. Pourtant, l'hameçon brillait.",
  "{word} n'a récolté aucun vote. Panache validé, points refusés.",
  "Zéro voix pour {word}. La poésie ne paie pas toujours.",
  "{word} a laissé tout le monde perplexe, ce qui est déjà une performance.",
  "Aucun vote pour {word}. Trop subtil ? Trop beau ? Trop tôt.",
  "{word} n'a pas bluffé la salle, mais il a tenté quelque chose.",
  "Personne n'a craqué pour {word}. Sévère, mais clair.",
  "{word} termine sans vote, avec un certain mystère dans le regard.",
  "Aucune voix pour {word}. Le bluff était peut-être trop avant-gardiste.",
  "{word} a fait chou blanc, mais avec une belle assurance.",
];

export const OCID_VALID_BLUFF_MESSAGES = [
  "Vous avez bien leurré {audience} avec {word}, et votre mot était valide !",
  "{audienceCaps} a cru à {word}, qui existait vraiment. Joli double effet.",
  "{word} était valide, et {audience} est tombé dans le panneau.",
  "Bluff propre : {word} existe, et {audience} vous a suivi.",
  "{audienceCaps} a voté pour {word}. Mot valide, piège élégant.",
  "{word} a fait illusion auprès de {audience}, tout en restant dans le dictionnaire.",
  "Vous avez vendu {word} à {audience}, et le dico ne peut même pas protester.",
  "{word} était légal, crédible, et {audience} y a cru.",
  "Coup net : {audience} a choisi {word}, un vrai mot en plus.",
  "{word} a bluffé {audience}. La légalité rend la chose presque respectable.",
  "{audienceCaps} s'est laissé attirer par {word}, parfaitement valide.",
  "Vous avez ferré {audience} avec {word}, et sans inventer un mot.",
  "{word} passe au détecteur de dictionnaire, et {audience} au détecteur de bluff.",
  "{audienceCaps} a validé {word} du regard. Le dictionnaire aussi.",
  "Votre {word} était crédible, valide, et assez convaincant pour {audience}.",
  "{word} a gagné la confiance de {audience}. Mot réel, piège réel.",
  "Très propre : {word} existe, et {audience} l'a pris pour la cible.",
  "{audienceCaps} a offert ses points à {word}, qui avait en plus ses papiers.",
  "{word} n'était pas la cible, mais il était valide et {audience} y a cru.",
  "Vous avez joué {word} au bon endroit : valide, plausible, rentable.",
];

export const OCID_INVALID_BLUFF_MESSAGES = [
  "Vous avez bien eu {audience} avec un mot qui n'existe pas : {word}. Quelle créativité !",
  "{audienceCaps} a voté pour {word}, pur produit de votre imagination.",
  "{word} n'existe pas, mais {audience} y a cru. C'est presque de la littérature.",
  "Bluff sauvage : {word} est introuvable au dico, pas dans les votes.",
  "{audienceCaps} a acheté {word}. Le dictionnaire demande un recours.",
  "{word} était inventé, et pourtant {audience} a signé.",
  "Vous avez vendu {word} à {audience}. Aucun dictionnaire n'a été consulté à temps.",
  "{word} n'existe pas, mais il a existé assez longtemps pour piéger {audience}.",
  "Coup de théâtre : {audience} a cru à {word}, mot totalement artisanal.",
  "{word} était une pure invention. {audienceCaps} l'a trouvé crédible quand même.",
  "Vous avez sorti {word} de nulle part, et {audience} l'a suivi.",
  "{audienceCaps} s'est laissé convaincre par {word}. La créativité a payé.",
  "{word} a trompé {audience} sans passer par la case dictionnaire.",
  "Votre {word} n'existe pas, mais il a quand même fait des dégâts.",
  "{word} était faux, l'aplomb était vrai, et {audience} a voté.",
  "{audienceCaps} a offert ses points à {word}. Le dico reste interdit de parole.",
  "Invention rentable : {word} a séduit {audience}.",
  "{word} était du bluff brut, et {audience} l'a pris au sérieux.",
  "Vous avez improvisé {word}; {audience} a applaudi avec ses points.",
  "{word} n'avait aucun papier, mais {audience} l'a laissé passer.",
];

export const OCID_SELF_WRONG_VALID_VOTE_MESSAGES = [
  "Vous étiez vraiment sûr de vous avec {word}, mais ce n'est pas ça. Vote perso : +0 point.",
  "{word} existait, certes. La cible, beaucoup moins. Auto-vote courageux, gain nul.",
  "Vous avez voté pour votre propre {word}. Le dictionnaire approuve, le score beaucoup moins : +0.",
  "{word} était valide, mais pas la bonne réponse. L'auto-confiance rapporte 0 point.",
  "Vous avez misé sur {word} jusqu'au bout. Mot valide, pari perdu, +0 point au vote.",
  "{word} avait des arguments, sauf celui d'être la cible. Auto-vote sans bénéfice.",
  "Vous avez cru très fort à {word}. Le mot existe, les points de vote non.",
  "{word} était défendable, mais la définition ne l'a pas choisi. +0 point pour ce vote.",
  "Vous avez soutenu votre {word} avec panache. Beau geste, aucun point.",
  "Mot valide, intuition moins valide : votre vote pour {word} rapporte 0 point.",
];

export const OCID_SELF_WRONG_INVALID_VOTE_MESSAGES = [
  "Vous étiez vraiment sûr de vous avec {word}, mais ce n'est pas ça. Et ce mot n'existe pas : +0 point.",
  "Vous avez voté pour votre propre {word}. Audacieux, invalide, et gratuit : +0.",
  "{word} sortait de votre imagination, et y retourne sans points.",
  "Auto-vote sur {word}. Le dictionnaire a levé un sourcil, le score aussi : +0.",
  "Vous avez défendu {word} jusqu'au bout. Personne ne peut vous enlever l'audace, ni vous donner des points.",
  "{word} n'était ni la cible ni vraiment un mot. Double peine, +0 point.",
  "Vous avez cru à {word}. Le jeu, lui, reste assez froid : +0.",
  "Vote personnel pour {word}. Créatif, mais pas rentable.",
  "{word} avait du culot. Le culot ne compte pas au barème : +0 point.",
  "Vous avez choisi votre propre invention {word}. L'histoire retiendra l'effort, pas les points.",
];

export function pickStableOcidMessage(messages, key) {
  if (!Array.isArray(messages) || !messages.length) return "";
  const raw = String(key || "");
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return messages[hash % messages.length] || messages[0];
}

export function formatOcidMessage(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : ""
  );
}

