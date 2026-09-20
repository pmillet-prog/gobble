import React from "react";
import { createRoot } from "react-dom/client";
import PlayerProfileModal from "../../src/components/PlayerProfileModal.jsx";
import AvatarEditor from "../../src/features/avatar/AvatarEditor.jsx";
import AvatarPartThumbnail from "../../src/features/avatar/AvatarPartThumbnail.jsx";
import { loadAvatarCatalog } from "../../src/features/avatar/avatarCatalog.js";
import { DEFAULT_AVATAR } from "../../src/features/avatar/avatarState.js";
import { getMedalDateId, getMedalResetAt } from "../../shared/dailyMedals.js";
import "../../src/index.css";
import "./preview.css";
import WeeklyRecapPreview from "./WeeklyRecapPreview.jsx";
import AvatarShopPreview from "./AvatarShopPreview.jsx";
import AvatarPortrait from "../../src/features/avatar/AvatarPortrait.jsx";

const CASES = [
  ["Aucune médaille", {}], ["Une médaille d’or", { gold: 1 }], ["Trois médailles d’or", { gold: 3 }],
  ["Or, argent, bronze", { gold: 1, silver: 1, bronze: 1 }], ["Quatre médailles d’or", { gold: 4 }],
  ["Trois piles", { gold: 4, silver: 2, bronze: 3 }],
];
const SAMPLE = {
  userId: 987654322, nick: "Tigre", trophies: { league: "Ligue Or", trophies: 1280 },
  lifetime: { roundsPlayed: 412, totalScore: 98760, gobbles: 128, doubleGobbles: 12, bestRoundScore: 684, bestWord: { word: "EXTRAORDINAIRE", pts: 124 }, longestWord: { word: "CHOCOLATERIE", len: 12 }, mostWordsInGame: { wordsCount: 48 } },
  vocabulary: { count: 4230, rank: 18, totalPlayers: 320 }, duel: { team: "blue", points: 1250, rank: 7 },
  weekly: { currentWeek: { totalScore: { totalScore: 8760, roundsPlayed: 31 } } },
};

function Preview() {
  const [avatar, setAvatar] = React.useState(DEFAULT_AVATAR);
  const [selected, setSelected] = React.useState(2);
  const [mode, setMode] = React.useState("menu");
  const [catalog, setCatalog] = React.useState(null);
  React.useEffect(() => { let active = true; loadAvatarCatalog().then(value => { if (active) setCatalog(value); }); return () => { active = false; }; }, []);
  const profile = React.useMemo(() => ({ ...SAMPLE, avatar,
    dailyMedals: { ...CASES[selected][1], dateId: getMedalDateId(), expiresAt: getMedalResetAt() },
  }), [avatar, selected]);
  return <main className="avatar-review-page">
    <p className="profile-eyebrow">Aperçu local · données fictives</p><h1>Le profil et ses médailles</h1>
    <p>Ouvre une fiche pour comparer les rangées et les piles. L’atelier ci-dessous modifie uniquement cet aperçu.</p>
    <p><a href="/dev/avatar-rewards/">Tester l’étiquette de Julien et le toast de déblocage →</a></p>
    <div style={{ width: 120, height: 120 }}><AvatarPortrait label="Avatar par défaut sans déblocage" /></div>
    <div className="avatar-review-actions"><button onClick={() => setMode("shopnew")}>Nouveau joueur · 25 000 gobblars fictifs</button><button onClick={() => setMode("shoplow")}>Tester un solde insuffisant · 400 gobblars</button><button onClick={() => setMode("shop99")}>Couronne · 99 victoires</button><button onClick={() => setMode("shop100")}>Couronne · 100 victoires</button></div>
    <div className="avatar-review-actions"><button onClick={() => { setAvatar(value => ({ ...value, eyes: "dots", lashes: "", accessories: "tiger_plush" })); setMode("editor"); }}>Nouveau · yeux en points et peluche</button><button onClick={() => { setAvatar(value => ({ ...value, eyes: "iris_only", lashes: "", accessories: "tiger_plush" })); setMode("editor"); }}>Nouveau · iris et pupilles</button></div>
    {mode.startsWith("shop") ? <AvatarShopPreview key={mode} avatar={mode === "shopnew" || mode === "shoplow" ? null : avatar} startingBalance={mode === "shoplow" ? 400 : 25000} wins={mode === "shop100" ? 100 : mode === "shop99" ? 99 : 0} onSave={async value => setAvatar(value)} onClose={() => setMode("menu")} /> : null}
    <div className="avatar-review-actions">{CASES.map(([label], index) => <button key={label} onClick={() => { setSelected(index); setMode("profile"); }}>{label}</button>)}<button onClick={() => setMode("editor")}>Tester l’atelier</button><button onClick={() => setMode("weekly")}>Récap de la semaine</button></div>
    {mode === "weekly" ? <WeeklyRecapPreview avatar={avatar} onClose={() => setMode("menu")} /> : null}
    {mode === "profile" ? <PlayerProfileModal open profile={profile} nickname="Tigre" onClose={() => setMode("menu")} /> : null}
    {mode === "editor" ? <div className="player-profile-overlay"><div className="player-profile-backdrop" onClick={() => setMode("menu")} /><div className="player-profile-dialog player-profile-dialog-editor"><AvatarEditor initialValue={avatar} nickname="Tigre" onClose={() => setMode("menu")} onSave={async value => { setAvatar(value); }} /></div></div> : null}
    {catalog ? ["brows", "headwear"].map(family => <section key={family} className="avatar-review-thumbnails">
      <h2>{family === "brows" ? "Sourcils" : "Chapeaux"}</h2><div className={`avatar-parts avatar-parts-${family}`}>
        {catalog.families[family].map(part => <button key={part.id} title={part.label} onClick={() => { setAvatar(value => ({ ...value, [family]: part.id })); setMode("profile"); }}><AvatarPartThumbnail part={part} /><span>{part.label}</span></button>)}
      </div></section>) : <p>Chargement des pièces…</p>}
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
