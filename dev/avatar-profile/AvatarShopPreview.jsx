import React from "react";
import AvatarEditor from "../../src/features/avatar/AvatarEditor.jsx";
import { avatarUnlockKey, getAvatarUnlockRule, isAvatarPartUnlocked } from "../../shared/avatarUnlocks.js";

export default function AvatarShopPreview({ avatar, onSave, onClose, wins = 0, startingBalance = 25000 }) {
  const [inventory, setInventory] = React.useState({ userId: 987654322, balance: startingBalance, owned: {}, miniTournamentWins: wins });
  const receipts = React.useRef({ amount: 0, keys: [], token: 0 });
  const quote = async () => ({ amount: receipts.current.amount, itemCount: receipts.current.keys.length, token: String(receipts.current.token) });
  const purchase = async items => {
    const missing = items.filter(({ family, id }) => !isAvatarPartUnlocked(inventory, family, id));
    const spent = missing.reduce((sum, { family, id }) => sum + (getAvatarUnlockRule(family, id).price || 0), 0);
    if (spent > inventory.balance) throw new Error("Pas assez de gobblars de démonstration.");
    const keys = missing.map(({ family, id }) => avatarUnlockKey(family, id));
    receipts.current = { amount: receipts.current.amount + spent, keys: [...receipts.current.keys, ...keys], token: receipts.current.token + 1 };
    const next = { ...inventory, balance: inventory.balance - spent,
      owned: { ...inventory.owned, ...Object.fromEntries(keys.map(key => [key, true])) } };
    setInventory(next);
    return next;
  };
  const refund = async token => {
    if (token !== String(receipts.current.token) || !receipts.current.amount) throw new Error("La liste des achats fictifs a changé.");
    const receipt = receipts.current;
    setInventory(current => ({ ...current, balance: current.balance + receipt.amount,
      owned: Object.fromEntries(Object.entries(current.owned).filter(([key]) => !receipt.keys.includes(key))) }));
    await onSave(null);
    receipts.current = { amount: 0, keys: [], token: receipts.current.token + 1 };
  };
  return <div className="player-profile-overlay"><div className="player-profile-backdrop" onClick={onClose} /><div className="player-profile-dialog player-profile-dialog-editor">
    <AvatarEditor initialValue={avatar} nickname="Tigre · test boutique" inventory={inventory} onPurchase={purchase}
      onRefundQuote={quote} onRefund={refund} onSave={onSave} onClose={onClose} />
  </div></div>;
}
