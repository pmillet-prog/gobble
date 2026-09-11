import React from "react";

import { useLazyArrayController } from "../../app/react/useLazyController.js";
import { createChatInteractionController } from "../../components/chat/createChatInteractionController.js";

function createLobbyChatSubscriptionState() {
  return {
    roomId: null,
    subscribed: false,
    inFlight: false,
    connectPending: false,
  };
}

export function useChatInteractionResources({ isChatClosing }) {
  const chatCloseTimerRef = React.useRef(null);
  const chatInputRef = React.useRef(null);
  const chatRulesConfirmRef = React.useRef(null);
  const desktopReactionDetailsCloseTimerRef = React.useRef(null);
  const isChatClosingRef = React.useRef(isChatClosing);
  const isChatOpenMobileRef = React.useRef(false);
  const lobbyChatSubscriptionRef = React.useRef(createLobbyChatSubscriptionState());

  React.useEffect(() => {
    isChatClosingRef.current = isChatClosing;
  }, [isChatClosing]);

  return {
    chatCloseTimerRef,
    chatInputRef,
    chatRulesConfirmRef,
    desktopReactionDetailsCloseTimerRef,
    isChatClosingRef,
    isChatOpenMobileRef,
    lobbyChatSubscriptionRef,
  };
}

export default function useChatInteractionController({
  application,
  auth,
  chat,
  identity,
  layout,
  network,
  notifications,
  resources,
}) {
  const { isLoggedIn, isLoggedInRef } = application;
  const {
    accountSeenReady,
    isAccountAuthenticated,
    markAccountSeen,
  } = auth;
  const {
    actions: chatActions,
    feature: chatFeature,
    isClosing,
    isHomeOpen,
    isOpenMobile,
    reportDialog,
    rulesAccepted,
    rulesOpen,
    tab,
    userMenu,
  } = chat;
  const {
    setActiveArea,
    setChatOpenedAtMs,
    setChatRulesAccepted,
    setChatTab,
    setDesktopChatReactionDetails,
    setDesktopChatReactionPicker,
    setHomeChatBotUnreadCount,
    setHomeChatUnreadCount,
    setIsChatClosing,
    setIsChatOpenMobile,
    setIsChatRulesOpen,
    setIsDesktopEmojiPickerOpen,
    setIsHomeChatOpen,
    setMobileChatBotUnreadCount,
    setMobileChatUnreadCount,
    setReportDialog,
    setUserMenu,
  } = chatActions;
  const { installId, normalizeUserIdForProfile } = identity;
  const { isMobileLayout, isMobileLayoutRef } = layout;
  const { connectSocketWithAuth, roomIdRef, setConnectionError, socket } = network;
  const { showToast } = notifications;
  const {
    chatCloseTimerRef,
    chatInputRef,
    chatRulesConfirmRef,
    desktopReactionDetailsCloseTimerRef,
    isChatClosingRef,
    isChatOpenMobileRef,
    lobbyChatSubscriptionRef,
  } = resources;

  const [
    ,
    ,
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
  ] = useLazyArrayController(createChatInteractionController, [
    chatCloseTimerRef,
    chatInputRef,
    isChatOpenMobileRef,
    isChatClosingRef,
    setChatOpenedAtMs,
    setIsChatClosing,
    setIsChatOpenMobile,
    setActiveArea,
    setChatTab,
    setMobileChatUnreadCount,
    setMobileChatBotUnreadCount,
    isOpenMobile,
    isLoggedInRef,
    roomIdRef,
    socket,
    setConnectionError,
    connectSocketWithAuth,
    isAccountAuthenticated,
    accountSeenReady,
    showToast,
    rulesAccepted,
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
  ], 22);

  React.useEffect(() => {
    if (tab === "system") {
      setIsDesktopEmojiPickerOpen(false);
      setDesktopChatReactionPicker((prev) =>
        prev.open ? { ...prev, open: false } : prev
      );
      setDesktopChatReactionDetails((prev) =>
        prev.open ? { ...prev, open: false } : prev
      );
    }
  }, [tab]);

  React.useEffect(() => {
    isChatOpenMobileRef.current = isOpenMobile;

    if (!isMobileLayout) return;
    if (!isOpenMobile) {
      setActiveArea("game");
      return;
    }

    if (tab !== "system") {
      setMobileChatUnreadCount(0);
      setMobileChatBotUnreadCount(0);
    }
    setActiveArea("chat");
  }, [isOpenMobile, isMobileLayout, tab]);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    if (tab === "system") return;
    if (isMobileLayout && (!isOpenMobile || isClosing)) return;
    setMobileChatUnreadCount(0);
    setMobileChatBotUnreadCount(0);
  }, [isLoggedIn, tab, isMobileLayout, isOpenMobile, isClosing]);

  React.useEffect(() => {
    if (!rulesOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsChatRulesOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      chatRulesConfirmRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [rulesOpen]);

  React.useEffect(() => {
    if (!userMenu.open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeUserMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [userMenu.open]);

  React.useEffect(
    () => () => {
      if (desktopReactionDetailsCloseTimerRef.current) {
        clearTimeout(desktopReactionDetailsCloseTimerRef.current);
        desktopReactionDetailsCloseTimerRef.current = null;
      }
      clearMobileChatReactionToasts();
    },
    []
  );

  React.useEffect(() => {
    if (!isLoggedIn) return;
    setHomeChatUnreadCount(0);
    setHomeChatBotUnreadCount(0);
    if (isHomeOpen) setIsHomeChatOpen(false);
    lobbyChatSubscriptionRef.current = createLobbyChatSubscriptionState();
  }, [isLoggedIn, isHomeOpen]);

  return {
    cancelChatRules,
    clearDesktopReactionDetailsCloseTimer,
    clearMobileChatReactionToasts,
    closeChatPanel,
    closeDesktopChatReactionPicker,
    closeHomeChat,
    closeReportDialog,
    closeUserMenu,
    confirmChatRules,
    enqueueMobileChatReactionToast,
    openDesktopChatReactionDetails,
    openDesktopChatReactionPicker,
    openHomeChat,
    openReportDialog,
    openUserMenu,
    requestOpenChat,
    scheduleCloseDesktopChatReactionDetails,
    submitReport,
    subscribeLobbyChat,
  };
}
