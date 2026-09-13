const RESULTS_PAGES = {
  round: {
    title: "Classement de la manche",
    text: "Ton score détermine ta place : 10 points au premier, 9 au deuxième…",
    gesture: "Glisse pour voir le classement général.", swipe: true,
  },
  total: {
    title: "Classement général",
    text: "Il cumule les points de classement et les Gobbles des cinq manches du mini-tournoi.",
    gesture: "Glisse pour retrouver tes mots.", swipe: true,
  },
  found: {
    title: "Tes mots trouvés",
    text: "Ce sont les mots que tu as validés pendant cette manche, avec leurs points.",
    gesture: "Glisse pour découvrir tous les mots trouvables.", swipe: true,
  },
  all: {
    title: "Tous les mots trouvables",
    text: "Tous les mots possibles sur cette grille. Tes trouvailles restent signalées.",
    gesture: "Touche ARME pour voir qui l’a trouvé.", tap: true,
  },
};

// Follow the page actually displayed, including backward swipes, rather than
// the next action expected by the tutorial controller.
export function getTutorialResultsGuidance(step, snapshot) {
  if (!snapshot.mobile || step.phase !== "results" || !["ranking", "words", "finders", "definition"].includes(step.kind)) return null;
  const guidance = RESULTS_PAGES[snapshot.resultsPage];
  return guidance ? { ...guidance, page: snapshot.resultsPage } : null;
}
