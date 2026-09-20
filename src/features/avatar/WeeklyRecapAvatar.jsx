import React from "react";
import AvatarPortrait from "./AvatarPortrait.jsx";
import LocalPlayerAvatar from "./LocalPlayerAvatar.jsx";
import { collectRecapAvatarIds, recapAvatarUserId } from "./weeklyRecapAvatars.js";
import { getPresenterPodiumAvatar } from "../celebration/presenterPodiumAvatars.js";
import { PRESENTER_IDENTITIES } from "../presenters/presenterIdentity.js";
import "./weeklyRecapAvatar.css";

const Appearances = React.createContext({ avatars: {}, loading: false, viewerUserId: null });

export function WeeklyRecapAvatars({ summary, weeklyStats, viewerUserId, children }) {
  const ids = collectRecapAvatarIds(summary, weeklyStats, viewerUserId).join(",");
  const [batch, setBatch] = React.useState({ ids: "", avatars: {} });
  React.useEffect(() => {
    if (!ids) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(`/api/auth/avatars?userIds=${ids}`, {
      credentials: "include", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" },
    }).then(async response => {
      if (!response.ok) throw new Error("avatars_unavailable");
      const data = await response.json();
      if (!data?.ok || !data.avatars || typeof data.avatars !== "object") throw new Error("avatars_unavailable");
      return data.avatars;
    }).catch(() => ({})).then(avatars => {
      if (active) setBatch({ ids, avatars });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [ids]);
  const value = React.useMemo(() => ({
    avatars: batch.ids === ids ? batch.avatars : {}, loading: !!ids && batch.ids !== ids, viewerUserId,
  }), [batch, ids, viewerUserId]);
  return <Appearances.Provider value={value}>{children}</Appearances.Provider>;
}

export default function WeeklyRecapAvatar({ entry, portrait = false }) {
  const { avatars, loading, viewerUserId } = React.useContext(Appearances);
  const userId = recapAvatarUserId(entry);
  const presenter = getPresenterPodiumAvatar(entry);
  const own = userId && userId === Number(viewerUserId);
  const props = { size: portrait ? 240 : 40, view: portrait ? "portrait" : "face", expression: "happy", nickname: entry?.nick, label: `Avatar de ${entry?.nick || "joueur"}` };
  let content;
  if (presenter) {
    content = <img src={portrait ? presenter.poses.neutral : PRESENTER_IDENTITIES[presenter.key].buttonUrl} alt={props.label} draggable="false" />;
  } else if (own) {
    content = <LocalPlayerAvatar userId={userId} {...props} />;
  } else if (loading && userId && !entry?.avatar) {
    content = <span className="weekly-recap-avatar-placeholder" role="img" aria-label="Chargement de l’avatar">✦</span>;
  } else {
    content = <AvatarPortrait value={avatars[userId] || entry?.avatar || undefined} {...props} />;
  }
  return <span className={`weekly-recap-avatar${portrait ? " weekly-recap-avatar-portrait" : ""}`}>{content}</span>;
}
