import React from "react";
import { createRoot } from "react-dom/client";
import AvatarPortrait from "../../src/features/avatar/AvatarPortrait.jsx";
import AvatarAccessoryPreview from "../../src/features/avatar/AvatarAccessoryPreview.jsx";
import AvatarEditor from "../../src/features/avatar/AvatarEditor.jsx";
import ProfileJulienChallenge from "../../src/components/profile/ProfileJulienChallenge.jsx";
import { loadAvatarCatalog } from "../../src/features/avatar/avatarCatalog.js";
import { normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { AVATAR_OBJECTIVES } from "../../shared/avatarObjectives.js";
import { getAvatarUnlockRule } from "../../shared/avatarUnlocks.js";
import { createAvatarRewardNotifier } from "../../src/features/avatar/createAvatarRewardNotifier.js";
import { createNotificationsFeature } from "../../src/features/notifications/createNotificationsFeature.js";
import { createResourceScope } from "../../src/app/core/createResourceScope.js";
import ToastStack from "../../src/components/ToastStack.jsx";
import WeeklyAuraPreview from "./WeeklyAuraPreview.jsx";
import "../../src/index.css";
import "../../src/components/profile/playerProfile.css";
import "./preview.css";

function Preview() {
  const [nickname, setNickname] = React.useState("Tigre");
  const [count, setCount] = React.useState(99);
  const [avatar, setAvatar] = React.useState(() => normalizeAvatar({ accessories: "participant_tag" }));
  const [medals, setMedals] = React.useState({ gold: 3 });
  const [editor, setEditor] = React.useState(false);
  const [catalog, setCatalog] = React.useState(null);
  const name = React.useRef(nickname); name.current = nickname;
  const [notifications] = React.useState(() => {
    const scope = createResourceScope("avatar-reward-preview");
    const feature = createNotificationsFeature({ scope }); feature.start();
    return { ...feature, dispose: scope.dispose };
  });
  const toasts = React.useSyncExternalStore(notifications.store.subscribe, () => notifications.store.getState().toasts);
  const notifier = React.useRef(null);
  const resetNotifier = () => {
    notifier.current?.dispose();
    notifier.current = createAvatarRewardNotifier({ userId: 1, nickname: () => name.current, show: notifications.show, acknowledge: async () => {} });
  };
  React.useEffect(() => {
    let active = true;
    resetNotifier();
    loadAvatarCatalog().then(value => { if (active) setCatalog(value); });
    return () => { active = false; notifier.current?.dispose(); notifications.dispose(); };
  }, [notifications]);
  const reward = { ...AVATAR_OBJECTIVES.lepers_correct_answers, key: "accessories:participant_tag", objective: "lepers_correct_answers" };
  const advance = () => {
    const next = count + 1;
    setCount(next);
    if (count < 100 && next >= 100) notifier.current.receive({ userId: 1, rewards: [reward] });
  };
  const inventory = React.useMemo(() => ({ userId: 1, balance: 25000, miniTournamentWins: 0, lepersCorrectAnswers: count,
    owned: { "base:homme": true, "base:femme": true, ...Object.fromEntries(Object.entries(catalog?.families || {}).flatMap(([family, parts]) => parts.filter(part => getAvatarUnlockRule(family, part.id, part).type === "gobblars").map(part => [`${family}:${part.id}`, true]))) },
  }), [catalog, count]);
  return <main className="reward-preview-page">
    <header><p className="reward-preview-kicker">Aperçu local · aucun compte modifié</p><h1>L’étiquette de Julien</h1><p>Pars de 99 bonnes réponses, puis ajoute la 100e pour voir le déblocage et son toast.</p></header>
    <div className="reward-preview-grid">
      <section className="reward-preview-card"><div className="reward-preview-portrait"><AvatarPortrait value={avatar} nickname={nickname} medals={medals} view="portrait" size={420} /></div><p>Étiquette à gauche · médailles à droite</p><ProfileJulienChallenge count={count} nickname={nickname} /></section>
      <section className="reward-preview-card reward-preview-controls">
        <label>Pseudo sur l’étiquette<input value={nickname} maxLength={25} onChange={event => setNickname(event.target.value)} /></label>
        <div className="reward-preview-tag"><AvatarAccessoryPreview nickname={nickname} /></div>
        <strong className="reward-preview-count">{count} / 100 bonnes réponses</strong><progress value={Math.min(count, 100)} max="100" />
        <p>{count >= 100 ? "Étiquette débloquée dans cet aperçu." : "Encore une bonne réponse pour gagner ton étiquette."}</p>
        <button onClick={advance}>Bonne réponse · +1</button>
        <button onClick={() => { setCount(99); notifications.clear(); resetNotifier(); }}>Revenir à 99 pour retester</button>
        <button onClick={() => notifications.show(`Débloqué : ${reward.label}`, 8000, { avatarReward: { ...reward, nickname } })}>Rejouer seulement le toast</button>
        <button disabled={!catalog} onClick={() => notifications.show("Débloqué : Couronne", 8000, { avatarReward: { ...AVATAR_OBJECTIVES.mini_tournament_wins, imageUrl: `/avatars/v1/${catalog.families.headwear.find(part => part.id === "crown").file}` } })}>Voir aussi le toast de la couronne</button>
        <button disabled={!catalog} onClick={() => setEditor(true)}>Ouvrir l’atelier sur l’accessoire</button>
        <div className="reward-preview-options"><button onClick={() => setAvatar(value => normalizeAvatar({ ...value, base: value.base === "homme" ? "femme" : "homme" }, catalog))}>Changer de visage</button><button onClick={() => setAvatar(value => ({ ...value, headwear: value.headwear ? "" : "tophat" }))}>Avec / sans chapeau</button><button onClick={() => setMedals(value => value.silver ? { gold: 3 } : { gold: 4, silver: 2, bronze: 3 })}>Rangée / piles de médailles</button></div>
        <small>Le rendu est essayable à 99 ; l’enregistrement de l’accessoire dans l’atelier nécessite 100.</small>
      </section>
    </div>
    <WeeklyAuraPreview catalog={catalog} notifications={notifications} />
    <ToastStack toasts={toasts} darkMode />
    {editor ? <div className="player-profile-overlay"><div className="player-profile-backdrop" onClick={() => setEditor(false)} /><div className="player-profile-dialog player-profile-dialog-editor"><AvatarEditor initialValue={avatar} initialCategory="accessories" nickname={nickname} inventory={inventory} onClose={() => setEditor(false)} onSave={async value => setAvatar(value)} /></div></div> : null}
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
