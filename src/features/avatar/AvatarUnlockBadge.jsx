import React from "react";
import { getAvatarUnlockRule, isAvatarPartUnlocked } from "../../../shared/avatarUnlocks.js";
import { AVATAR_OBJECTIVES, getAvatarObjectiveProgress } from "../../../shared/avatarObjectives.js";

export default function AvatarUnlockBadge({ inventory, family, id, part, onActivate, disabled = false }) {
  if (!inventory) return null;
  if (isAvatarPartUnlocked(inventory, family, id, part)) return <span className="avatar-unlock-badge avatar-unlock-owned">{inventory.temporary?.[`${family}:${id}`] ? "Cette semaine" : "Disponible"}</span>;
  const rule = getAvatarUnlockRule(family, id, part);
  if (rule.type === "prerequisite") return <span className="avatar-unlock-badge" title={rule.label}>Yeux requis</span>;
  const purchasable = rule.type === "gobblars";
  const price = purchasable ? rule.price.toLocaleString("fr-FR") : "";
  return <button type="button" className={`avatar-unlock-badge avatar-unlock-action ${purchasable ? "avatar-unlock-buy" : "avatar-unlock-goal"}`}
    title={rule.label} disabled={disabled} onClick={onActivate}
    aria-label={purchasable ? `Acheter ${part?.label || id} pour ${price} gobblars` : `Voir l’objectif pour ${part?.label || id}`}>
    {purchasable ? <><span className="avatar-unlock-buy-label">Acheter</span><span className={`avatar-unlock-price${rule.price >= 1000000 ? " avatar-unlock-price-long" : ""}`}>{price}<img src="/Gobblars.png" alt="" /></span></>
      : <><span className="avatar-unlock-buy-label">Objectif</span><span className="avatar-unlock-price"><span aria-hidden="true">{rule.objective === "donor" ? "♥" : "🏆"}</span>{rule.objective === "donor" ? "Donateur" : rule.objective === "weekly_race" ? `${rule.rank}${rule.rank === 1 ? "re" : "e"} place` : AVATAR_OBJECTIVES[rule.objective] ? `${Math.min(getAvatarObjectiveProgress(inventory, rule.objective), rule.required)}/${rule.required}` : "À venir"}</span></>}
  </button>;
}
