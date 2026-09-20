import React from "react";
import AvatarCloseButton from "./AvatarCloseButton.jsx";
import AvatarPartThumbnail from "./AvatarPartThumbnail.jsx";
import AvatarPortrait from "./AvatarPortrait.jsx";
import GobblarsBalance from "../../components/GobblarsBalance.jsx";
import { createBlankAvatar } from "./avatarState.js";
import { AVATAR_OBJECTIVES, getAvatarObjectiveProgress } from "../../../shared/avatarObjectives.js";

export default function AvatarAssetDialog({ selection, inventory, nickname, busy, onPurchase, onWear, canWear, otherTrials, onCheckout, onClose }) {
  const ref = React.useRef(null);
  const mounted = React.useRef(false);
  const buying = React.useRef(false);
  const titleId = React.useId();
  const [error, setError] = React.useState("");
  const [bought, setBought] = React.useState(false);
  const { family, part, rule } = selection;
  const baseAvatar = React.useMemo(() => family === "base" ? createBlankAvatar(part.id) : null, [family, part.id]);
  React.useEffect(() => {
    mounted.current = true;
    const dialog = ref.current;
    dialog.showModal();
    return () => { mounted.current = false; dialog.close(); };
  }, []);
  const purchase = async () => {
    if (buying.current) return;
    buying.current = true;
    setError("");
    try { await onPurchase([{ family, id: part.id }]); if (mounted.current) setBought(true); }
    catch (reason) { if (mounted.current) setError(reason.message || "L’achat a échoué. Réessaie."); }
    finally { buying.current = false; }
  };
  const wear = async () => {
    if (buying.current) return;
    buying.current = true; setError("");
    try { await onWear(); }
    catch (reason) { if (mounted.current) setError(`Ta pièce reste acquise. ${reason.message || "L’avatar n’a pas pu être enregistré. Réessaie."}`); }
    finally { buying.current = false; }
  };
  const objective = AVATAR_OBJECTIVES[rule.objective];
  const missing = Math.max(0, rule.price - inventory.balance);
  return <dialog ref={ref} className="avatar-asset-dialog" aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><span className="profile-eyebrow">{rule.type === "gobblars" ? "Une nouvelle pièce" : rule.objective === "donor" ? "Merci pour votre soutien" : "À gagner en jeu"}</span><AvatarCloseButton label="Fermer la confirmation" disabled={busy} onClick={onClose} /></header>
    <div className={`avatar-asset-dialog-art avatar-parts-${family}`}>
      {family === "base" ? <AvatarPortrait value={baseAvatar} view="portrait" size={160} /> : <AvatarPartThumbnail part={part} nickname={nickname} />}
    </div>
    <h2 id={titleId}>{part.label}</h2>
    {bought ? <>
      <p role="status"><strong>Achat réussi !</strong> Cette pièce est maintenant à toi.</p>
      <p>« Porter maintenant » enregistre les éléments acquis de ton aperçu sur ton profil.</p>
      {otherTrials > 0 ? <p>{otherTrials} autre(s) élément(s) encore en essai ne seront pas appliqués : tu garderas tes pièces précédentes à leur place, si elles sont compatibles.</p> : null}
      {!canWear ? <p>Il te reste à acheter le visage sélectionné avant de pouvoir porter cet avatar.</p> : null}
      <button type="button" className="avatar-save" disabled={busy || !canWear} onClick={wear}>{busy ? "Enregistrement…" : "Porter maintenant"}</button>
      {otherTrials > 0 || !canWear ? <button type="button" className="avatar-cancel" disabled={busy} onClick={onCheckout}>Voir l’achat de l’ensemble</button> : null}
    </> : rule.type === "gobblars" ? <>
      <div className="avatar-asset-dialog-wallet"><span>Ton trésor</span><GobblarsBalance balance={inventory.balance} /></div>
      <p>Cette pièce restera à toi. Après l’achat, tu pourras la porter immédiatement ou continuer à composer ton avatar.</p>
      {missing > 0 ? <p className="avatar-asset-dialog-shortfall">Il te manque {missing.toLocaleString("fr-FR")} gobblars.</p> : null}
      <button type="button" className="avatar-save" disabled={busy || missing > 0} onClick={purchase}>{busy ? "Achat en cours…" : `Acheter pour ${rule.price.toLocaleString("fr-FR")} gobblars`}</button>
    </> : <>
      <p>{rule.label}</p>
      {objective ? <div className="avatar-unlock-objective"><progress max={rule.required} value={Math.min(getAvatarObjectiveProgress(inventory, rule.objective), rule.required)} /><span>{getAvatarObjectiveProgress(inventory, rule.objective)} / {rule.required} {objective.unit}</span></div> : rule.pending ? <p>Cet objectif n’est pas encore activé.</p> : null}
    </>}
    {error ? <p role="alert" className="avatar-asset-dialog-error">{error}</p> : null}
    <button autoFocus type="button" className="avatar-cancel" disabled={busy} onClick={onClose}>Continuer l’essai</button>
  </dialog>;
}
