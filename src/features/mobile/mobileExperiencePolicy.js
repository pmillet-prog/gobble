export function isMobileRoundActive({ enabled, view, phase, loggedIn }) {
  return !!enabled && phase === "playing" &&
    (view === "daily_play" || view === "training" || (view === "live" && loggedIn));
}

export function getMobileBackTargets(features, actions) {
  const targets = [];
  const add = (id, open, onBack) => { if (open && onBack) targets.push({ id, open: true, onBack }); };
  const overlays = features.overlays.store.getState();
  for (const field of ["settingsOpen", "accountMenuOpen", "aboutOpen", "helpOpen",
    "facebookInviteOpen", "supportOpen", "patchNotesOpen", "soundMenuOpen",
    "visualMenuOpen", "keyboardMenuOpen", "playersOverlayOpen"]) {
    add(field, overlays[field], actions[field] || (() => features.overlays.set(field, false)));
  }
  for (const field of ["playerProfileModal", "roundPlayerModal", "recordModal", "wordInfoModal", "definitionModal"]) {
    add(field, overlays[field]?.open, actions[field]);
  }
  add("auth", overlays.authModalMode, actions.auth);
  add("trainingConfirm", overlays.trainingConfirm, () => {
    if (!features.overlays.store.getState().trainingBusy) features.overlays.set("trainingConfirm", null);
  });
  add("theme", features.preferences.store.getState().themeMenuOpen, actions.theme);
  const chat = features.chat.store.getState();
  add("homeChat", chat.homeChatOpen, actions.homeChat);
  add("mobileChat", chat.mobileChatOpen, actions.mobileChat);
  add("chatRules", chat.rulesOpen, actions.chatRules);
  add("chatUserMenu", chat.userMenu?.open, actions.chatUserMenu);
  add("chatReport", chat.reportDialog?.open, actions.chatReport);
  add("dailyLaunch", features.daily.store.getState().launchDialog, actions.dailyLaunch);
  const duel = features.duel?.store.getState();
  add("duelRecap", duel?.weekRecapOpen, actions.duelRecap);
  add("duelPopup", duel?.popup?.mode, actions.duelPopup);
  add("vaultWord", overlays.vaultWordOfDayPopup?.open, actions.vaultWord);
  const admin = features.admin.store.getState();
  add("dev", admin.devMenuOpen, actions.dev);
  add("moderation", admin.moderationMenuOpen, actions.moderation);
  return targets;
}
