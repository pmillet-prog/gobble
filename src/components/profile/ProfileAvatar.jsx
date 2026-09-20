import React from "react";
import AvatarPortrait from "../../features/avatar/AvatarPortrait.jsx";
import LocalPlayerAvatar from "../../features/avatar/LocalPlayerAvatar.jsx";
import NewFeatureBadge from "../NewFeatureBadge.jsx";

export default function ProfileAvatar({ own, userId, avatar, loading = false, error = "", medals, nickname, onEdit }) {
  const portrait = { size: 320, view: "portrait", medals, nickname, label: `Avatar de ${nickname}` };
  return <div className="profile-avatar-stage">
    {loading ? <AvatarPortrait loading {...portrait} /> : error ? <span className="avatar-portrait"><span className="avatar-fallback" role="status">Avatar indisponible</span></span> :
      own ? <LocalPlayerAvatar userId={userId} fallbackValue={avatar} {...portrait} /> : <AvatarPortrait value={avatar || undefined} {...portrait} />}
    {onEdit && !loading && !error ? <button type="button" className="profile-edit-avatar" aria-label="Modifier mon avatar" title="Modifier mon avatar" onClick={onEdit}>
      <span className="material-symbols-outlined" aria-hidden="true">edit</span>
      <NewFeatureBadge />
    </button> : null}
  </div>;
}
