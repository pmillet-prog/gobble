import React from "react";
import { createRoot } from "react-dom/client";
import AvatarEditor from "../../src/features/avatar/AvatarEditor.jsx";
import { DEFAULT_AVATAR } from "../../src/features/avatar/avatarState.js";
import "../../src/index.css";
import "../../src/components/profile/playerProfile.css";
import "../avatar-profile/preview.css";

function Preview() {
  const [avatar, setAvatar] = React.useState(DEFAULT_AVATAR);
  const [open, setOpen] = React.useState(false);
  return <main className="avatar-review-page">
    <p className="profile-eyebrow">Aperçu local · sans compte ni achat</p>
    <h1>Peau et relief</h1>
    <p>Dans Visage, choisis Homme ou Femme, ajuste la silhouette puis compare les quatre visages et les teintes. Le choix est conservé uniquement pendant cette visite.</p>
    <div className="avatar-review-actions"><button onClick={() => setOpen(true)}>Tester l’atelier</button></div>
    {open ? <div className="player-profile-overlay"><div className="player-profile-backdrop" onClick={() => setOpen(false)} />
      <div className="player-profile-dialog player-profile-dialog-editor">
        <AvatarEditor initialValue={avatar} nickname="Aperçu" onClose={() => setOpen(false)} onSave={async value => setAvatar(value)} />
      </div>
    </div> : null}
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
