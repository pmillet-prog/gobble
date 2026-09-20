import React from "react";
import AvatarPortrait from "../../src/features/avatar/AvatarPortrait.jsx";
import { normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { WEEKLY_AVATAR_AURAS } from "../../shared/avatarWeeklyAuras.js";
import { weeklyAuraStore } from "../../src/features/avatar/weeklyAuraStore.js";

export default function WeeklyAuraPreview({ catalog, notifications }) {
  const [avatar, setAvatar] = React.useState(() => normalizeAvatar({ accessories: "tiger_plush" }));
  const [status, setStatus] = React.useState("Choisis un rang pour voir l’aura et son toast.");
  const update = (grants, expiresAt) => {
    const previous = weeklyAuraStore.getSnapshot();
    weeklyAuraStore.update({ weekStartTs: Math.max(Date.now(), (previous?.weekStartTs || 0) + 1), expiresAt, grants });
  };
  const grant = aura => {
    const expiresAt = Date.now() + 8000;
    update({ 41: aura.id }, expiresAt);
    setAvatar(value => ({ ...value, auras: aura.id, weeklyAura: { userId: 41, id: aura.id, expiresAt } }));
    const part = catalog.families.auras.find(part => part.id === aura.id);
    notifications.show(`Débloqué : ${aura.label}`, 8000, { avatarReward: { ...aura, family: "auras", objective: "weekly_race", expiresAt,
      imageUrl: `/avatars/v1/${part.layers?.thumbnail || part.file}` } });
    setStatus("Expiration accélérée : l’aura disparaît après 8 secondes. Le reste de l’avatar reste visible.");
  };
  return <section className="reward-preview-card">
    <h2>Auras de la course hebdo</h2>
    <p>Simulation locale : une semaine dure ici 8 secondes.</p>
    <div style={{ width: 280, height: 280, margin: "auto" }}><AvatarPortrait value={avatar} view="portrait" size={280} /></div>
    <div className="reward-preview-options">
      {WEEKLY_AVATAR_AURAS.map(aura => <button key={aura.id} disabled={!catalog} onClick={() => grant(aura)}>Gagner l’aura {aura.place} place</button>)}
      <button disabled={!avatar.weeklyAura} onClick={() => {
        update({ 41: avatar.auras }, Math.max(Date.now() + 8000, (weeklyAuraStore.getSnapshot()?.expiresAt || 0) + 8000));
        setStatus("Même rang : l’aura est prolongée sans nouveau toast de déblocage.");
      }}>Conserver le même rang</button>
      <button disabled={!avatar.weeklyAura} onClick={() => {
        update({}, Math.max(Date.now() + 8000, (weeklyAuraStore.getSnapshot()?.expiresAt || 0) + 1));
        setStatus("Sortie du podium : l’aura se retire immédiatement.");
      }}>Sortir du podium</button>
    </div><p role="status">{status}</p>
  </section>;
}
