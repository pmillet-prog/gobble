export const GOTUS_WAITING_INVITATIONS = Object.freeze([
  "Le tournoi est déjà bien lancé. Un petit Gotus pour patienter jusqu’au prochain ?",
  "Les joueurs ont pris un peu d’avance. Thierry Baccardo vous propose un Gotus en attendant !",
  "Quelques manches se sont déjà jouées. Et si vous trouviez un mot avant le prochain tournoi ?",
  "Vous arrivez en cours de tournoi : une petite pause Gotus vous tente ?",
  "Le prochain départ sera l’occasion de jouer toutes les manches. Gotus pour patienter ?",
  "Le tournoi a déjà commencé son chemin. Six lettres et six essais en attendant le suivant ?",
  "Envie de partir à égalité au prochain tournoi ? Un Gotus peut vous tenir compagnie !",
  "Il reste du jeu dans le live, et un mot vous attend chez Baccardo. À vous de choisir !",
  "Vous pouvez rejoindre les joueurs maintenant, ou faire un petit Gotus avant le prochain départ.",
  "Le tournoi est en route. Une partie de Gotus pour s’échauffer avant le suivant ?",
]);

export function shouldOfferGotus(room) {
  const status = room?.liveStatus;
  const lobby = status?.tournamentLobby || room?.tournamentLobby;
  if (lobby?.isOpen || ["ready", "countdown", "intro", "starting"].includes(lobby?.phase)) return false;
  return Number(status?.round?.number ?? status?.tournamentRound) >= 3;
}

export function getGotusReminderKey(room) {
  const lobby = room?.tournamentLobby || room?.liveStatus?.tournamentLobby;
  if (!lobby || lobby.maintenanceMode || lobby.phase !== "countdown" || !lobby.countdownEndsAt) return null;
  // `starting` also describes ordinary round starts. Only this deadline
  // identifies the countdown of a new mini-tournament.
  return `${room?.roomId || lobby.roomId || "live"}:${lobby.countdownEndsAt}`;
}
