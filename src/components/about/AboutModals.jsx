import React from "react";
import { SUPPORT_DONORS } from "../../constants/supportDonors";

export default function AboutModals({
  isAboutOpen,
  isSupportOpen,
  isPatchNotesOpen,
  menuDarkMode,
  darkMode,
  supportModalSection,
  setIsAboutOpen,
  setIsSupportOpen,
  setIsPatchNotesOpen,
  setSupportModalSection,
  closePatchNotes,
}) {
  return (
    <>
      {isAboutOpen ? (
        <div className="fixed inset-0 z-[20010] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => {
              setIsAboutOpen(false);
              setIsSupportOpen(false);
              setSupportModalSection("support");
            }}
            aria-label="Fermer à propos"
          />
          <div
            className={`relative w-full max-w-xs rounded-2xl border p-4 shadow-2xl ${
              menuDarkMode
                ? "bg-slate-900/95 border-white/10 text-slate-100"
                : "bg-white/95 border-slate-200 text-slate-900"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="À propos"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-extrabold">À propos</div>
              <button
                type="button"
                className={`h-7 w-7 rounded-full border flex items-center justify-center ${
                  menuDarkMode
                    ? "bg-slate-800/80 border-white/10 text-slate-100"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                onClick={() => {
                  setIsAboutOpen(false);
                  setIsSupportOpen(false);
                  setSupportModalSection("support");
                }}
                aria-label="Fermer"
              >
                <span className="text-base leading-none">×</span>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="font-semibold">Un jeu créé par Paul Millet</div>
              <a
                href="mailto:support@gobble.fr"
                className="text-[12px] underline underline-offset-2 opacity-80"
              >
                support@gobble.fr
              </a>
              <button
                type="button"
                onClick={() => setIsPatchNotesOpen(true)}
                className={`w-full rounded-xl border px-3 py-2 text-[12px] font-semibold ${
                  menuDarkMode
                    ? "bg-slate-800/90 border-white/15 text-slate-100"
                    : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                Patchnotes
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupportModalSection("support");
                  setIsSupportOpen(true);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-[12px] font-semibold ${
                  menuDarkMode
                    ? "bg-slate-800/90 border-white/15 text-slate-100"
                    : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                Soutenir Gobble
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isSupportOpen ? (
        <div className="fixed inset-0 z-[20025] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={() => {
              setIsSupportOpen(false);
              setSupportModalSection("support");
            }}
            aria-label="Fermer soutien Gobble"
          />
          <div
            className={`relative w-full max-w-lg rounded-2xl border shadow-2xl ${
              menuDarkMode
                ? "bg-slate-950 border-white/20 text-slate-100"
                : "bg-white border-slate-300 text-slate-900"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Soutenir Gobble"
          >
            <div
              className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${
                menuDarkMode
                  ? "border-white/10 bg-emerald-300/10"
                  : "border-slate-200 bg-emerald-50"
              }`}
            >
              <div className="text-sm font-extrabold tracking-wide">Soutenir Gobble</div>
              <button
                type="button"
                className={`h-8 w-8 rounded-full border flex items-center justify-center ${
                  menuDarkMode
                    ? "bg-slate-900 border-white/10 text-slate-100"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                onClick={() => {
                  setIsSupportOpen(false);
                  setSupportModalSection("support");
                }}
                aria-label="Fermer"
              >
                <span className="text-base leading-none">×</span>
              </button>
            </div>
            <div className="px-4 py-4 space-y-3 text-[13px] leading-6">
              <div
                className={`inline-flex rounded-full border p-1 ${
                  menuDarkMode ? "border-white/10 bg-slate-900/70" : "border-slate-200 bg-slate-100"
                }`}
              >
                <button
                  type="button"
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                    supportModalSection === "support"
                      ? "bg-emerald-600 text-white"
                      : menuDarkMode
                      ? "text-slate-200"
                      : "text-slate-700"
                  }`}
                  onClick={() => setSupportModalSection("support")}
                >
                  Soutenir
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                    supportModalSection === "thanks"
                      ? "bg-emerald-600 text-white"
                      : menuDarkMode
                      ? "text-slate-200"
                      : "text-slate-700"
                  }`}
                  onClick={() => setSupportModalSection("thanks")}
                >
                  Remerciements
                </button>
              </div>
              {supportModalSection === "thanks" ? (
                <div className="space-y-2">
                  <p className="font-semibold">Un grand merci au(x) donateur(s) <span aria-hidden="true">❤️</span> :</p>
                  {SUPPORT_DONORS.length ? (
                    <ul className="space-y-1">
                      {SUPPORT_DONORS.map((donor) => (
                        <li
                          key={donor.id || donor.name}
                          className={`rounded-lg border px-3 py-2 font-semibold ${
                            menuDarkMode
                              ? "bg-slate-900/70 border-white/10"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          {donor.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="opacity-80">Aucun nom pour le moment.</p>
                  )}
                </div>
              ) : (
                <>
                  <p>
                    Gobble est un jeu libre, sans pub et sans revenu, que j'ai patiemment créé de A à Z.
                  </p>
                  <p>
                    Contrairement à bien des jeux : Pas de pubs. Pas de tracking. Pas de profilage. Pas de cookies,
                    pas de “consentement” à 12 boutons.
                  </p>
                  <p>
                    Si le jeu te plaît et que tu veux me remercier, ou juste m'aider à maintenir le nom de domaine
                    et l'hébergement, voici un lien !
                  </p>
                  <p>Des bisous et bon jeu ! :)</p>
                  <p className="font-semibold">
                    (Il n'y a AUCUNE obligation, tu peux bien sûr jouer sans jamais donner !)
                  </p>
                  <a
                    href="https://paypal.me/gobblefr"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center justify-center w-full rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-500"
                  >
                    Ouvrir le lien PayPal
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isPatchNotesOpen ? (
        <div className="fixed inset-0 z-[20030] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={closePatchNotes}
            aria-label="Fermer patchnotes"
          />
          <div
            className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl ${
              menuDarkMode
                ? "bg-slate-950 border-white/20 text-slate-100"
                : "bg-white border-slate-300 text-slate-900"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Patchnotes"
          >
            <div
              className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${
                menuDarkMode
                  ? "border-white/10 bg-amber-300/10"
                  : "border-slate-200 bg-amber-50"
              }`}
            >
              <div>
                <div className="text-sm font-extrabold tracking-wide">Patchnotes</div>
                <div className="text-[12px] italic opacity-80">historique des mises à jour</div>
              </div>
              <button
                type="button"
                className={`h-8 w-8 rounded-full border flex items-center justify-center ${
                  menuDarkMode
                    ? "bg-slate-900 border-white/10 text-slate-100"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                onClick={closePatchNotes}
                aria-label="Fermer"
              >
                <span className="text-base leading-none">×</span>
              </button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto px-4 py-4 text-[13px] leading-6 space-y-4">
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 04/07/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  récapitulatif et course hebdomadaire
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    le récapitulatif du lundi se déroule maintenant en plusieurs pages obligatoires :
                    bilan du duel, meilleurs records de la semaine puis grand podium de la course
                    vocabulaire.
                  </li>
                  <li>
                    les trois meilleurs joueurs des catégories médailles, mots par manche et score
                    total sont désormais mis à l'honneur dans le récapitulatif.
                  </li>
                  <li>
                    le podium de la course hebdomadaire affiche maintenant les trois premiers, avec
                    des pseudos or, argent et bronze pendant la semaine suivante.
                  </li>
                  <li>
                    ajout d'un bouton sur l'accueil pour revoir le récapitulatif ; son ouverture
                    automatique attend désormais le retour à l'accueil et son podium a été
                    fiabilisé.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  connexion et sauvegarde
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    en cas de coupure temporaire, la manche continue sur l'appareil et les mots
                    validés hors ligne sont conservés puis synchronisés automatiquement au retour
                    de la connexion.
                  </li>
                  <li>
                    le message de connexion interrompue remplace l'ancien avertissement trompeur
                    de serveur saturé, avec une reprise plus fiable sans devoir rafraîchir la page.
                  </li>
                  <li>
                    après une longue pause ou une nouvelle ouverture du jeu, l'arrivée se fait de
                    nouveau sur l'accueil ; les reconnexions courtes d'une partie active restent
                    automatiques.
                  </li>
                  <li>
                    la sauvegarde des thèmes, des déblocages et des gobblars a été consolidée, avec
                    une meilleure conservation des données et des sauvegardes serveur plus sûres.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  grille, indices et fluidité
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    les indices des manches cible utilisent maintenant un dégradé vert, jaune et
                    orange sur le plateau ; les lettres révélées reprennent les mêmes couleurs dans
                    l'affichage du mot mystère.
                  </li>
                  <li>
                    le tracé des mots a été optimisé pour ne mettre à jour que les tuiles réellement
                    modifiées, avec plusieurs calculs inutiles retirés pendant les manches.
                  </li>
                  <li>
                    correction de la disparition du chemin tracé sur téléphone et ordinateur après
                    ces optimisations.
                  </li>
                  <li>
                    correction du swipe des pages de classement lorsqu'un geste commence sur un
                    pseudo cliquable.
                  </li>
                  <li>
                    l'accueil est mieux isolé des mises à jour du live : le bouton de récapitulatif
                    ne passe plus périodiquement en chargement pendant les rafraîchissements de fond.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  chat et bots
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    le chat de l'accueil utilise désormais le même composant interactif que le chat
                    mobile : les réactions peuvent y être envoyées, reçues et consultées, avec les
                    mêmes fonctions de réponse et de gestion des messages.
                  </li>
                  <li>
                    les bots d'ambiance peuvent maintenant être affichés ou masqués individuellement
                    depuis les réglages du chat.
                  </li>
                  <li>
                    leurs interventions de fin de manche ont été affinées : remarques plus variées,
                    meilleure sélection des mots remarquables et commentaires linguistiques plus
                    précis.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 18/06/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  chat vivant et nouveaux bots
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    arrivée de vrais bots d'ambiance dans le chat : GrosRobert, WikiMama,
                    Statatouille, Inspecteur Grille, Oraclettres, CaSuffix, MomoMotus et quelques
                    autres personnages peuvent maintenant intervenir pendant ou après les manches.
                  </li>
                  <li>
                    ajout d'un réglage permettant de masquer les messages des bots, sans masquer
                    les messages des joueurs.
                  </li>
                  <li>
                    les messages des bots ont été réécrits pour éviter les doublons avec leur
                    pseudo dans le chat, réduire les annonces inutiles et varier davantage leurs
                    formulations.
                  </li>
                  <li>
                    Inspecteur Grille parle moins souvent des longueurs maximales et ne signale
                    plus les grilles simplement "correctes" : ses annonces sont réservées aux mots
                    longs plus remarquables.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  bonus WikiMama
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout d'un nouveau bonus de thème sur les manches normales : WikiMama peut
                    annoncer qu'une grille contient plusieurs mots liés à un même univers, avec un
                    bonus pour les joueurs qui en trouvent assez.
                  </li>
                  <li>
                    les mots du bonus WikiMama sont maintenant mis en évidence en bleu dans le flux
                    live et dans les listes, avec un compteur de progression inspiré des manches
                    faux jumeaux.
                  </li>
                  <li>
                    le bonus est annoncé au début de la manche et récapitulé en fin de manche,
                    uniquement sur les manches normales.
                  </li>
                  <li>
                    amélioration de la reconnaissance des singuliers, pluriels et mots courts dans
                    les thèmes : par exemple les familles d'animaux ou de plantes comptent mieux
                    les formes comme loup/loups, rose/roses ou if/ifs.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  dictionnaire et définitions
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    enrichissement du dictionnaire local avec des informations de thème, de
                    domaine, de catégories grammaticales, d'étymologie et de relations entre mots
                    afin de nourrir les bots et les futurs modes spéciaux.
                  </li>
                  <li>
                    amélioration des définitions données par GrosRobert : les étymologies sont
                    privilégiées quand elles existent, les définitions systématiques sont moins
                    fréquentes et plusieurs formulations trop pauvres ou tronquées ont été filtrées.
                  </li>
                  <li>
                    correction de plusieurs cas d'homographes et de lemmatisation qui pouvaient
                    faire classer un mot dans le mauvais sens.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  chat, sécurité et confort
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout d'une protection anti-spam légère dans le chat des manches cibles afin
                    de limiter les joueurs qui donnent les réponses lettre par lettre.
                  </li>
                  <li>
                    corrections autour du contrôle de temps quotidien : meilleure remise à zéro
                    d'un jour à l'autre, alertes plus cohérentes et comportement plus stable après
                    retour lobby/live.
                  </li>
                  <li>
                    correction de plusieurs plantages liés aux menus et aux écrans mobiles, dont
                    des erreurs sur l'ouverture des résultats ou des réglages.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  maintenance
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    le dictionnaire enrichi est maintenant préparé côté serveur, sans envoyer les
                    gros fichiers de travail aux joueurs ni au dépôt Git.
                  </li>
                  <li>
                    amélioration du script de déploiement pour préserver les données runtime de la
                    VM et éviter de pousser les réglages locaux du menu développeur.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 11/06/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  stabilité mobile et validation
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    le dictionnaire complet n'est plus chargé au lancement du live : le serveur
                    envoie les mots utiles à la manche quand c'est possible, ce qui réduit la
                    mémoire utilisée sur les téléphones modestes.
                  </li>
                  <li>
                    amélioration de la validation des mots : moins de faux messages "mot absent de
                    la grille", avec un retour "invalide" quand le mot n'appartient pas au lexique
                    connu de la manche.
                  </li>
                  <li>
                    correction de plusieurs causes de crash liées au menu apparence et à des
                    rerenders React fragiles.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  contrôle de temps
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout d'un contrôle de temps quotidien pour les joueurs qui veulent se fixer
                    une limite de live : une fois activée, la limite compte le temps passé en
                    manche et bloque l'accès au live quand elle arrive à zéro, jusqu'au lendemain.
                  </li>
                  <li>
                    la limite est volontairement difficile à retirer côté joueur : seul un admin
                    peut l'annuler pour éviter les désactivations impulsives.
                  </li>
                  <li>
                    le réglage de durée utilise des rouleaux heures/minutes, manipulables aux
                    flèches, au swipe vertical sur téléphone et via des durées prédéfinies.
                  </li>
                  <li>
                    ajout d'une animation de rouleau sur ce sélecteur pour rendre les changements
                    de durée plus lisibles.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  confort et réglages
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    les images de rang vocabulaire s'affichent de nouveau dans les statistiques de
                    saison de l'accueil, tout en restant chargées plus prudemment.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  maintenance
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    le déploiement protège maintenant les données runtime du contrôle de temps afin
                    qu'une limite quotidienne déjà activée ne soit pas effacée par une mise à jour.
                  </li>
                  <li>
                    premiers nettoyages autour du préchargement d'assets et de la validation côté
                    client pour limiter les usages mémoire inutiles pendant le live.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 09/06/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  parties et résultats
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    amélioration du calcul et de l'affichage des scores de mots, notamment avec
                    les mots rares et les chemins non optimaux.
                  </li>
                  <li>
                    harmonisation des listes de mots trouvés et trouvables entre l'écran de
                    résultats et le détail d'un joueur.
                  </li>
                  <li>
                    ajustement des classements de mini-tournoi : les gobbles sont à nouveau
                    affichés avec leur visuel, avant le score total.
                  </li>
                  <li>
                    dans le classement live mobile, les indications G/GG apparaissent maintenant à
                    côté du pseudo plutôt qu'en bout de ligne.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  grille et confort de jeu
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    restauration et optimisation du chemin tracé sur mobile et desktop, avec un
                    dégradé désormais bleu vers violet.
                  </li>
                  <li>
                    amélioration de la manche Faux jumeaux : génération plus rapide et distinction
                    plus claire des mots qui comptent pour le bonus de complétion.
                  </li>
                  <li>
                    en cas de complétion Faux jumeaux pendant la manche, une animation dédiée
                    signale maintenant le bonus obtenu.
                  </li>
                  <li>
                    ajout d'une protection de sortie sur mobile pour limiter les départs
                    involontaires pendant le tracé.
                  </li>
                  <li>
                    correction de l'affichage de l'animation de progression vocabulaire hebdo sur
                    desktop.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 01/06/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  classements et vocabulaire
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    la course vocabulaire hebdomadaire est mieux mise en avant dans les stats,
                    avec rappel du rang actuel et de la récompense du vainqueur.
                  </li>
                  <li>
                    fiabilisation du pseudo doré du vainqueur vocabulaire de la semaine
                    précédente dans les affichages live.
                  </li>
                  <li>
                    le classement saison vocabulaire garde l'icône de rang, sans répéter le nom
                    du rang dans chaque ligne.
                  </li>
                  <li>
                    les paliers des classements de grilles du jour sont traités comme des repères
                    visuels plutôt que comme des joueurs.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  manches et résultats
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    en manche OCID, le temps de validation du mot tracé est enregistré et affiché
                    pour départager les joueurs à bonne réponse comparable.
                  </li>
                  <li>
                    les listes de mots Massive Boggle sont aussi triées par longueur puis ordre
                    alphabétique dans le détail des mots de chaque joueur.
                  </li>
                  <li>
                    correction de l'affichage des gobbles dans les classements provisoires et de
                    fin de mini-tournoi, sans perdre l'affichage G/GG en live.
                  </li>
                  <li>
                    amélioration du classement live mobile afin de conserver les retours de score
                    en temps réel tout en évitant des rerenders inutiles.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  interface et confort
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout de la navigation clavier sur desktop dans les menus à pages : flèches
                    pour naviguer, Echap pour fermer les menus et fenêtres compatibles.
                  </li>
                  <li>
                    ajout d'un réglage clavier desktop permettant à la flèche haut de rappeler le
                    dernier mot envoyé, même invalide, plutôt que seulement le dernier mot valide.
                  </li>
                  <li>
                    les annonces serveur s'affichent en surimpression rouge avec apparition et
                    disparition progressives.
                  </li>
                  <li>
                    le chat et plusieurs animations de jeu ont été davantage isolés du rendu
                    principal pour améliorer la fluidité pendant les manches.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 25/05/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  vocabulaire et rangs
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout d'une progression vocabulaire hebdomadaire séparée de la progression
                    globale.
                  </li>
                  <li>
                    ajout d'un classement hebdomadaire vocabulaire et d'une animation de fin de
                    manche indiquant le rang actuel et les places gagnées ou perdues.
                  </li>
                  <li>
                    nouvelle répartition des 12 rangs vocabulaire, nouveaux visuels dédiés et
                    affichage du rang dans les stats, résultats compatibles et profils joueurs.
                  </li>
                  <li>
                    le vainqueur vocabulaire de la semaine précédente reçoit un pseudo doré en
                    live.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  manches et statistiques
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    les joueurs arrivés en cours de manche ne sont plus comptés comme ayant joué
                    une manche à 0 point dans les stats 1 contre 1 ni dans le total hebdomadaire.
                  </li>
                  <li>
                    les manches rapidité n'appliquent plus le bonus de rareté.
                  </li>
                  <li>
                    le vivier OCID filtre davantage les formes conjuguées afin de privilégier les
                    infinitifs attendus.
                  </li>
                  <li>
                    correction d'un état résiduel possible après une grille du jour qui pouvait
                    perturber les mots proposés en tournoi live.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  Massive Boggle et faux jumeaux
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    en Massive Boggle, les mots trouvés et trouvables sont triés par longueur puis
                    par ordre alphabétique.
                  </li>
                  <li>
                    les gobbles Massive Boggle ne s'affichent plus sur tous les mots à 11 points,
                    mais seulement sur le ou les mots les plus longs.
                  </li>
                  <li>
                    le titre d'annonce Massive Boggle ne répète plus le barème de score.
                  </li>
                  <li>
                    les grilles du jour faux jumeaux mettent mieux à jour le décompte des mots
                    communs restants et conservent le bonus de complétion prévu.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  interface live et outils
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    le widget de classement live affiche mieux les gobbles de manche en cours.
                  </li>
                  <li>
                    le pseudo doré est propagé dans davantage de listes live, dont la liste des
                    joueurs en jeu.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 20/05/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  nouvelles manches et tournoi
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout de Massive Boggle comme manche fixe du round 3 en mini-tournoi.
                  </li>
                  <li>
                    barème Massive Boggle : mots de 3 lettres minimum, 3/4=1, 5=2,
                    6=3, 7=5, 8+=11.
                  </li>
                  <li>
                    Massive Boggle désactive les bonus de tuiles et ne garde que le gobble
                    du ou des plus longs mots.
                  </li>
                  <li>
                    la manche Lettre en or reste disponible comme manche à part entière.
                  </li>
                  <li>
                    Massive Boggle est disponible dans le menu dev, le didacticiel spécial,
                    l'aide et les stats 1 contre 1 des profils.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  faux jumeaux et rareté
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    la tuile jumelle reprend le rendu doré.
                  </li>
                  <li>
                    le texte d'objectif parle désormais de mots communs utilisant la lettre
                    jumelle.
                  </li>
                  <li>
                    les mots rares utilisant la lettre jumelle gardent un marquage violet,
                    distinct du doré des autres mots rares.
                  </li>
                  <li>
                    correction d'un cas où un gobble pouvait être annoncé pendant une manche
                    faux jumeaux puis ne pas être conservé dans le bilan.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  dictionnaire, définitions et OCID
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    amélioration du vivier OCID pré-calculé et du filtrage des définitions
                    trop évidentes ou liées à des noms propres.
                  </li>
                  <li>
                    meilleure détection des formes conjuguées et des renvois vers le mot de
                    base dans les définitions locales.
                  </li>
                  <li>
                    correction du popup de règles OCID qui pouvait s'afficher vide.
                  </li>
                  <li>
                    les manches OCID sont mieux rattachées aux statistiques de manches cibles
                    dans les profils.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  interface et profils
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout d'une vraie aide détaillée par type de manche, avec règles et
                    scoring.
                  </li>
                  <li>
                    retour du bouton pour relire le didacticiel depuis les réglages.
                  </li>
                  <li>
                    ajout du record de nombre de mots par manche dans les profils joueurs.
                  </li>
                  <li>
                    amélioration de l'affichage des mots rares dans les listes de mots et les
                    détails de résultats.
                  </li>
                  <li>
                    le message temporaire "connexion au serveur impossible" pollue moins
                    l'accueil lorsqu'une reconnexion se rétablit.
                  </li>
                  <li>
                    retrait de la mention "brouillon" du précédent patch note.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  stabilité et performances
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    réduction de la taille de App.jsx grâce à l'extraction de plusieurs
                    modales et panneaux dans des composants dédiés.
                  </li>
                  <li>
                    optimisation des données envoyées au client pour les solutions de grille,
                    notamment les métadonnées de rareté et de faux jumeaux.
                  </li>
                  <li>
                    ajustements serveur autour du calcul de grilles préparées, du cache de
                    résolution et du rythme d'envoi du classement live.
                  </li>
                  <li>
                    corrections diverses sur les statistiques 1 contre 1, les profils, les
                    définitions préchargées et les écrans de résultats.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 18/05/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  nouvelles manches et équilibrage
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout de la manche OCID : proposer un mot à partir d'une définition, puis
                    voter parmi les propositions.
                  </li>
                  <li>
                    amélioration progressive de la manche faux jumeaux : objectif plus lisible,
                    bonus de complétion mieux ciblé et affichages de résultats clarifiés.
                  </li>
                  <li>
                    ajout d'un bonus de rareté sur les mots rares ou plus, avec affichage dédié
                    dans le flux live et les bilans.
                  </li>
                  <li>
                    ajustements des bots en live, notamment sur les manches spéciales et les
                    phases de vote.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  dictionnaire, définitions et rareté
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    intégration locale d'une base de définitions pour limiter les requêtes web
                    pendant le jeu.
                  </li>
                  <li>
                    création d'un tableau de rareté basé sur les mots réellement trouvés par les
                    joueurs.
                  </li>
                  <li>
                    filtrage renforcé des définitions trop évidentes ou inutilisables pour les
                    manches à mot cible.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  profils, comptes et progression
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    enrichissement des profils joueurs, statistiques personnelles et historiques.
                  </li>
                  <li>
                    réparations et consolidations autour du coffre-fort, des mots connus et des
                    progressions liées au compte.
                  </li>
                  <li>
                    premières bases d'un atelier avatar et de nouveaux éléments visuels associés.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  interface et confort de jeu
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    résultats OCID enrichis : mot cible, vote, bluff, points gagnés et votes reçus
                    mieux détaillés sur mobile et ordinateur.
                  </li>
                  <li>
                    amélioration des listes de vote, des indicateurs de votes et des affichages
                    de mots rares.
                  </li>
                  <li>
                    le chat conserve mieux le message en cours d'écriture lors des changements de
                    phase.
                  </li>
                  <li>
                    ajout et ajustement d'options visuelles, de panneaux de réglages et de
                    plusieurs affichages mobile/ordinateur.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  outils et stabilité
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    menu dev ajusté : sélection de plusieurs manches forcées, mode aléatoire et
                    switch général pour activer ou désactiver les bots.
                  </li>
                  <li>
                    bots ajustés sur OCID : ils ne votent plus pendant cette manche afin de garder
                    les votes plus lisibles.
                  </li>
                  <li>
                    amélioration du vivier de mots OCID et garde-fou contre les répétitions trop
                    rapprochées.
                  </li>
                  <li>
                    ajout d'un menu de modération séparé et d'outils serveur pour mieux encadrer
                    les actions sensibles.
                  </li>
                  <li>
                    refonte partielle de la persistance serveur : files SQLite, worker dédié et
                    écritures moins bloquantes.
                  </li>
                  <li>
                    nombreux correctifs sur les grilles du jour, les statistiques hebdomadaires,
                    les trophées et les scripts de maintenance.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 05/05/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  accueil et interface
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>refonte complète de l'écran d'accueil avec de nouveaux visuels.</li>
                  <li>ajout des arrière-plans d'accueil rouge/bleu selon l'équipe hebdomadaire.</li>
                  <li>
                    ajout d'une pastille sur le bouton « grilles du jour » indiquant le nombre de
                    grilles quotidiennes restantes à jouer.
                  </li>
                  <li>ajout d'une pastille sur le chat d'accueil pour les messages non lus.</li>
                  <li>
                    ajout d'un vrai menu compte depuis le bandeau de compte, avec accès à la
                    déconnexion.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  coffre-fort et mots
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    ajout d'un popup quotidien « Mot du jour » à l'arrivée sur l'accueil.
                  </li>
                  <li>
                    le mot du jour est pioché parmi les mots du coffre-fort du joueur et affiche
                    sa définition.
                  </li>
                  <li>
                    le popup mot du jour ne s'affiche qu'une fois par jour et seulement si le
                    coffre-fort contient au moins un mot.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  définitions et résultats
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    dans le bilan de manche 3 mots, la prévisualisation d'un mot peut être
                    cliquée pour ouvrir sa définition.
                  </li>
                  <li>
                    améliorations de l'affichage des définitions et de l'ajout/retrait de mots du
                    coffre-fort.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  live, validation et confort réseau
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    mise en place d'une validation locale plus réactive des mots côté joueur pour
                    réduire la latence ressentie.
                  </li>
                  <li>
                    conservation de validations serveur pour la cohérence du score et du
                    classement.
                  </li>
                  <li>
                    amélioration des messages côté joueur quand le serveur met trop de temps à
                    répondre, afin d'éviter que les joueurs pensent que leur connexion est seule
                    en cause.
                  </li>
                  <li>
                    améliorations de reconnexion et de reprise de session en cas de saturation ou
                    de réponse serveur lente.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  grilles du jour et génération serveur
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    déplacement et encadrement de certaines générations de grilles du jour pour
                    éviter de bloquer le serveur principal.
                  </li>
                  <li>amélioration des statuts daily et de la récupération côté accueil.</li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  nouvelles stratégies de génération de grilles
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    mot long cible live : tirage pondéré 50% mots 10-11 lettres, 40% mots 12-13
                    lettres, 10% mots 14 lettres et plus.
                  </li>
                  <li>grille monstrueuse : grilles plus rapides à générer.</li>
                  <li>
                    qualité grille monstrueuse : au moins 200 mots, 4000 points possibles, un mot
                    de 10+ lettres, et 3 mots de 10+ lettres.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  manche faux jumeaux
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    améliorations sur la détection des chemins pouvant produire plusieurs mots via
                    la tuile double.
                  </li>
                  <li>
                    ajout et ajustement d'un bonus de complétion pour la manche faux jumeaux.
                    Les mots utilisant la tuile jumelle rapportent maintenant 50 points
                    supplémentaires.
                  </li>
                  <li>
                    un décompte indique désormais les mots spéciaux restants. Si tous les mots
                    spéciaux sont trouvés, un bonus est accordé.
                  </li>
                  <li>
                    renforcement des critères de génération pour éviter les plateaux où trop de
                    mots importants se chevauchent sur le même chemin.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  son et performances
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>extraction d'une partie importante de la logique audio hors de App.jsx.</li>
                  <li>
                    ajout de modules dédiés pour les assets audio, le graphe audio, le moteur
                    audio, la musique ambiante et les sons de jeu.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  animations et assets
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>remplacement et ajout des animations bigwords en WebP.</li>
                  <li>correction de problèmes de transparence sur certains visuels.</li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  mobile
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>harmonisation de plusieurs écrans mobiles avec le thème général.</li>
                  <li>
                    améliorations du chat mobile et de certains comportements du classement
                    mobile.
                  </li>
                </ul>

                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  ordinateur
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>prévisualisation plus stable des mots et chemins dans les bilans.</li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch mineur du 14/04/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  général
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    connexion compte plus fiable et sessions prolongées : vous devriez rester
                    connecté plus longtemps sur le même appareil.
                  </li>
                  <li>
                    protection renforcée de la grille du jour et de ses résultats, pour éviter
                    certains resets intempestifs.
                  </li>
                  <li>
                    amélioration de la stabilité du live, avec moins d’écrans noirs entre les
                    manches.
                  </li>
                  <li>réactions du chat remises en place et plus visibles.</li>
                  <li>
                    chat mobile amélioré : répondre à un message est plus simple, les gestes
                    fonctionnent mieux, et les appuis longs parasites ont été réduits.
                  </li>
                  <li>classement mobile plus lisible pendant la partie.</li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 12/04/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  général
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    introduction d’une nouvelle manche spéciale « faux jumeaux », avec une lettre
                    double. attention ! pour cette manche, seuls les mots de 4 lettres ou plus
                    sont acceptés. une grille du jour faux jumeaux est également mise en place.
                    les mots utilisant l’une ou l’autre des lettres jumelles rapportent 20 points
                    bonus.
                  </li>
                  <li>
                    ajout du coffre-fort accessible depuis la page d’accueil. il est possible de
                    trier les mots de trois façons : date d’ajout, alphabétiquement ou par
                    longueur de mot. tout mot est ajoutable au coffre-fort depuis l’écran de
                    définition d’un mot. une fois dans le coffre-fort, il est possible d’aller en
                    chercher la définition en cliquant dessus.
                  </li>
                  <li>
                    passage de l’ensemble des grilles du jour à 120 secondes (contre 90
                    précédemment)
                  </li>
                  <li>ajout d’un dégradé sur les indices des manches cibles</li>
                  <li>tentative de correction de non-synchronisation du compte</li>
                  <li>
                    correction de l’écran d’annonce de manche qui s’affichait par dessus le menu
                    réglages
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 22/03/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  général
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>correction de divers problèmes de grilles du jour</li>
                  <li>ajout d’un high score 3 mots</li>
                  <li>ajout d’émoticônes en réaction aux messages</li>
                  <li>chances de tomber sur des manches rapidité divisées par deux</li>
                  <li>ajustement des bots trop forts</li>
                  <li>correction d’autoscroll mobile quand on visualise les anciens messages</li>
                  <li>transparence restituée sur les annonces big score, gobble et double gobble</li>
                  <li>correction de validation automatique lorsque le timer tombe à zéro</li>
                  <li>finalisation du passage au système de compte</li>
                  <li>suppression du menu lier un compte, devenu obsolète</li>
                </ul>
                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  ordinateur
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>ajout du traçage et indication des joueurs ayant trouvé les mots</li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 15/03/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  général
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    Ajustement des missions du jour (des missions difficulté moyenne et difficile était trop laborieuses)
                  </li>
                  <li>
                    Améliorations diverses du chat sur mobile et ordinateur :
                    <div className="mt-1 space-y-1 pl-4">
                      <div>modification des émoticônes proposées</div>
                      <div>boutons modifier/réagir/répondre/supprimer toujours affichés sur ordinateur</div>
                      <div>correction d’autoscroll</div>
                      <div>consolidation du comportement « overlay » du chat sur mobile pour éviter les bugs lors de changement de phases de jeu</div>
                    </div>
                  </li>
                  <li>
                    Correction mineure d’un mauvais timing sonore lors de la fin des manches 3 mots.
                  </li>
                  <li>
                    Ajustement de la génération des grilles monstrueuses, à la fois pour les grilles journalières et les manches spéciales :
                    <div className="mt-1 space-y-1 pl-4">
                      <div>pour journalière, retour à un long mot garanti (minimum 11 lettres), un bug récent les avaient passées à 8 lettres mini.</div>
                      <div>pour la version live, minimum 10 lettres</div>
                      <div>score mini 4000 nombre de mots mini 200 pour les deux</div>
                    </div>
                  </li>
                </ul>
                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  ordinateur
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    Nouvelle possibilité d’agencer l’interface comme on veut, en intervertissant les colonnes à l’aide de poignée dédiée
                  </li>
                  <li>
                    Correction mineure pour la manche 3 mots dans le mode live : si la troisième colonne était réduite au max en largeur, la preview des mots pouvaient « manger » des lettres
                  </li>
                  <li>
                    Conversion automatique en émoticônes des raccourci usuels ( :) :p XD etc.)
                  </li>
                  <li>
                    ajout d’un slider pour le chat, permettant de régler la taille de police utilisée pour les messages
                  </li>
                  <li>
                    modification du visuel du chrono pendant les phases de jeu pour + de clarté
                  </li>
                </ul>
                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
                  téléphone
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    Optimisation du jeu pour limiter les lenteurs en extrayant des blocs du fichier de code principal et en les convertissant en modules. (chat, animations bigscore etc.)
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 08/03/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75">
                  général
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    introduction d'une nouvelle grille du jour qui est aussi une manche spéciale
                    pouvant être tirée au sort pour les manches 2 et 4 des mini-tournois: les
                    manches 3 mots. Vous placez les tuiles spéciales (mot compte double, triple,
                    etc.) et chaque mot doit partir d'une tuile de départ différente (pour éviter
                    les conjugaisons intempestives). Didacticiel dédié ajouté.
                  </li>
                  <li>
                    les grilles du jour précédentes restent avec les mêmes règles de génération
                    (au moins un mot de 12 lettres), et sont renommées en grille monstrueuse.
                  </li>
                  <li>refonte du menu "grilles du jour" en conséquence.</li>
                  <li>
                    ajout des listes de mots trouvables dans les grilles du jour précédentes
                    (test) dans l'historique.
                  </li>
                  <li>
                    passage de toutes les manches spéciales à 90 secondes (seules 2 étaient
                    réglées sur 120 secondes).
                  </li>
                  <li>refonte du chat (détails par plateforme ci-dessous).</li>
                  <li>
                    correction d'un problème sur les grilles du jour: certains mots pouvaient être
                    validés localement mais refusés côté serveur, ce qui créait des écarts de score
                    et de décompte de mots entre la partie et les résultats.
                  </li>
                  <li>suppression du son d'erreur pour des validations d'une seule lettre.</li>
                  <li>restitution des indicateurs de tuiles spéciales sur le thème par défaut.</li>
                  <li>
                    changement de logique de répartition des équipes pour les duels hebdomadaires:
                    maintenant basée uniquement sur les contributions des semaines précédentes.
                  </li>
                  <li>
                    réduction de 10 secondes des phases de résultats inter-manches, hors manches
                    cibles.
                  </li>
                </ul>
                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75">
                  ordinateur
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    refonte du chat: survol des messages des autres utilisateurs pour afficher les
                    boutons "réagir" et "répondre". Sur ses propres messages, survol pour afficher
                    "modifier" et "supprimer".
                  </li>
                  <li>modification de la logique d'autoscroll du chat.</li>
                  <li>suppression de l'effet visuel de disparition des messages chat plus anciens.</li>
                  <li>correction orthographique d'un menu thème (indicateur spécial).</li>
                </ul>
                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75">
                  téléphone
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>
                    refonte du chat sur mobile: ouverture en tiroir depuis le haut avec calcul de
                    la hauteur du clavier au premier déploiement pour s'y aligner ensuite.
                  </li>
                  <li>
                    possibilité, par appui long, de réagir via émoticônes aux messages des autres
                    utilisateurs.
                  </li>
                  <li>
                    possibilité, par swipe de gauche à droite sur les messages des autres
                    utilisateurs, d'y répondre en les citant.
                  </li>
                  <li>
                    possibilité, par appui long sur ses propres messages, de les éditer ou de les
                    supprimer.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 26/02/2026
                </div>
                <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide opacity-75">
                  général
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>nouvelle mécanique de début de manche, avec présentation plus claire de la manche à suivre, animation de placement des lettres et décompte en overlay sur la grille.</li>
                  <li>passage de 120 à 150 mots minimum pour le calcul des grilles de manches normales (jamais ajusté depuis acceptation des mots de 2 lettres).</li>
                  <li>correction de non affichage de "GG" en cas de double gobble pour les mots dans différentes listes de résultats, ainsi que le visuel dédié en animation sur la grille.</li>
                  <li>ajout d'une rubrique "remerciements" dans le menu "soutenir Gobble", dans "à propos".</li>
                  <li>remaniement du bilan de fin de partie : listing des joueurs ayant trouvé, affichage des gobbles possibles au cas où les meilleurs mots trouvés pendant la partie n'en seraient pas.</li>
                  <li>détection d'utilisation de navigateur Samsung (problématique) + message d'alerte et de solution de contournement.</li>
                  <li>optimisation/allègement de la partie son.</li>
                  <li>ajustements divers du dictionnaire.</li>
                  <li>restitution du nombre de gobbles trouvés lors des mini tournois.</li>
                  <li>définition d'une règle de départage en cas d'égalité aux points ET en nombre de gobble en fin de tournoi : celui ayant fait le plus gros score sur la totalité du tournoi l'emporte.</li>
                </ul>
                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75">
                  version ordinateur uniquement
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>logique générale de l'interface adaptative revue. Tout est modifiable à souhait : largeur des colonnes, indépendamment les unes des autres. Des traits verticaux sont "attrapables" et décalables horizontalement.</li>
                  <li>fenêtre bilan retravaillée en dock rétractable afin de ne pas masquer la grille en fin de partie. Même logique précédente des meilleurs mots trouvés, passage en cliquable pour définitions.</li>
                  <li>lors du passage d'une souris sur la liste de mots, en plus d'afficher dans la liste des joueurs qui l'a trouvé, affichage du chemin à parcourir sur la grille pour valider le mot.</li>
                  <li>tous les mots sont en outre cliquables pour aller chercher la définition via dictionnaire intégré.</li>
                  <li>modification de l'écran de fin de mini tournoi avec des flèches permettant plus aisément de passer d'un écran de stats à un autre.</li>
                  <li>réduction de taille des boutons de messages rapides du chat.</li>
                  <li>restitution de l'animation de fermeture du volet thèmes lorsqu'on clique en dehors pour le refermer.</li>
                  <li>correction de bug d'affichage de manche spéciale grille monstrueuse.</li>
                </ul>
                <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75">
                  version téléphone uniquement
                </div>
                <ul className="mt-1 list-disc pl-5 space-y-2">
                  <li>recentrage du compte à rebours en jeu, suppression de la mention "temps restant :" et de l'unité (secondes).</li>
                  <li>verrouillage UI pour scroll indésirable sur iPhone (essai).</li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 22/02/2026
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-2">
                  <li>La mise à jour de cette semaine a du caractère !</li>
                  <li>
                    introduction d'un menu thème avec des éléments de base modifiables et des
                    éléments déverrouillables via une monnaie en jeu baptisée "gobblars".
                  </li>
                  <li>
                    la grille est maintenant personnalisable à souhait, des milliers de
                    combinaisons sont possibles.
                  </li>
                  <li>
                    même sans avoir déverrouillé les options, il est possible de les tester et
                    d'avoir un aperçu en temps réel pour se fixer des objectifs et trouver une
                    configuration qui marche bien, le temps d'accumuler les gobblars qu'il faut
                    pour la mettre en place. N'hésitez pas à m'envoyer vos retours là-dessus, soit
                    via Facebook, soit via l'adresse support de Gobble
                    (support@gobble.fr).
                  </li>
                  <li>
                    introduction des gobblars. J'ai choisi d'en distribuer 500 à chaque joueur
                    pour qu'ils puissent débloquer leur premier paramètre de thème.
                  </li>
                  <li>
                    chaque gobble en jeu rapporte un gobblar. Les médailles rapportent également
                    des gobblars (10/5/3).
                  </li>
                  <li>
                    introduction des double gobble, pour les mots qui sont à la fois mot le plus
                    cher et le plus long, avec un visuel adapté et un son correspondant.
                  </li>
                  <li>
                    ajout d'un raccourci émoticônes sur version ordinateur, avec légère
                    modification du champ de saisie qui peut se dilater pour les longs messages.
                  </li>
                  <li>
                    suppression d'une boucle un peu trop lourde introduite lors de
                    l'implémentation de la fonction rotation de grille qui recalculait pour chaque
                    tuile leur position dans l'espace au moment de la validation (ta faute ça
                    beerman ! :p :p).
                  </li>
                  <li>
                    création d'un menu séparé pour la partie "son" dans les paramètres. Chaque
                    type de son est maintenant désactivable, avec ajout d'un master volume pour un
                    réglage indépendant de ceux du téléphone.
                  </li>
                  <li>
                    ajout de la possibilité de passer de la liste de mots trouvés d'un joueur à un
                    autre pendant la phase résultats.
                  </li>
                  <li>
                    ajout de l'heure à laquelle les messages ont été envoyés et sur les logs
                    serveur.
                  </li>
                  <li>
                    ajout d'un menu "soutenir gobble" dans "à propos" pour participer aux frais de
                    maintien du projet, qui restera gratuit quoi qu'il arrive.
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 21/02/2026
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-2">
                  <li>ajout d'un menu de liaison de compte pour récupérer ou transférer dans le cas de changement d'appareil.</li>
                  <li>amélioration du chat (dilatation du champ de saisie, comportement lors du démarrage d'une nouvelle manche).</li>
                  <li>rajout de chat pendant résultats de mini tournoi, sur version ordinateur.</li>
                  <li>correction des manches cibles mot le plus long qui ne renvoyaient pas nécessairement le mot le plus long de la grille pour les mots de moins de 11 lettres.</li>
                  <li>tentative de correction d'un problème de grille du jour sur certains modèles iPhone.</li>
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  patch du 18/02/2026
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-2">
                  <li>ajout d'une liste des mots trouvés par chaque joueur en cliquant sur la ligne de son pseudo + didacticiel associé.</li>
                  <li>correction des gobbles listés dans la liste des mots trouvés de chaque joueur.</li>
                  <li>modification du chat pour persistance des messages et logs serveur + élargissement de l'historique à respectivement 200 et 100 entrées.</li>
                  <li>correction du calcul de score total possible sur manches lettres en or.</li>
                  <li>ajustement des indices pour les manches cibles + correction du décompte avant prochain indice.</li>
                  <li>tentative de correction d'un problème de grille quotidienne sur ancien modèle d'iphone.</li>
                  <li>correction d'anomalies lors de retours au lobby.</li>
                  <li>stabilité réseau améliorée sur mobile, avec reconnexion et reprise de session plus robustes.</li>
                  <li>validation des mots optimisée côté live, avec envoi par batch et repli automatique mot par mot si nécessaire.</li>
                  <li>chat système enrichi avec messages de connexion, déconnexion et validation de la grille du jour.</li>
                  <li>
                    <span className="font-bold">Duel hebdo: médailles mini-tournoi comptent pour l’équipe (or/argent/bronze = 3/2/1 points).</span>
                  </li>
                  <li>les grilles quotidiennes accordent 200 points à l'équipe gagnante, au lieu de 500 comme défini précédemment.</li>
                  <li>objectifs duel complètement réajustés, avec logique de progression alignée et cumul sur plusieurs manches quand prévu.</li>
                  <li>ajout d'un bouton patch note dans le menu "à propos".</li>
                </ul>
              </div>
              <div
                className={`mt-4 rounded-xl border px-3 py-3 ${
                  darkMode ? "border-white/10 bg-slate-900/60" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-80">
                  Pools objectifs mis à jour
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-2">
                  <li><span className="font-semibold">Easy (10 pts):</span> 100 mots, 50 mots 5+, 300 pts sur 5 manches, 10 mots &gt;50 pts, 1 mot avec Z/K/X/Y, 2 mots cibles.</li>
                  <li><span className="font-semibold">Medium (25 pts):</span> 500 mots, 50 mots 7+, 2 gobbles, 500 pts sur 5 manches, 3 mots avec Z/K/X/Y, 30 mots &gt;50 pts, 5 mots cibles.</li>
                  <li><span className="font-semibold">Hard (50 pts):</span> 10 mots cibles, 1000 mots, 50 mots &gt;=100 pts, 1000 pts sur 10 manches, 10 gobbles/jour, 50 mots 8+, 10 mots avec Z/K/X/Y.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
