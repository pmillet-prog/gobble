import React from "react";
import AvatarEditor from "../../src/features/avatar/AvatarEditor.jsx";
import { avatarUnlockKey, getAvatarUnlockRule, isAvatarPartUnlocked } from "../../shared/avatarUnlocks.js";

export default function AvatarShopPreview({ avatar, onSave, onClose, wins = 0, startingBalance = 25000 }) {
  const [inventory, setInventory] = React.useState({ userId: 987654322, balance: startingBalance, owned: {}, miniTournamentWins: wins });
  const purchase = async items => {
    const missing = items.filter(({ family, id }) => !isAvatarPartUnlocked(inventory, family, id));
    const spent = missing.reduce((sum, { family, id }) => sum + (getAvatarUnlockRule(family, id).price || 0), 0);
    if (spent > inventory.balance) throw new Error("Pas assez de gobblars de démonstration.");
    setInventory(current => ({ ...current, balance: current.balance - spent,
      owned: { ...current.owned, ...Object.fromEntries(missing.map(({ family, id }) => [avatarUnlockKey(family, id), true])) },
    }));
  };
  return <div className="player-profile-overlay"><div className="player-profile-backdrop" onClick={onClose} /><div className="player-profile-dialog player-profile-dialog-editor">
    <AvatarEditor initialValue={avatar} nickname="Tigre · test boutique" inventory={inventory} onPurchase={purchase} onSave={onSave} onClose={onClose} />
  </div></div>;
}
