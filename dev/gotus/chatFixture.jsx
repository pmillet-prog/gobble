import React from "react";
import { createChatFeature } from "../../src/features/chat/createChatFeature.js";
import { createResourceScope } from "../../src/app/core/createResourceScope.js";
import { useFeatureFields } from "../../src/app/react/useFeatureRuntime.js";
import MobileChatLayer from "../../src/components/chat/MobileChatLayer.jsx";

// Real chat state/commands and production views; only the transport is synthetic.
export function createFixtureChat() {
  const scope = createResourceScope("gotus-chat-fixture"), handlers = new Map(), emissions = [];
  const values = new Map(), refs = {
    installIdRef: { current: "fixture-self" }, nicknameRef: { current: "Pounie" },
    roomIdRef: { current: "classic" }, isLoggedInRef: { current: false },
    isMobileLayoutRef: { current: false },
  };
  let sequence = 0, subscriptions = 0, closeTimer;
  const socket = {
    connected: true,
    bind(next) {
      for (const [event, handler] of Object.entries(next)) handlers.set(event, handler);
      return () => { for (const [event, handler] of Object.entries(next)) if (handlers.get(event) === handler) handlers.delete(event); };
    },
    emit(event, payload, ack) {
      emissions.push({ event, payload });
      queueMicrotask(() => {
        ack?.({ ok: true });
        if (event === "chat:send") receive(typeof payload === "string" ? payload : payload.text, true);
      });
    },
  };
  const feature = createChatFeature({ scope, ports: { realtime: socket } }, {
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
  });
  const subscribeLobbyChat = () => { subscriptions += 1; };
  feature.configureRealtime({ ...refs, socket });
  feature.configureCommands({ ...refs, socket, ensureAuthenticated: () => true, subscribeLobbyChat });
  feature.start();
  feature.patch({ rulesAccepted: true, showBotMessages: true });
  function receive(text, own = false) {
    handlers.get("chatMessage")?.({ id: `fixture-chat-${++sequence}`, t: Date.now(),
      nick: own ? "Pounie" : "Tigre", installId: own ? "fixture-self" : "fixture-other", text });
  }
  receive("Bienvenue dans le chat du salon.");
  const open = () => {
    clearTimeout(closeTimer);
    if (!refs.isLoggedInRef.current) subscribeLobbyChat();
    feature.patch({ mobileChatOpen: true, mobileChatClosing: false, mobileChatOpenedAt: Date.now(),
      tab: "messages", homeUnreadCount: 0, homeBotUnreadCount: 0, mobileUnreadCount: 0, mobileBotUnreadCount: 0 });
  };
  const close = () => {
    feature.patch({ mobileChatOpen: false, mobileChatClosing: true });
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => feature.set("mobileChatClosing", false), 220);
  };
  const inspect = () => ({ ...feature.store.getState(), emissions: [...emissions], subscriptions, handlers: handlers.size });
  const dispose = () => { clearTimeout(closeTimer); scope.dispose(); };
  window.addEventListener("pagehide", dispose, { once: true });
  return { feature, refs, receive, open, close, subscribeLobbyChat, inspect, dispose };
}

const FIELDS = ["rulesAccepted", "mobileChatOpen", "mobileChatClosing", "mobileChatOpenedAt", "editTarget", "replyTarget", "tab", "showBlockedList"];

export function useFixtureChat(runtime, { mobile, training }) {
  const state = useFeatureFields(runtime.feature, FIELDS), inputRef = React.useRef(null);
  runtime.refs.isLoggedInRef.current = !training;
  runtime.refs.isMobileLayoutRef.current = mobile;
  return {
    appView: training ? "home" : "live", isLoggedIn: !training, isMobileLayout: mobile,
    installId: "fixture-self", selfNick: "Pounie", chatInputRef: inputRef,
    chatInputDisabled: !state.rulesAccepted, chatInputPlaceholder: "Écrire un message...",
    chatEditTarget: state.editTarget, chatReplyTarget: state.replyTarget, chatTab: state.tab,
    isChatOpenMobile: state.mobileChatOpen, isChatClosing: state.mobileChatClosing,
    chatOpenedAtMs: state.mobileChatOpenedAt, chatAnimationMs: 220, chatFocusPreserveKey: "gotus-fixture",
    showLauncherButton: false, showBlockedList: state.showBlockedList,
    onOpenChat: runtime.open, closeChatPanel: runtime.close, subscribeLobbyChat: runtime.subscribeLobbyChat,
    submitChat: runtime.feature.submit, cycleChatHistory: runtime.feature.cycleHistory,
    onChangeChatTab: value => runtime.feature.set("tab", value),
    onClearChatEdit: runtime.feature.clearEditTarget, onClearChatReply: runtime.feature.clearReplyTarget,
    onSelectChatReply: runtime.feature.setReplyTargetFromMessage, onEditOwnMessage: runtime.feature.beginEditFromMessage,
    onDeleteOwnMessage: runtime.feature.deleteOwnMessage, onReactToMessage: runtime.feature.sendReaction,
    onOpenRules: () => runtime.feature.set("rulesOpen", true),
    onToggleBlockedList: () => runtime.feature.set("showBlockedList", value => !value),
  };
}

export function FixtureMobileChat({ chat }) {
  return <MobileChatLayer {...chat} />;
}
