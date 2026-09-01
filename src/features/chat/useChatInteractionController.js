import React from "react";

import {
  CHAT_DRAWER_CALIBRATION_MAX_RATIO,
  CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
  CHAT_DRAWER_CALIBRATION_MIN_RATIO,
  CHAT_DRAWER_MAX_HEIGHT_PX,
  CHAT_DRAWER_MIN_HEIGHT_PX,
  CHAT_DRAWER_TOP_GAP_PX,
  getChatDrawerOrientationKey,
  readStoredChatDrawerCalibration,
  writeStoredChatDrawerCalibration,
} from "../../app/adapters/chatDrawerCalibration.js";
import { useLazyArrayController } from "../../app/react/useLazyController.js";
import { createChatInteractionController } from "../../components/chat/createChatInteractionController.js";
import { VIEWPORT_EVENTS } from "../layout/createViewportEventHub.js";
import { hasActiveChatDraft } from "../../utils/mobileChatHandoff.js";
import { clampValue } from "../../utils/numbers.js";

function createLobbyChatSubscriptionState() {
  return {
    roomId: null,
    subscribed: false,
    inFlight: false,
    connectPending: false,
  };
}

export function useChatInteractionResources({ chatFeature, isChatClosing }) {
  const chatBaselineHeightRef = React.useRef(0);
  const chatBodyLockHeightRef = React.useRef(0);
  const chatCloseTimerRef = React.useRef(null);
  const chatDrawerCalibrationRef = React.useRef(readStoredChatDrawerCalibration());
  const chatDrawerSessionCalibrationRef = React.useRef(chatDrawerCalibrationRef.current);
  const chatInputRef = React.useRef(null);
  const chatInputValueRef = React.useRef(chatFeature.store.getState().input);
  const chatRulesConfirmRef = React.useRef(null);
  const desktopReactionDetailsCloseTimerRef = React.useRef(null);
  const gameViewportFreezeHeightRef = React.useRef(0);
  const isChatClosingRef = React.useRef(isChatClosing);
  const isChatOpenMobileRef = React.useRef(false);
  const lastKeyboardInsetRef = React.useRef(0);
  const lobbyChatSubscriptionRef = React.useRef(createLobbyChatSubscriptionState());
  const suppressChatResizeRef = React.useRef(false);

  React.useEffect(() => {
    isChatClosingRef.current = isChatClosing;
  }, [isChatClosing]);

  React.useEffect(() => {
    const syncChatInputRef = () => {
      chatInputValueRef.current = chatFeature.store.getState().input;
    };
    syncChatInputRef();
    return chatFeature.store.subscribe(syncChatInputRef);
  }, [chatFeature]);

  return {
    chatBaselineHeightRef,
    chatBodyLockHeightRef,
    chatCloseTimerRef,
    chatDrawerCalibrationRef,
    chatDrawerSessionCalibrationRef,
    chatInputRef,
    chatInputValueRef,
    chatRulesConfirmRef,
    desktopReactionDetailsCloseTimerRef,
    gameViewportFreezeHeightRef,
    isChatClosingRef,
    isChatOpenMobileRef,
    lastKeyboardInsetRef,
    lobbyChatSubscriptionRef,
    suppressChatResizeRef,
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
  const { appView, isLoggedIn, isLoggedInRef, phase } = application;
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
    setChatKeyboardInsetPx,
    setChatOpenedAtMs,
    setChatRulesAccepted,
    setChatTab,
    setChatViewportHeight,
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
  const {
    feature: layoutFeature,
    isFullscreen,
    isMobileLayout,
    isMobileLayoutRef,
    mobileHeaderOffsetPx,
  } = layout;
  const { connectSocketWithAuth, roomIdRef, setConnectionError, socket } = network;
  const { showToast } = notifications;
  const {
    chatBaselineHeightRef,
    chatBodyLockHeightRef,
    chatCloseTimerRef,
    chatDrawerCalibrationRef,
    chatDrawerSessionCalibrationRef,
    chatInputRef,
    chatInputValueRef,
    chatRulesConfirmRef,
    desktopReactionDetailsCloseTimerRef,
    gameViewportFreezeHeightRef,
    isChatClosingRef,
    isChatOpenMobileRef,
    lastKeyboardInsetRef,
    lobbyChatSubscriptionRef,
    suppressChatResizeRef,
  } = resources;

  const [
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
  ] = useLazyArrayController(createChatInteractionController, [
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
  ], 23);

  const wasMobileLiveLobbyRef = React.useRef(false);

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

  React.useLayoutEffect(() => {
    const isMobileLiveLobby =
      isMobileLayout && isLoggedIn && appView === "live" && phase === "lobby";
    const wasMobileLiveLobby = wasMobileLiveLobbyRef.current;
    wasMobileLiveLobbyRef.current = isMobileLiveLobby;

    if (isMobileLiveLobby) {
      resetMobileChatPanelImmediately({ preserveInputFocus: true });
      return undefined;
    }

    if (
      !wasMobileLiveLobby ||
      !isMobileLayout ||
      !isLoggedIn ||
      appView !== "live"
    ) {
      return undefined;
    }

    if (!hasActiveChatDraft(chatInputValueRef.current)) {
      resetMobileChatPanelImmediately();
      return undefined;
    }

    openChatPanel();
    if (typeof window === "undefined") return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      try {
        chatInputRef.current?.focus?.({ preventScroll: true });
      } catch (_) {
        try {
          chatInputRef.current?.focus?.();
        } catch (_) {}
      }
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [
    appView,
    isLoggedIn,
    isMobileLayout,
    phase,
  ]);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    if (tab === "system") return;
    if (isMobileLayout && (!isOpenMobile || isClosing)) return;
    setMobileChatUnreadCount(0);
    setMobileChatBotUnreadCount(0);
  }, [isLoggedIn, tab, isMobileLayout, isOpenMobile, isClosing]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isOpenMobile) {
      chatBaselineHeightRef.current = 0;
      setChatViewportHeight(0);
      setChatKeyboardInsetPx(0);
      return;
    }

    const visualViewport = window.visualViewport;
    const baseHeight =
      chatBodyLockHeightRef.current ||
      chatBaselineHeightRef.current ||
      Math.round(window.innerHeight || visualViewport?.height || 0);
    chatBaselineHeightRef.current = baseHeight;
    setChatViewportHeight((prev) => (prev === baseHeight ? prev : baseHeight));

    const updateInset = () => {
      if (suppressChatResizeRef.current) return;
      const nextHeight =
        chatBodyLockHeightRef.current ||
        chatBaselineHeightRef.current ||
        Math.round(window.innerHeight || visualViewport?.height || 0);
      if (nextHeight > 0) {
        chatBaselineHeightRef.current = nextHeight;
        setChatViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
      const nextInset =
        visualViewport && Number.isFinite(visualViewport.height)
          ? Math.max(
              0,
              Math.round(
                nextHeight -
                  visualViewport.height -
                  (Number.isFinite(visualViewport.offsetTop)
                    ? visualViewport.offsetTop
                    : 0)
              )
            )
          : 0;
      lastKeyboardInsetRef.current = nextInset > 0 ? nextInset : 0;

      if (!chatDrawerCalibrationRef.current && nextHeight > 0) {
        const keyboardThresholdPx = Math.max(
          CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
          Math.round(nextHeight * 0.12)
        );
        if (nextInset >= keyboardThresholdPx) {
          const topInsetPx = isFullscreen ? mobileHeaderOffsetPx : 0;
          const ceilingPx = Math.max(
            220,
            Math.round(nextHeight - topInsetPx - CHAT_DRAWER_TOP_GAP_PX)
          );
          const observedHeightPx = clampValue(
            Math.round(nextHeight - nextInset - topInsetPx),
            Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, ceilingPx),
            Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, ceilingPx)
          );
          const nextCalibration = {
            ratio: clampValue(
              observedHeightPx / nextHeight,
              CHAT_DRAWER_CALIBRATION_MIN_RATIO,
              CHAT_DRAWER_CALIBRATION_MAX_RATIO
            ),
            heightPx: observedHeightPx,
            orientation: getChatDrawerOrientationKey(),
          };
          chatDrawerCalibrationRef.current = nextCalibration;
          writeStoredChatDrawerCalibration(nextCalibration);
        }
      }
      setChatKeyboardInsetPx((prev) => (prev === nextInset ? prev : nextInset));
    };

    updateInset();
    const unsubscribeViewport = layoutFeature.subscribeViewport(updateInset, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
      VIEWPORT_EVENTS.VISUAL_RESIZE,
      VIEWPORT_EVENTS.VISUAL_SCROLL,
    ]);
    window.addEventListener("focusin", updateInset, true);
    window.addEventListener("focusout", updateInset, true);
    return () => {
      unsubscribeViewport();
      window.removeEventListener("focusin", updateInset, true);
      window.removeEventListener("focusout", updateInset, true);
    };
  }, [
    isOpenMobile,
    isFullscreen,
    layoutFeature,
    mobileHeaderOffsetPx,
  ]);

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
