import React, { Suspense } from "react";
import { createPortal } from "react-dom";
import { getVocabLevelMeta, getVocabRankImageUrl, VOCAB_LEVELS } from "../vocabRanks.js";
import ProfileAvatar from "./profile/ProfileAvatar.jsx";
import ProfileMedalCaption from "./profile/ProfileMedalCaption.jsx";
import ProfileJulienChallenge from "./profile/ProfileJulienChallenge.jsx";
import useProfileMedals from "./profile/useProfileMedals.js";
import { isOwnPlayerProfile } from "../features/avatar/avatarState.js";
import useProfileDialog from "./profile/useProfileDialog.js";
import GobblarsBalance from "./GobblarsBalance.jsx";
import { useApplicationSelector } from "../app/react/ApplicationRuntimeProvider.jsx";
import { selectAvatarMaintenanceMode } from "../features/avatar/avatarAvailability.js";
import { formatNumber, formatRank, formatTargetTime, getProfileHighlights } from "./profile/profileViewModel.js";
import "./profile/playerProfile.css";

const AvatarEditor = React.lazy(() => import("../features/avatar/AccountAvatarEditor.jsx"));
const TYPES = [["normal", "Normales"], ["target", "Cibles"], ["special3", "3 mots"], ["bonusLetter", "Lettre en or"], ["massiveBoggle", "Massive Boggle"], ["fakeTwins", "Faux jumeaux"]];
const Icon = ({ children }) => <span className="material-symbols-outlined" aria-hidden="true">{children}</span>;
function Record({ icon, label, value, detail, featured = false }) {
  return <div className={`profile-record ${featured ? "profile-record-featured" : ""}`}><Icon>{icon}</Icon><span>{label}</span><strong>{value || "—"}</strong>{detail ? <small>{detail}</small> : null}</div>;
}
function Detail({ label, children }) {
  return <div className="profile-detail"><span>{label}</span><strong>{children}</strong></div>;
}
function Vocabulary({ vocabulary = {} }) {
  const count = Number(vocabulary.count) || 0;
  const level = getVocabLevelMeta(count);
  const next = VOCAB_LEVELS[VOCAB_LEVELS.indexOf(level) + 1];
  const percent = next ? Math.max(0, Math.min(100, (count - level.min) / (level.max - level.min) * 100)) : 100;
  return <section className="profile-vocabulary" aria-label="Progression du vocabulaire"><img src={getVocabRankImageUrl(level)} alt="" /><div><div className="profile-section-heading"><span>Maîtrise des mots</span><small>{formatRank(vocabulary.rank, vocabulary.totalPlayers)}</small></div><div className="profile-vocabulary-title"><strong>{level.label}</strong><span>{formatNumber(count)} mots découverts</span></div><div className="profile-progress" role="progressbar" aria-label="Progression du vocabulaire" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div><small>{next ? `${formatNumber(Math.max(0, next.min - count))} mots avant ${next.label}` : "Le plus haut rang atteint !"}</small></div></section>;
}
function HeadToHead({ value, nickname }) {
  if (!value) return null;
  const total = value.total || {};
  return <section className="profile-duel"><div className="profile-section-heading"><span>Nos face-à-face</span><Icon>swords</Icon></div>{Number(total.roundsPlayed) > 0 ? <><div className="profile-versus"><div><strong>{formatNumber(total.viewerWins)}</strong><span>Tes victoires</span></div><b>VS</b><div><strong>{formatNumber(total.targetWins)}</strong><span>{nickname}</span></div></div><p>{formatNumber(total.draws)} égalités · {formatNumber(total.roundsPlayed)} manches ensemble</p><details><summary>Par type de manche</summary>{TYPES.map(([type, label]) => { const row = value.byType?.[type] || {}; return <Detail key={type} label={label}>{Number(row.roundsPlayed) > 0 ? `${formatNumber(row.viewerWins)} – ${formatNumber(row.targetWins)}` : "—"}{Number(row.draws) > 0 ? ` · ${formatNumber(row.draws)} nul${Number(row.draws) > 1 ? "s" : ""}` : ""}</Detail>; })}</details></> : <p>Votre première rencontre reste à jouer !</p>}</section>;
}

export default function PlayerProfileModal({ open = false, darkMode = false, loading = false, error = "", profile = null, viewerUserId = null, gobblarsBalance = 0, nickname = "Joueur", onClose = null }) {
  const [editing, setEditing] = React.useState(false);
  const maintenanceMode = useApplicationSelector(selectAvatarMaintenanceMode);
  const dialogRef = React.useRef(null);
  const own = isOwnPlayerProfile(viewerUserId, profile?.userId);
  const editorOpen = own && editing;
  const dailyMedals = useProfileMedals(profile?.dailyMedals, open);
  const closeEditor = React.useCallback(() => setEditing(false), []);
  useProfileDialog(dialogRef, editorOpen ? closeEditor : onClose, open, editorOpen ? "editor" : "profile");
  if (!open || typeof document === "undefined") return null;
  const nick = profile?.nick || nickname;
  const highlights = getProfileHighlights(profile);
  const trophies = profile?.trophies;
  const currentWeek = profile?.weekly?.currentWeek || {};
  const allTime = profile?.weekly?.allTime || {};
  const duel = profile?.duel || {};
  return createPortal(<div className="player-profile-overlay" data-theme={darkMode ? "dark" : "light"}>
    <div className="player-profile-backdrop" onClick={editorOpen ? closeEditor : onClose} aria-hidden="true" />
    <div className={`player-profile-dialog ${editorOpen ? "player-profile-dialog-editor" : ""}`} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="player-profile-title">
      {editorOpen ? <Suspense fallback={<div className="profile-editor-loading"><p role="status">Ouverture de l’atelier…</p><button type="button" onClick={closeEditor}>Revenir au profil</button></div>}><AvatarEditor userId={viewerUserId} nickname={nick} onClose={closeEditor} maintenanceMode={maintenanceMode} /></Suspense> : <>
        <header className="player-profile-toolbar"><span className="profile-eyebrow">{own ? "Mon profil" : "Carte de joueur"}</span><button type="button" className="profile-close" aria-label="Fermer le profil" onClick={onClose}>×</button></header>
        <div className="player-profile-scroll">
          <section className="profile-hero">
            <div className="profile-hero-glow" aria-hidden="true" />
            <ProfileAvatar own={own} userId={viewerUserId} avatar={profile?.avatar} loading={loading || (!profile && !error)} error={error} medals={dailyMedals} nickname={nick} onEdit={own && !loading && !error && !maintenanceMode ? () => setEditing(true) : null} />
            <div className="profile-identity"><span className="profile-eyebrow">{trophies?.league || "Prêt à jouer"}</span><h1 id="player-profile-title">{nick}</h1><div className="profile-identity-badges">{trophies ? <span className="profile-trophies"><Icon>emoji_events</Icon>{formatNumber(trophies.trophies)} trophées</span> : null}{duel.team ? <span className={`profile-team profile-team-${duel.team === "red" ? "red" : "blue"}`}>Équipe {duel.team === "red" ? "rouge" : "bleue"}</span> : null}</div><ProfileMedalCaption medals={dailyMedals} /></div>
          </section>
          {own ? <div className="profile-wallet"><span>Mon trésor</span><GobblarsBalance balance={gobblarsBalance} /></div> : null}
          {own && maintenanceMode ? <p className="profile-state" role="status">L’éditeur d’avatar est indisponible pendant la mise à jour.</p> : null}
          {loading ? <div className="profile-state" role="status">La carte du joueur arrive…</div> : error ? <div className="profile-state profile-error" role="alert">{error}</div> : <div className="profile-content">
            <div className="profile-career" aria-label="Parcours de jeu"><div><Icon>stadia_controller</Icon><strong>{formatNumber(highlights.rounds)}</strong><span>manches jouées</span></div><div><Icon>stars</Icon><strong>{formatNumber(highlights.score)}</strong><span>points cumulés</span></div><div><Icon>local_fire_department</Icon><strong>{formatNumber(highlights.gobbles)}</strong><span>gobbles <small>dont {formatNumber(highlights.doubleGobbles)} doubles</small></span></div></div>
            <Vocabulary vocabulary={profile?.vocabulary} />
            <ProfileJulienChallenge count={profile?.avatarStats?.lepersCorrectAnswers} nickname={nick} />
            <section className="profile-records"><div className="profile-section-heading"><span>Les plus beaux exploits</span><Icon>workspace_premium</Icon></div><div className="profile-record-grid"><Record icon="military_tech" label="Manche record" value={highlights.bestRound ? formatNumber(highlights.bestRound) : "—"} detail="points en une manche" featured /><Record icon="auto_awesome" label="Mot le plus précieux" value={highlights.bestWord?.word} detail={highlights.bestWord?.pts ? `${formatNumber(highlights.bestWord.pts)} points` : "Le prochain sera peut-être le bon"} featured /><Record icon="straighten" label="Mot le plus long" value={highlights.longestWord?.word} detail={highlights.longestWord?.len ? `${formatNumber(highlights.longestWord.len)} lettres` : "À découvrir"} /><Record icon="bolt" label="Avalanche de mots" value={highlights.mostWords?.wordsCount ? formatNumber(highlights.mostWords.wordsCount) : "—"} detail="mots en une manche" /></div><details className="profile-other-records"><summary>Tous les records <span aria-hidden="true">+</span></summary><Detail label="Meilleur 3 mots">{highlights.bestSpecial3 ? `${formatNumber(highlights.bestSpecial3)} pts` : "—"}</Detail><Detail label="Cible longueur">{formatTargetTime(allTime.bestTimeTargetLong?.ms)}{allTime.bestTimeTargetLong?.word ? ` · ${allTime.bestTimeTargetLong.word}` : ""}</Detail><Detail label="Cible score">{formatTargetTime(allTime.bestTimeTargetScore?.ms)}{allTime.bestTimeTargetScore?.word ? ` · ${allTime.bestTimeTargetScore.word}` : ""}</Detail></details></section>
            <section className="profile-week"><div className="profile-section-heading"><span>Cette semaine, on joue !</span><Icon>date_range</Icon></div><div className="profile-week-grid"><div><span>La course aux points</span><strong>{formatNumber(currentWeek.totalScore?.totalScore || 0)} <small>pts</small></strong><p>{formatNumber(currentWeek.totalScore?.roundsPlayed || 0)} manches jouées</p></div><div><span>Le duel des équipes</span><strong>{formatNumber(duel.points)} <small>pts</small></strong><p>{duel.rank ? `Rang #${formatNumber(duel.rank)}` : "Le classement t’attend"}</p></div></div></section>
            {!own ? <HeadToHead value={profile?.headToHead} nickname={nick} /> : null}
          </div>}
        </div>
      </>}
    </div>
  </div>, document.body);
}
