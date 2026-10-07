import React from "react";
import { createRoot } from "react-dom/client";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { createFeatureStore } from "../../src/app/core/createFeatureStore.js";
import { createOverlaysFeature } from "../../src/features/overlays/createOverlaysFeature.js";
import { accountAvatarStore } from "../../src/features/avatar/accountAvatarStore.js";
import { getAvatarUnlockRule, avatarUnlockKey } from "../../shared/avatarUnlocks.js";
import AccountMenu from "../../src/components/account/AccountMenu.jsx";
import PlayerProfileModalHost from "../../src/components/PlayerProfileModalHost.jsx";
import "../../src/index.css";

// Browser-only account server. No game backend or real wallet is contacted.
const userId = 987654329;
let avatar = null, revision = 0, failure = false;
const saves = [], purchases = [];
let inventory = { userId, balance: 25000, owned: {}, temporary: {} };
const realFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
  const url = String(input);
  if (!url.startsWith("/api/")) return realFetch(input, options);
  await new Promise(resolve => setTimeout(resolve, 100));
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  if (url.startsWith("/api/player-profile/")) return reply({ ok: true, profile: { userId, nick: "Test local", avatar } });
  if (url.startsWith("/api/auth/avatar/inventory")) return reply({ ok: true, inventory });
  if (url === "/api/auth/avatar/purchase") {
    const { items } = JSON.parse(options.body);
    purchases.push({ items, hadFace: !!avatar });
    if (!avatar) return reply({ ok: false, error: "avatar_invalid" }, 400);
    const spent = items.reduce((sum, part) => sum + getAvatarUnlockRule(part.family, part.id).price, 0);
    inventory = { ...inventory, balance: inventory.balance - spent, owned: { ...inventory.owned,
      ...Object.fromEntries(items.map(part => [avatarUnlockKey(part.family, part.id), true])) } };
    return reply({ ok: true, inventory, spent });
  }
  if (url.startsWith("/api/auth/avatar")) {
    if (options.method === "PUT") {
      const data = JSON.parse(options.body);
      if (failure) { failure = false; return reply({ ok: false, error: "avatar_unavailable" }, 503); }
      if (data.expectedRevision !== revision) return reply({ ok: false, error: "avatar_conflict" }, 409);
      avatar = data.avatar; revision++; saves.push(data);
    }
    return reply({ ok: true, userId, avatar, revision, unlocksRequired: true });
  }
  return reply({ ok: false }, 404);
};
accountAvatarStore.connect(userId);
const scope = { add() {} };
const overlays = createOverlaysFeature({ scope, ports: {} });
overlays.start();
const preferences = { store: createFeatureStore({ gobblarsBalance: 25000 }), refs: { gobblarsKnownBalanceRef: { current: 25000 } },
  set(key, value) { this.store.patch({ [key]: value }); } };
const features = { preferences, notifications: { show() {} }, accountAdmin: { store: createFeatureStore({ allowed: false }) } };
const kernel = { getState: () => ({}), subscribe: () => () => {}, features: { prepare: key => features[key], acquire: () => ({ release() {} }) } };
window.avatarFlowFixture = { snapshot: () => ({ avatar, revision, saves, purchases, inventory }), failNextSave: () => { failure = true; } };

function App() {
  const [menu, setMenu] = React.useState(true);
  const state = React.useSyncExternalStore(overlays.store.subscribe, overlays.store.getState).playerProfileModal;
  return <ApplicationRuntimeProvider kernel={kernel}>
    <button type="button" onClick={() => setMenu(true)}>Profil</button>
    {menu ? <AccountMenu auth={{ authenticated: true, userId, user: { usernameDisplay: "Test local" } }} labels={{}}
      appearance={{ shellClass: "bg-white text-slate-900", panelButtonClass: "border-slate-300", goldButtonClass: "bg-amber-200" }}
      actions={{ onClose: () => setMenu(false), onOpenProfile: overlays.openPlayerProfile }} /> : null}
    <PlayerProfileModalHost {...state} viewerUserId={userId} gobblarsBalance={inventory.balance} nickname="Test local" onClose={overlays.closePlayerProfile} />
  </ApplicationRuntimeProvider>;
}
createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
