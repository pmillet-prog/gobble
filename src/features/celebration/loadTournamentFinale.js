export const loadTournamentFinaleExperience = () => import("./TournamentFinaleExperience.jsx");
export const loadTournamentFinaleRanking = () => import("../../components/finale/TournamentFinaleScreen.jsx");

export function preloadTournamentFinale() {
  void Promise.all([loadTournamentFinaleExperience(), loadTournamentFinaleRanking()]).catch(() => {});
}
