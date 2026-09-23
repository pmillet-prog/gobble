import React from "react";
import { AVATAR_SKINS } from "../../../shared/avatarSkins.js";
import { DEFAULT_AVATAR } from "./avatarState.js";
import AvatarPortrait from "./AvatarPortrait.jsx";
import AvatarEditorControls from "./AvatarEditorControls.jsx";
import AvatarUnlockBadge from "./AvatarUnlockBadge.jsx";

const BASES = [{ id: "homme", label: "Homme", symbol: "♂" }, { id: "femme", label: "Femme", symbol: "♀" }];
const SkinPreview = React.memo(function SkinPreview({ base, tone, customColor, skinStyle, silhouetteWidth }) {
  const value = React.useMemo(() => ({ ...DEFAULT_AVATAR, base, tone, customColor, skinStyle, silhouetteWidth,
    hair: "", headwear: "", glasses: "", accessories: [], auras: "", backdrops: "" }), [base, tone, customColor, skinStyle, silhouetteWidth]);
  return <AvatarPortrait value={value} size={112} view="face" label={`Aperçu ${AVATAR_SKINS.find(skin => skin.id === skinStyle).label}`} />;
});

export default function AvatarFaceOptions({ draft, baseChosen, inventory, disabled, onSelectBase, onUnlock, onChange }) {
  return <div className="avatar-face-options">
    <div className="avatar-base-choices avatar-face-models" role="group" aria-label="Modèle de visage">
      {BASES.map(part => <div key={part.id} className="avatar-choice" data-selected={baseChosen && draft.base === part.id}>
        <button type="button" className="avatar-choice-preview avatar-face-model" disabled={disabled}
          aria-pressed={baseChosen && draft.base === part.id} onClick={() => onSelectBase(part)}>
          <span className="avatar-sex-symbol" aria-hidden="true">{part.symbol}</span>
          <span>{part.label}</span><span className="avatar-model-switch" aria-hidden="true" />
        </button>
        <AvatarUnlockBadge inventory={inventory} family="base" id={part.id} part={part} disabled={disabled} onActivate={() => onUnlock(part)} />
      </div>)}
    </div>
    {baseChosen ? <fieldset className="avatar-face-details" disabled={disabled}>
      <legend className="sr-only">Personnaliser le visage</legend>
      <AvatarEditorControls category="silhouette" draft={draft} onChange={onChange} />
      <fieldset className="avatar-skin-options"><legend>Choisis ton visage</legend>
        <div className="avatar-skin-grid">{AVATAR_SKINS.map(skin => <button type="button" key={skin.id}
          className="avatar-skin-choice" aria-pressed={draft.skinStyle === skin.id}
          onClick={() => onChange({ skinStyle: skin.id })} title={skin.description}>
          <SkinPreview base={draft.base} tone={draft.tone} customColor={draft.customColor} skinStyle={skin.id} silhouetteWidth={draft.silhouetteWidth} />
          <span>{skin.label}{draft.skinStyle === skin.id ? <i aria-hidden="true"> ✓</i> : null}</span>
        </button>)}</div>
      </fieldset>
      <p className="avatar-editor-note">Tous ces visages sont inclus avec le modèle choisi.</p>
      <AvatarEditorControls category="base" draft={draft} onChange={onChange} />
    </fieldset> : null}
  </div>;
}
