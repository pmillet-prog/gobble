import React from "react";
import AvatarEditor from "./AvatarEditor.jsx";
import { accountAvatarStore } from "./accountAvatarStore.js";
import { avatarApiError } from "./avatarApi.js";
import { requestAvatarInventory, purchaseAvatarItems, requestAvatarRefundQuote } from "./avatarInventoryApi.js";
import { showGobblarsSpent } from "../notifications/showGobblarsSpent.js";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { AVATAR_OBJECTIVES } from "../../../shared/avatarObjectives.js";
import { weeklyAuraStore } from "./weeklyAuraStore.js";
import useAvatarInventoryExpiry from "./useAvatarInventoryExpiry.js";
import AvatarMaintenanceNotice from "./AvatarMaintenanceNotice.jsx";

export default function AccountAvatarEditor({ userId, nickname, onClose, maintenanceMode = false }) {
  const preferences = useFeatureRuntime("preferences");
  const notifications = useFeatureRuntime("notifications");
  const [loaded, setLoaded] = React.useState(null);
  const [inventory, setInventory] = React.useState(null);
  useAvatarInventoryExpiry(inventory?.temporary, setInventory);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => accountAvatarStore.subscribeRewards(payload => {
    if (payload.userId !== Number(userId)) return;
    setInventory(current => {
      if (!current) return current;
      const next = { ...current, owned: { ...current.owned } };
      for (const reward of payload.rewards) {
        const objective = AVATAR_OBJECTIVES[reward.objective];
        if (reward.expiresAt) next.temporary = { [`${reward.family}:${reward.id}`]: reward.expiresAt };
        else next.owned[reward.key] = true;
        if (objective) next[objective.stat] = Math.max(next[objective.stat] || 0, objective.target);
      }
      return next;
    });
  }), [userId]);
  React.useEffect(() => weeklyAuraStore.subscribe(() => {
    const weekly = weeklyAuraStore.getSnapshot();
    setInventory(current => current ? { ...current, temporary: weekly.grants[userId] ? { [`auras:${weekly.grants[userId]}`]: weekly.expiresAt } : {} } : current);
  }), [userId]);
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const acceptInventory = React.useCallback(value => {
    if (accountAvatarStore.getSnapshot().userId !== Number(userId)) throw avatarApiError("avatar_account_changed");
    if (mounted.current) setInventory(value);
    preferences.refs.gobblarsKnownBalanceRef.current = value.balance;
    preferences.set("gobblarsBalance", value.balance);
  }, [preferences, userId]);
  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoaded(null);
    setError("");
    Promise.all([accountAvatarStore.refresh(), requestAvatarInventory(userId, { signal: controller.signal })]).then(([value, owned]) => {
      if (value.userId !== Number(userId)) throw avatarApiError("avatar_account_changed");
      if (active) { acceptInventory(owned); setLoaded(value); }
    }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; controller.abort(); };
  }, [userId, attempt, acceptInventory]);
  const purchase = async items => {
    try {
      const result = await purchaseAvatarItems(userId, items);
      acceptInventory(result.inventory);
      showGobblarsSpent(notifications.show, { spent: result.spent, balance: result.inventory.balance }, "Achat d’avatar");
      return result.inventory;
    }
    catch (reason) { if (reason.inventory?.userId === Number(userId)) acceptInventory(reason.inventory); throw reason; }
  };
  const refund = async token => {
    const result = await accountAvatarStore.refundPurchases(Number(userId), token);
    acceptInventory(result.inventory);
    if (mounted.current) setLoaded(result.avatarSnapshot);
    notifications.show("", 0, { gobblarsReward: { amount: result.refunded,
      balance: result.inventory.balance, label: "Achats d’avatar remboursés" } });
    return result;
  };
  const reload = () => { setLoaded(null); setAttempt(value => value + 1); };
  if (maintenanceMode && !loaded) return <AvatarMaintenanceNotice onClose={onClose} />;
  if (!loaded || loaded.userId !== Number(userId)) return <div className="profile-editor-loading">
    <h2 id="player-profile-title">Ton avatar</h2>
    {error ? <><p role="alert">{error}</p><button type="button" onClick={reload}>Réessayer</button></> : <p role="status">Récupération de ton avatar…</p>}
    <button type="button" onClick={onClose}>Revenir au profil</button>
  </div>;
  return <AvatarEditor key={`${userId}:${attempt}`} initialValue={loaded.avatar} nickname={nickname} onClose={onClose}
    inventory={inventory} onPurchase={purchase} maintenanceMode={maintenanceMode}
    onRefundQuote={options => requestAvatarRefundQuote(userId, options)} onRefund={refund}
    onReload={reload} onSave={avatar => accountAvatarStore.save(Number(userId), avatar, loaded.revision)} />;
}
