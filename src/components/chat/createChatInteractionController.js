import { normalizeInstallId } from "../../app/adapters/browserIdentity.js";
import { getDefaultRoomId } from "../../app/adapters/deviceCapabilities.js";
import { isSystemChatMessage } from "../../utils/chatMessages.js";
import { ACCOUNT_SEEN_MARKERS } from "../../utils/accountSeenMarkers.js";

const CHAT_DRAWER_ANIM_MS = 420;

function intersectViewportRects(a, b) {
  if (!a || !b) return null;
  const left = Math.max(Number(a.left) || 0, Number(b.left) || 0);
  const top = Math.max(Number(a.top) || 0, Number(b.top) || 0);
  const right = Math.min(Number(a.right) || 0, Number(b.right) || 0);
  const bottom = Math.min(Number(a.bottom) || 0, Number(b.bottom) || 0);
  if (!(right > left && bottom > top)) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function getVisibleChatElementRect(element) {
  if (typeof window === "undefined" || !(element instanceof HTMLElement)) return null;
  const rawRect = element.getBoundingClientRect();
  if (!(rawRect.width > 0 && rawRect.height > 0)) return null;
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity || "1") === 0
  ) {
    return null;
  }
  let clipRect = {
    left: 0,
    top: 0,
    right: window.innerWidth || 0,
    bottom: window.innerHeight || 0,
  };
  let current = element;
  while (current && current instanceof HTMLElement) {
    const currentStyle = window.getComputedStyle(current);
    const overflowValue = `${currentStyle.overflow} ${currentStyle.overflowX} ${currentStyle.overflowY}`;
    if (/(auto|scroll|hidden|clip)/.test(overflowValue)) {
      clipRect = intersectViewportRects(clipRect, current.getBoundingClientRect());
      if (!clipRect) return null;
    }
    current = current.parentElement;
  }
  return intersectViewportRects(rawRect, clipRect);
}

function findVisibleChatMessageToastOrigin(messageId) {
  if (typeof document === "undefined") return null;
  const safeMessageId = typeof messageId === "string" ? messageId.trim() : "";
  if (!safeMessageId) return null;
  const candidates = Array.from(document.querySelectorAll("[data-chat-message-id]")).filter(
    (node) => node instanceof HTMLElement && node.dataset.chatMessageId === safeMessageId
  );
  let bestRect = null;
  let bestArea = 0;
  for (const element of candidates) {
    const visibleRect = getVisibleChatElementRect(element);
    if (!visibleRect) continue;
    const area = visibleRect.width * visibleRect.height;
    if (area <= bestArea) continue;
    bestArea = area;
    bestRect = visibleRect;
  }
  if (!bestRect) return null;
  return {
    kind: "message",
    x: Math.round(bestRect.left + bestRect.width / 2),
    y: Math.round(bestRect.bottom - Math.min(12, bestRect.height * 0.35)),
  };
}

function findChatLauncherToastOrigin() {
  if (typeof document === "undefined") return null;
  const launcher = document.querySelector("[data-chat-launcher-button='true']");
  if (!(launcher instanceof HTMLElement)) return null;
  const visibleRect = getVisibleChatElementRect(launcher);
  if (!visibleRect) return null;
  return {
    kind: "launcher",
    x: Math.round(visibleRect.left + visibleRect.width / 2),
    y: Math.round(visibleRect.top + visibleRect.height / 2),
  };
}

function buildBottomChatToastOrigin() {
  if (typeof window === "undefined") {
    return { kind: "bottom", x: 160, y: 580 };
  }
  return {
    kind: "bottom",
    x: Math.round((window.innerWidth || 320) / 2),
    y: Math.round((window.innerHeight || 640) - 28),
  };
}

export function createChatInteractionController(runtime) {
  const [
    chatBaselineHeightRef,
    chatBodyLockHeightRef,
    setChatViewportHeight,
    chatCloseTimerRef,
    chatInputRef,
    isChatOpenMobileRef,
    isChatClosingRef,
    suppressChatResizeRef,
    lastKeyboardInsetRef,
    chatDrawerSessionCalibrationRef,
    chatDrawerCalibrationRef,
    gameViewportFreezeHeightRef,
    setChatOpenedAtMs,
    setIsChatClosing,
    setIsChatOpenMobile,
    setActiveArea,
    setChatTab,
    setMobileChatUnreadCount,
    setMobileChatBotUnreadCount,
    isChatOpenMobile,
    isLoggedInRef,
    roomIdRef,
    socket,
    setConnectionError,
    connectSocketWithAuth,
    isAccountAuthenticated,
    accountSeenReady,
    showToast,
    chatRulesAccepted,
    setIsChatRulesOpen,
    chatFeature,
    isMobileLayoutRef,
    setHomeChatUnreadCount,
    setHomeChatBotUnreadCount,
    isMobileLayout,
    setIsHomeChatOpen,
    markAccountSeen,
    setUserMenu,
    setDesktopChatReactionPicker,
    desktopReactionDetailsCloseTimerRef,
    setDesktopChatReactionDetails,
    normalizeUserIdForProfile,
    installId,
    setReportDialog,
    reportDialog,
    setChatRulesAccepted,
    lobbyChatSubscriptionRef,
  ] = runtime;

function captureChatViewportBaseline() {
  if (typeof window === "undefined") return;
  const baseHeight = Math.round(
    window.innerHeight || document.documentElement?.clientHeight || 0
  );
  if (baseHeight > 0) {
    chatBaselineHeightRef.current = baseHeight;
    chatBodyLockHeightRef.current = baseHeight;
    setChatViewportHeight((prev) => (prev === baseHeight ? prev : baseHeight));
  }
}

function resetMobileChatPanelImmediately({ preserveInputFocus = false } = {}) {
  if (chatCloseTimerRef.current) {
    clearTimeout(chatCloseTimerRef.current);
    chatCloseTimerRef.current = null;
  }
  if (!preserveInputFocus && chatInputRef.current) {
    try {
      chatInputRef.current.blur();
    } catch (_) {}
  }
  isChatOpenMobileRef.current = false;
  isChatClosingRef.current = false;
  suppressChatResizeRef.current = false;
  lastKeyboardInsetRef.current = 0;
  chatBaselineHeightRef.current = 0;
  chatDrawerSessionCalibrationRef.current = chatDrawerCalibrationRef.current;
  chatBodyLockHeightRef.current = 0;
  gameViewportFreezeHeightRef.current = 0;
  setChatOpenedAtMs(0);
  setIsChatClosing(false);
  setIsChatOpenMobile(false);
  setActiveArea("game");
}

function openChatPanel() {
  if (chatCloseTimerRef.current) {
    clearTimeout(chatCloseTimerRef.current);
    chatCloseTimerRef.current = null;
  }
  suppressChatResizeRef.current = false;
  isChatClosingRef.current = false;
  isChatOpenMobileRef.current = true;
  setIsChatClosing(false);
  setChatTab("messages");
  setMobileChatUnreadCount(0);
  setMobileChatBotUnreadCount(0);
  chatDrawerSessionCalibrationRef.current = chatDrawerCalibrationRef.current;
  captureChatViewportBaseline();

  // Figer la hauteur du jeu (layout viewport) pour que le fond ne "réponde" pas au clavier.
  if (typeof window !== "undefined") {
    const candidates = [
      window.innerHeight,
      typeof document !== "undefined" ? document.documentElement?.clientHeight : null,
    ].filter((v) => Number.isFinite(v) && v > 0);
    const h = candidates.length ? Math.max(...candidates) : 0;
    if (h > 0) gameViewportFreezeHeightRef.current = Math.round(h);
  }

  setChatOpenedAtMs(Date.now());
  setIsChatOpenMobile(true);
}

function closeChatPanel() {
  if (!isChatOpenMobile) return;
  if (chatCloseTimerRef.current) {
    clearTimeout(chatCloseTimerRef.current);
  }
  suppressChatResizeRef.current = true;
  setIsChatClosing(true);
  if (chatInputRef.current) {
    try {
      chatInputRef.current.blur();
    } catch (_) {}
  }
  setChatTab("messages");
  setChatOpenedAtMs(0);
  chatBaselineHeightRef.current = 0;
  chatDrawerSessionCalibrationRef.current = chatDrawerCalibrationRef.current;
  chatBodyLockHeightRef.current = 0;
  gameViewportFreezeHeightRef.current = 0;
  chatCloseTimerRef.current = window.setTimeout(() => {
    setIsChatOpenMobile(false);
    setIsChatClosing(false);
    suppressChatResizeRef.current = false;
    lastKeyboardInsetRef.current = 0;
    chatCloseTimerRef.current = null;
  }, CHAT_DRAWER_ANIM_MS);
}

function subscribeLobbyChat({ force = false } = {}) {
  if (isLoggedInRef.current) return;
  const roomToUse = roomIdRef.current || getDefaultRoomId();
  if (!roomToUse) return;
  const state = lobbyChatSubscriptionRef.current;

  const runSubscribe = () => {
    if (!force && state.subscribed && state.roomId === roomToUse) return;
    if (state.inFlight) return;
    state.inFlight = true;
    socket.emit("chat:subscribe", { roomId: roomToUse }, (res) => {
      state.inFlight = false;
      if (res?.ok) {
        state.subscribed = true;
        state.roomId = res.roomId || roomToUse;
        setConnectionError("");
      } else {
        state.subscribed = false;
        state.roomId = null;
      }
    });
  };

  if (socket.connected) {
    runSubscribe();
    return;
  }
  if (state.connectPending) return;
  state.connectPending = true;
  const onConnect = () => {
    socket.off("connect_error", onError);
    state.connectPending = false;
    runSubscribe();
  };
  const onError = () => {
    socket.off("connect", onConnect);
    state.connectPending = false;
  };
  socket.once("connect", onConnect);
  socket.once("connect_error", onError);
  void connectSocketWithAuth();
}

function requestOpenChat() {
  if (isAccountAuthenticated && !accountSeenReady) {
    showToast("Synchronisation du compte en cours…", 1800);
    return;
  }
  openChatPanel();
  if (!isLoggedInRef.current) {
    subscribeLobbyChat();
  }
  if (!chatRulesAccepted) {
    setIsChatRulesOpen(true);
  }
}

function clearMobileChatReactionToasts() {
  chatFeature.clearReactionToasts();
}

function enqueueMobileChatReactionToast(emoji, { messageId = "", actorNick = "" } = {}) {
  const safeEmoji = typeof emoji === "string" ? emoji.trim() : "";
  if (!safeEmoji) return;
  const safeActorNick = typeof actorNick === "string" ? actorNick.trim() : "";
  let origin = null;
  if (isMobileLayoutRef.current && !isChatOpenMobileRef.current && !isChatClosingRef.current) {
    origin = findChatLauncherToastOrigin();
  }
  if (!origin) {
    origin = findVisibleChatMessageToastOrigin(messageId);
  }
  if (!origin) {
    origin = buildBottomChatToastOrigin();
  }
  chatFeature.enqueueReactionToast({
    actorNick: safeActorNick,
    emoji: safeEmoji,
    ...origin,
  });
}

function openHomeChat() {
  setHomeChatUnreadCount(0);
  setHomeChatBotUnreadCount(0);
  if (isMobileLayout) {
    requestOpenChat();
    return;
  }
  if (!isLoggedInRef.current) {
    subscribeLobbyChat();
  }
  setIsHomeChatOpen(true);
}

function closeHomeChat() {
  setChatTab("messages");
  setIsHomeChatOpen(false);
}

function confirmChatRules() {
  markAccountSeen(ACCOUNT_SEEN_MARKERS.chatRules);
  setChatRulesAccepted(true);
  setIsChatRulesOpen(false);
}

function cancelChatRules() {
  setIsChatRulesOpen(false);
}

function closeUserMenu() {
  setUserMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
}

function closeDesktopChatReactionPicker() {
  setDesktopChatReactionPicker((prev) => (prev.open ? { ...prev, open: false } : prev));
}

function clearDesktopReactionDetailsCloseTimer() {
  if (desktopReactionDetailsCloseTimerRef.current) {
    clearTimeout(desktopReactionDetailsCloseTimerRef.current);
    desktopReactionDetailsCloseTimerRef.current = null;
  }
}

function closeDesktopChatReactionDetails() {
  clearDesktopReactionDetailsCloseTimer();
  setDesktopChatReactionDetails((prev) => (prev.open ? { ...prev, open: false } : prev));
}

function scheduleCloseDesktopChatReactionDetails(delayMs = 130) {
  clearDesktopReactionDetailsCloseTimer();
  desktopReactionDetailsCloseTimerRef.current = setTimeout(() => {
    desktopReactionDetailsCloseTimerRef.current = null;
    setDesktopChatReactionDetails((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, Math.max(0, Number(delayMs) || 0));
}

function openDesktopChatReactionDetails(e, message, reactionEntry) {
  if (!message || typeof message !== "object") return;
  if (isSystemChatMessage(message)) return;
  const users = Array.isArray(reactionEntry?.users) ? reactionEntry.users : [];
  if (!users.length) return;
  const emoji = typeof reactionEntry?.emoji === "string" ? reactionEntry.emoji.trim() : "";
  if (!emoji) return;
  if (e?.stopPropagation) e.stopPropagation();
  clearDesktopReactionDetailsCloseTimer();
  const messageId = typeof message.id === "string" ? message.id.trim() : "";
  const rect = e?.currentTarget?.getBoundingClientRect?.();
  const viewportWidth = window.innerWidth || 360;
  const viewportHeight = window.innerHeight || 640;
  const popupWidth = 230;
  const popupHeight = Math.min(260, 66 + users.length * 30);
  const padding = 8;
  const anchorX =
    Number.isFinite(rect?.left) && Number.isFinite(rect?.width)
      ? rect.left + rect.width / 2
      : Number(e?.clientX) || padding;
  const anchorTop =
    Number.isFinite(rect?.top) ? rect.top : Number(e?.clientY) || padding;
  const anchorBottom =
    Number.isFinite(rect?.bottom) ? rect.bottom : anchorTop + 18;
  const left = Math.min(
    Math.max(padding, Math.round(anchorX - popupWidth / 2)),
    Math.max(padding, viewportWidth - popupWidth - padding)
  );
  const preferredTop = Math.round(anchorTop - popupHeight - 10);
  const top =
    preferredTop >= padding
      ? preferredTop
      : Math.min(
          Math.max(padding, Math.round(anchorBottom + 8)),
          Math.max(padding, viewportHeight - popupHeight - padding)
        );
  setDesktopChatReactionDetails({
    open: true,
    left,
    top,
    messageId,
    emoji,
    users,
  });
}

function openDesktopChatReactionPicker(e, message) {
  if (!message || typeof message !== "object") return;
  if (isSystemChatMessage(message)) return;
  if (e?.preventDefault) e.preventDefault();
  if (e?.stopPropagation) e.stopPropagation();
  closeDesktopChatReactionDetails();
  const messageId = typeof message.id === "string" ? message.id.trim() : "";
  if (!messageId) return;
  const rect = e?.currentTarget?.getBoundingClientRect?.();
  const viewportWidth = window.innerWidth || 360;
  const viewportHeight = window.innerHeight || 640;
  const pickerWidth = 274;
  const pickerHeight = 52;
  const padding = 8;
  const anchorX =
    Number.isFinite(rect?.left) && Number.isFinite(rect?.width)
      ? rect.left + rect.width / 2
      : Number(e?.clientX) || padding;
  const anchorY =
    Number.isFinite(rect?.top) && Number.isFinite(rect?.height)
      ? rect.top
      : Number(e?.clientY) || padding;
  const left = Math.min(
    Math.max(padding, Math.round(anchorX - pickerWidth / 2)),
    Math.max(padding, viewportWidth - pickerWidth - padding)
  );
  const top = Math.min(
    Math.max(padding, Math.round(anchorY - pickerHeight - 10)),
    Math.max(padding, viewportHeight - pickerHeight - padding)
  );
  setDesktopChatReactionPicker({
    open: true,
    left,
    top,
    messageId,
  });
}

function openUserMenu(e, { nick, userId: targetUserId = null, installId: targetInstallId, messageId = null }) {
  const key = normalizeInstallId(targetInstallId);
  if (!key || key === installId) return;
  if (key.startsWith("dev-bot:")) return;
  const profileUserId =
    normalizeUserIdForProfile(targetUserId) || normalizeUserIdForProfile(targetInstallId);
  if (e?.preventDefault) e.preventDefault();
  if (e?.stopPropagation) e.stopPropagation();
  const rect = e?.currentTarget?.getBoundingClientRect?.();
  const viewportWidth = window.innerWidth || 360;
  const viewportHeight = window.innerHeight || 640;
  const menuWidth = 180;
  const menuHeight = 154;
  const padding = 8;
  const anchorCenterX =
    Number.isFinite(rect?.left) && Number.isFinite(rect?.width)
      ? rect.left + rect.width / 2
      : padding;
  const anchorCenterY =
    Number.isFinite(rect?.top) && Number.isFinite(rect?.height)
      ? rect.top + rect.height / 2
      : padding;
  const baseLeft = anchorCenterX - menuWidth / 2;
  const baseTop = anchorCenterY - menuHeight / 2;
  let left = Math.min(
    Math.max(padding, Math.round(baseLeft)),
    Math.max(padding, viewportWidth - menuWidth - padding)
  );
  let top = Math.min(
    Math.max(padding, Math.round(baseTop)),
    Math.max(padding, viewportHeight - menuHeight - padding)
  );
  setUserMenu({
    open: true,
    left,
    top,
    nick: nick || "Joueur",
    userId: profileUserId,
    installId: key,
    messageId: messageId || null,
  });
}

function openReportDialog({ installId: targetInstallId, nick, messageId }) {
  const key = normalizeInstallId(targetInstallId);
  if (!key || key === installId) return;
  setReportDialog({
    open: true,
    reportedInstallId: key,
    reportedNick: nick || "",
    messageId: messageId || null,
    reason: "",
    details: "",
  });
}

function closeReportDialog() {
  setReportDialog((prev) =>
    prev.open
      ? {
          open: false,
          reportedInstallId: null,
          reportedNick: "",
          messageId: null,
          reason: "",
          details: "",
        }
      : prev
  );
}

function submitReport() {
  const targetId = normalizeInstallId(reportDialog.reportedInstallId);
  if (!targetId) return;
  const baseReason = String(reportDialog.reason || "").trim();
  const detail = String(reportDialog.details || "").trim();
  let reason = baseReason;
  if (baseReason === "Autre" && detail) {
    reason = `Autre: ${detail}`;
  }
  reason = reason.trim().slice(0, 160);
  if (!reason) return;
  if (!socket.connected) {
    showToast("Signalement non envoyé");
    closeReportDialog();
    return;
  }
  socket.emit(
    "reportMessage",
    {
      messageId: reportDialog.messageId || null,
      reportedInstallId: targetId,
      reason,
    },
    (res) => {
      if (res?.ok) {
        showToast("Signalement envoyé");
      } else {
        showToast("Signalement refusé");
      }
    }
  );
  closeReportDialog();
}


  return [
    captureChatViewportBaseline,
    resetMobileChatPanelImmediately,
    openChatPanel,
    closeChatPanel,
    subscribeLobbyChat,
    requestOpenChat,
    clearMobileChatReactionToasts,
    enqueueMobileChatReactionToast,
    openHomeChat,
    closeHomeChat,
    confirmChatRules,
    cancelChatRules,
    closeUserMenu,
    closeDesktopChatReactionPicker,
    clearDesktopReactionDetailsCloseTimer,
    closeDesktopChatReactionDetails,
    scheduleCloseDesktopChatReactionDetails,
    openDesktopChatReactionDetails,
    openDesktopChatReactionPicker,
    openUserMenu,
    openReportDialog,
    closeReportDialog,
    submitReport,
  ];
}
