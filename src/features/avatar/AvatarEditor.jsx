import React from "react";
import AvatarPortrait from "./AvatarPortrait.jsx";
import AvatarCategoryIcon from "./AvatarCategoryIcon.jsx";
import AvatarPartThumbnail from "./AvatarPartThumbnail.jsx";
import AvatarEditorControls from "./AvatarEditorControls.jsx";
import { ALL_AVATAR_SLIDERS, getAvatarChoices } from "./avatarControls.js";
import { loadAvatarCatalog } from "./avatarRenderer.js";
import { normalizeAvatar, createBlankAvatar } from "./avatarState.js";
import { getLockedAvatarParts, getAvatarUnlockRule, isAvatarPartUnlocked, hasUnlockedAvatarEyes } from "../../../shared/avatarUnlocks.js";
import { hasAvatarEyelids } from "../../../shared/avatarEyes.js";
import AvatarUnlockBadge from "./AvatarUnlockBadge.jsx";
import AvatarAssetDialog from "./AvatarAssetDialog.jsx";
import AvatarCloseButton from "./AvatarCloseButton.jsx";
import GobblarsBalance from "../../components/GobblarsBalance.jsx";
import AvatarCheckoutDialog from "./AvatarCheckoutDialog.jsx";
import AvatarMaintenanceNotice from "./AvatarMaintenanceNotice.jsx";
import { getAvatarPurchasePlan, getOwnedAvatarAppearance } from "./avatarPurchasePlan.js";
import { getAvatarPartIds, selectAvatarPart, removeAvatarParts } from "../../../shared/avatarSelections.js";
import useAvatarDragScroll from "./useAvatarDragScroll.js";
import AvatarRefundDialog from "./AvatarRefundDialog.jsx";
import AvatarFaceOptions from "./AvatarFaceOptions.jsx";

const CATEGORIES = [
  ["base", "Visage", "face"], ["eyes", "Regard", "visibility"],
  ["brows", "Sourcils", "gesture"], ["lashes", "Cils"], ["nose", "Nez", "person"],
  ["mouths", "Bouche", "mood"], ["hair", "Cheveux", "face_3"],
  ["headwear", "Chapeaux"], ["glasses", "Lunettes"], ["facialhair", "Barbe", "face_6"],
  ["clothes", "Vêtements"], ["backdrops", "Décor", "landscape"],
  ["accessories", "Accessoires", "badge"],
  ["auras", "Auras", "auto_awesome"],
];
const OPTIONAL = new Set(["eyes", "nose", "mouths", "hair", "brows", "lashes", "headwear", "glasses", "facialhair", "clothes", "backdrops", "auras", "accessories"]);

export default function AvatarEditor({ initialValue, nickname, onClose, onSave, onReload, inventory = null, onPurchase, onRefundQuote, onRefund, initialCategory = "base", maintenanceMode = false }) {
  const [draft, setDraft] = React.useState(() => initialValue ? normalizeAvatar(initialValue) : createBlankAvatar());
  const [baseChosen, setBaseChosen] = React.useState(!!initialValue);
  const [category, setCategory] = React.useState(initialValue ? initialCategory : "base");
  const [selection, setSelection] = React.useState(null);
  const [checkout, setCheckout] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [catalog, setCatalog] = React.useState(null);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [resolution, setResolution] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [purchasing, setPurchasing] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const savingRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const optionsRef = React.useRef(null);
  const categoryDrag = useAvatarDragScroll("x");
  const optionsDrag = useAvatarDragScroll("y");

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
    if (maintenanceMode) { setSelection(null); setCheckout(false); setRefundOpen(false); }
  }, [maintenanceMode]);

  React.useEffect(() => {
    let active = true;
    setError("");
    loadAvatarCatalog().then(value => {
      if (active) { setCatalog(value); setDraft(previous => normalizeAvatar(previous, value)); }
    }).catch(() => { if (active) setError("Impossible de charger l’atelier. Réessaie dans un instant."); });
    return () => { active = false; };
  }, [attempt]);
  React.useEffect(() => { if (optionsRef.current) optionsRef.current.scrollTop = 0; }, [category]);

  const change = values => { if (!savingRef.current && !purchasing) setDraft(previous => normalizeAvatar({ ...previous, ...values, ...(Object.hasOwn(values, "auras") ? { weeklyAura: undefined } : {}), ...(Object.hasOwn(values, "eyes") && !hasAvatarEyelids(values.eyes) ? { lashes: "", openness: 1 } : {}) }, catalog)); };
  const lashesUnavailable = (inventory && !hasUnlockedAvatarEyes(inventory)) || !hasAvatarEyelids(draft.eyes);
  const locked = baseChosen && catalog && inventory ? getLockedAvatarParts(draft, catalog, inventory) : [];
  const plan = getAvatarPurchasePlan(draft, catalog, inventory);
  const wearable = baseChosen && catalog && inventory ? getOwnedAvatarAppearance(draft, initialValue, catalog, inventory) : draft;
  const selectPart = (family, part, toggle = true) => {
    if (savingRef.current || purchasing) return;
    if (family === "lashes" && lashesUnavailable) return;
    change({ [family]: selectAvatarPart(draft, family, part.id, { toggle })[family] });
    if (family === "base") setBaseChosen(true);
  };
  const openUnlock = (family, part) => {
    if (savingRef.current || purchasing) return;
    if (inventory && !isAvatarPartUnlocked(inventory, family, part.id, part)) {
      selectPart(family, part, false);
      setSelection({ family, part, rule: getAvatarUnlockRule(family, part.id, part) });
    }
  };
  const purchase = async items => {
    if (savingRef.current) return;
    savingRef.current = true;
    setPurchasing(true); setError("");
    try { return await onPurchase(items); }
    finally { savingRef.current = false; if (mountedRef.current) setPurchasing(false); }
  };
  const refund = async token => {
    if (savingRef.current) return;
    savingRef.current = true;
    setPurchasing(true); setError("");
    try {
      await onRefund(token);
      if (mountedRef.current) {
        setDraft(createBlankAvatar()); setBaseChosen(false); setCategory("base");
        setSelection(null); setCheckout(false); setRefundOpen(false);
        setResolution(null); setConflict(false);
      }
    } finally { savingRef.current = false; if (mountedRef.current) setPurchasing(false); }
  };
  const onResolved = React.useCallback((result, input) => {
    setResolution({ input, limits: result.limits, incompatible: result.incompatible });
    setDraft(previous => {
      if (previous !== input) return previous;
      const changed = ALL_AVATAR_SLIDERS.some(control => result.state[control.key] !== previous[control.key]);
      return changed ? normalizeAvatar({ ...previous, ...result.state }, catalog) : previous;
    });
  }, [catalog]);
  const apply = async (avatar, items = []) => {
    if (savingRef.current || !baseChosen || !avatar) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    let acquired = false;
    try {
      if (items.length) { await onPurchase(items); acquired = true; }
      await onSave(avatar); if (mountedRef.current) onClose();
    }
    catch (e) {
      if (mountedRef.current) { setError(e.message); setConflict(e.code === "avatar_conflict"); }
      if (acquired) throw Object.assign(new Error(`Les pièces achetées restent à toi. L’avatar n’est pas encore enregistré. ${e.message}`), { code: e.code });
      throw e;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };
  const save = () => {
    if (locked.length) setCheckout(true);
    else void apply(draft).catch(() => {});
  };
  const parts = getAvatarChoices(catalog, category, draft.base);
  const categoryLabel = CATEGORIES.find(([key]) => key === category)?.[1];
  const selectedIds = getAvatarPartIds(draft, category);

  if (maintenanceMode) return <AvatarMaintenanceNotice onClose={onClose} hasDraft />;

  return <div className="avatar-editor">
    <header className="player-profile-toolbar avatar-editor-toolbar">
      <div className="avatar-editor-title"><span className="profile-eyebrow">À toi de jouer</span><h2 id="player-profile-title">Crée ton avatar</h2></div>
      <div className="avatar-editor-header-actions">{inventory ? <GobblarsBalance balance={inventory.balance} /> : null}<AvatarCloseButton onClick={onClose} disabled={purchasing || saving} /></div>
    </header>
    <div className="avatar-editor-body">
      <aside className="avatar-editor-preview">
        <div className="avatar-preview-frame">{baseChosen ? <AvatarPortrait value={draft} size={300} view="portrait" nickname={nickname} label={`Aperçu de l’avatar de ${nickname}`} onResolved={onResolved} /> : <div className="avatar-start-placeholder"><svg viewBox="0 0 120 120" aria-hidden="true"><path d="M38 53V36c0-30 44-30 44 0v17c0 33-44 33-44 0ZM17 111c0-34 86-34 86 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg><strong>À toi de créer ton avatar</strong><span>Commence par choisir Homme ou Femme.</span></div>}</div>
        <div className="avatar-preview-caption"><strong>{nickname}</strong><span>Un visage pour tes prochaines victoires.</span>
        </div>
      </aside>
      <div className="avatar-editor-customize">
        {baseChosen ? <nav className="avatar-categories" aria-label="Catégories de l’avatar" {...categoryDrag}>
          {CATEGORIES.filter(([key]) => key !== "facialhair" || draft.base === "homme").map(([key, label, icon]) =>
            <button type="button" key={key} aria-pressed={category === key} onClick={() => setCategory(key)}><AvatarCategoryIcon category={key} fallback={icon} />{label}</button>
          )}
        </nav> : null}
        <section ref={optionsRef} className="avatar-options" aria-label={categoryLabel} tabIndex={0} {...optionsDrag}>
          {!catalog ? <p role="status">{error || "Ouverture de l’atelier…"}{error ? <button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button> : null}</p> : <>
            <div className="avatar-options-heading"><h3>{baseChosen ? categoryLabel : "Choisis ton visage"}</h3></div>
            {inventory ? <p className="avatar-editor-note">{!baseChosen ? "Homme ou Femme : 500 gobblars. Ajoute ensuite les pièces de ton choix." : "Compose ton aperçu librement. Achète une pièce pour la porter aussitôt, ou utilise Acheter et porter en bas pour valider l’ensemble."}</p> : null}
            {baseChosen && category !== "base" ? <AvatarEditorControls category={category} draft={draft} limits={resolution?.limits} incompatible={resolution?.incompatible} onChange={change} /> : null}
            {category === "base" ? <AvatarFaceOptions draft={draft} baseChosen={baseChosen} inventory={inventory} disabled={saving || purchasing}
              onSelectBase={part => selectPart("base", part)} onUnlock={part => openUnlock("base", part)} onChange={change} /> : <>
              {category === "auras" ? <p className="avatar-editor-note">Or, argent, bronze : le podium de la course hebdo débloque son aura jusqu’au lundi suivant à 00 h, heure de Paris. L’aura des donateurs reste acquise.</p> : null}
              {category === "accessories" ? <p className="avatar-editor-note">Tu peux porter plusieurs accessoires ensemble. Touche un accessoire pour l’ajouter ou le retirer ; « Aucun » les retire tous.</p> : null}
              {category === "lashes" && lashesUnavailable ? <p className="avatar-editor-note">Débloque des yeux, puis choisis un modèle avec paupières pour ajouter des cils.</p> : null}
              <div className={`avatar-parts avatar-parts-${category}`}>
                {OPTIONAL.has(category) ? <button type="button" className="avatar-choice avatar-choice-preview" data-selected={!selectedIds.length} aria-pressed={!selectedIds.length} onClick={() => change({ [category]: "" })}><span className="avatar-part-empty" aria-hidden="true">∅</span><span>{category === "clothes" ? "Tenue d’origine" : "Aucun"}</span></button> : null}
                {parts.map(part => <div key={part.id} className="avatar-choice" data-selected={selectedIds.includes(part.id)}>
                  <button type="button" className="avatar-choice-preview" disabled={category === "lashes" && lashesUnavailable} aria-pressed={selectedIds.includes(part.id)} onClick={() => selectPart(category, part)} title={part.unlock?.label}>
                    <AvatarPartThumbnail part={part} nickname={nickname} />
                    <span>{part.label.replace(/ — Base neutre$| · (Femme|Homme)$/g, "")}</span>
                    {selectedIds.includes(part.id) ? <i aria-hidden="true">✓</i> : null}
                  </button>
                  <AvatarUnlockBadge inventory={inventory} family={category} id={part.id} part={part} disabled={saving || purchasing} onActivate={() => openUnlock(category, part)} />
                </div>)}
              </div>
            </>}
          </>}
        </section>
      </div>
    </div>
    <footer className="avatar-editor-footer" aria-busy={saving}>
      {error || conflict ? <div>{error && catalog ? <p role="alert">{error}</p> : null}{conflict ? <button type="button" onClick={onReload}>Abandonner ce brouillon et recharger</button> : null}</div> : null}
      {baseChosen && inventory && locked.length ? <p className="avatar-checkout-summary">{plan.purchasable.length} pièce(s) à acheter · {plan.total.toLocaleString("fr-FR")} gobblars{plan.missing > 0 ? ` · Il manque ${plan.missing.toLocaleString("fr-FR")}` : ""}{plan.unavailable.length ? ` · ${plan.unavailable.length} élément(s) soumis à une condition de déblocage` : ""}</p> : null}
      {inventory && onRefund ? <button type="button" className="avatar-refund" disabled={purchasing || saving} onClick={() => setRefundOpen(true)}>Rembourser tous mes achats…</button> : null}
      <button type="button" className="avatar-cancel" onClick={onClose} disabled={purchasing || saving}>Fermer l’essai</button>
      <button type="button" className="avatar-save" onClick={save} disabled={saving || purchasing || conflict || !catalog || !baseChosen || resolution?.input !== draft || resolution?.incompatible}>{saving ? "Enregistrement…" : locked.length ? "Acheter et porter…" : "Porter cet avatar"} <span aria-hidden="true">✓</span></button>
    </footer>
    {selection ? <AvatarAssetDialog selection={selection} inventory={inventory} nickname={nickname} busy={purchasing || saving} onPurchase={purchase}
      onWear={() => apply(wearable)} canWear={!!wearable && !conflict} otherTrials={locked.length}
      onCheckout={() => { setSelection(null); setCheckout(true); }} onClose={() => setSelection(null)} /> : null}
    {checkout ? <AvatarCheckoutDialog plan={plan} inventory={inventory} busy={purchasing || saving}
      onConfirm={() => { if (conflict) throw new Error("Recharge ton avatar avant de réessayer."); return apply(draft, plan.purchasable.map(({ family, id }) => ({ family, id }))); }}
      onRemoveUnavailable={() => change(removeAvatarParts(draft, plan.unavailable))} onClose={() => setCheckout(false)} /> : null}
    {refundOpen ? <AvatarRefundDialog onQuote={onRefundQuote} onConfirm={refund} busy={purchasing || saving} onClose={() => setRefundOpen(false)} /> : null}
  </div>;
}
