import React from "react";

function isAmbientBotMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message?.meta?.kind === "ambient_bot_chat") return true;
  const installId = typeof message.installId === "string" ? message.installId : "";
  return installId.startsWith("ambient-bot:");
}

function DesktopChatPanel({
  blockedCount = 0,
  blockedEntries = [],
  chatBlockClassName = "",
  chatDesktopFontScale = 1,
  chatEditTarget = null,
  chatInput = "",
  chatInputDisabled = false,
  chatInputPlaceholder = "",
  chatMessagesUnreadCount = 0,
  chatReplyTarget = null,
  darkMode = false,
  desktopChatFontPx = 14,
  desktopChatInputFontPx = 14,
  desktopChatInputLineHeightPx = 20,
  desktopChatLineHeightPx = 20,
  desktopChatMetaFontPx = 11,
  desktopChatMetaLineHeightPx = 15,
  desktopChatMicroFontPx = 10,
  desktopChatQuickReplyFontPx = 11,
  desktopChatScaleLabel = "100%",
  desktopChatStyle = {},
  desktopChatTab = "messages",
  desktopEmojiList = [],
  helpersRef,
  installId = "",
  isDesktopEmojiPickerOpen = false,
  lastMessageId = null,
  listRef,
  mobileReactionToasts = [],
  panelRef,
  quickReplies = [],
  selfNick = "",
  showBlockedList = false,
  showBotMessages = true,
  visibleMessages = [],
  actionsRef,
  chatInputRef,
  chatScaleMax = 1.5,
  chatScaleMin = 0.85,
  chatScaleStep = 0.05,
  getAuthorNickClassName = null,
  onToggleShowBotMessages = null,
}) {
  const helpers = helpersRef?.current || {};
  const formatChatUnreadSuffix = helpers.formatChatUnreadSuffix || (() => "");
  const formatChatMessageTime = helpers.formatChatMessageTime || (() => "");
  const isEditedChatMessage = helpers.isEditedChatMessage || (() => false);
  const isSystemAuthor = helpers.isSystemAuthor || (() => false);
  const getChatMessageReplyPreview = helpers.getChatMessageReplyPreview || (() => null);
  const getChatMessageReactionEntries = helpers.getChatMessageReactionEntries || (() => []);

  return (
    <div
      ref={panelRef}
      data-chat-panel="true"
      className={chatBlockClassName}
      style={desktopChatStyle}
      onClick={(event) => {
        actionsRef?.current?.setActiveArea?.("chat");
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest("button, a, input, textarea, select, label")) return;
        actionsRef?.current?.prepareDesktopChatInputFocus?.();
        actionsRef?.current?.focusChatInput?.();
      }}
    >
      <div className="desktop-column-heading flex items-center justify-between mb-2">
        <h2 className="desktop-column-title font-bold text-center">Chat</h2>
        <div className="desktop-chat-header-actions flex items-center">
          <button
            type="button"
            className={`desktop-chat-header-button font-semibold ${
              darkMode ? "text-slate-300" : "text-slate-600"
            }`}
            onClick={() => actionsRef?.current?.openChatRules?.()}
          >
            Règles
          </button>
          <button
            type="button"
            className={`desktop-chat-header-button font-semibold ${
              darkMode ? "text-amber-300" : "text-blue-600"
            }`}
            onClick={() => actionsRef?.current?.toggleBlockedList?.()}
          >
            Joueurs bloqués ({blockedCount})
          </button>
        </div>
      </div>
      <div className="desktop-chat-toolbar mb-2 flex items-center justify-between">
        <div
          className={`desktop-chat-tabs inline-flex rounded-full border ${
            darkMode ? "border-white/10 bg-slate-800/70" : "border-slate-200 bg-slate-100"
          }`}
        >
          <button
            type="button"
            className={`desktop-chat-tab-button rounded-full font-bold transition ${
              desktopChatTab === "messages"
                ? "bg-blue-600 text-white"
                : darkMode
                ? "text-slate-200"
                : "text-slate-700"
            }`}
            onClick={() => actionsRef?.current?.setChatTab?.("messages")}
          >
            Messages{formatChatUnreadSuffix(chatMessagesUnreadCount)}
          </button>
          <button
            type="button"
            className={`desktop-chat-tab-button rounded-full font-bold transition ${
              desktopChatTab === "system"
                ? "bg-orange-500 text-white"
                : darkMode
                ? "text-slate-200"
                : "text-slate-700"
            }`}
            onClick={() => actionsRef?.current?.setChatTab?.("system")}
          >
            Système
          </button>
        </div>
        <label
          className={`desktop-chat-font-control ml-auto inline-flex max-w-full items-center rounded-full border ${
            darkMode
              ? "border-white/10 bg-slate-800/70 text-slate-100"
              : "border-slate-200 bg-slate-100 text-slate-700"
          }`}
          title={`Taille du chat : ${desktopChatScaleLabel}`}
        >
          <span
            className="font-extrabold text-base leading-none shrink-0"
            style={{
              fontFamily: "\"GobblePerfectPen\", \"KGPerfectPenmanship\", cursive",
            }}
            aria-hidden="true"
          >
            Aa
          </span>
          <input
            type="range"
            min={chatScaleMin}
            max={chatScaleMax}
            step={chatScaleStep}
            value={chatDesktopFontScale}
            onChange={(e) =>
              actionsRef?.current?.changeChatDesktopFontScale?.(e.target.value)
            }
            className="min-w-0 flex-1 basis-16 max-w-24 accent-blue-600"
            aria-label="Taille de la police du chat"
          />
        </label>
      </div>
      <div className="desktop-chat-bot-row flex justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={showBotMessages ? "true" : "false"}
          aria-label={showBotMessages ? "Masquer les messages bots" : "Afficher les messages bots"}
          className={`desktop-chat-bot-button inline-flex items-center rounded-full border font-bold transition ${
            darkMode
              ? "border-white/10 bg-slate-800/70 text-slate-100"
              : "border-slate-200 bg-slate-100 text-slate-700"
          }`}
          onClick={() => onToggleShowBotMessages?.()}
        >
          <span>Bots</span>
          <span
            data-enabled={showBotMessages ? "true" : "false"}
            className={`desktop-chat-switch-track relative rounded-full transition ${
              showBotMessages ? "bg-emerald-500" : darkMode ? "bg-slate-700" : "bg-slate-300"
            }`}
            aria-hidden="true"
          >
            <span
              className="desktop-chat-switch-knob absolute rounded-full bg-white shadow transition"
            />
          </span>
        </button>
      </div>

      {showBlockedList ? (
        <div
          className={`mt-2 rounded-lg border px-2 py-2 text-[11px] ${
            darkMode
              ? "bg-slate-900/70 border-slate-600 text-slate-100"
              : "bg-gray-50 border-gray-200 text-gray-700"
          }`}
        >
          {blockedCount === 0 ? (
            <div className="text-center">Aucun joueur bloqué.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {blockedEntries.map((entry) => (
                <div key={entry.id} className="inline-flex items-center gap-2">
                  <span className="font-semibold">{entry.label}</span>
                  <button
                    type="button"
                    className={`text-[11px] font-semibold ${
                      darkMode ? "text-amber-300" : "text-blue-600"
                    }`}
                    onClick={() => actionsRef?.current?.unblockInstallId?.(entry.id)}
                  >
                    Réactiver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="chat-messages flex-1 border rounded px-2 py-1 pb-4 bg-white/85 dark:bg-slate-900/75 text-xs space-y-1 flex flex-col overflow-y-auto custom-scrollbar custom-scrollbar-gray"
        style={{ overscrollBehavior: "contain", overflowAnchor: "none" }}
        onScroll={actionsRef?.current?.handleDesktopChatScroll}
      >
        {visibleMessages.length === 0 ? (
          <div className="text-sm text-slate-400 text-center mt-4">
            {desktopChatTab === "system"
              ? "Aucun log de connexion/déconnexion."
              : "Aucun message pour l'instant."}
          </div>
        ) : null}
        {visibleMessages.map((msg) => {
          const author = (msg.nick || msg.author || "Anonyme").trim();
          const authorInstallId = typeof msg.installId === "string" ? msg.installId : "";
          const messageTime = formatChatMessageTime(msg);
          const isEdited = isEditedChatMessage(msg);
          const isSystem = isSystemAuthor(author);
          const isAmbientBot = !isSystem && isAmbientBotMessage(msg);
          const isYou =
            !isAmbientBot && (authorInstallId ? authorInstallId === installId : author === selfNick);
          const isLast = msg.id === lastMessageId;
          const canOpenMenu = !isSystem && authorInstallId && authorInstallId !== installId;
          const replyPreview = getChatMessageReplyPreview(msg);
          const reactionEntries = getChatMessageReactionEntries(msg);
          const replyTargetsSelf = !!(
            replyPreview &&
            ((replyPreview.installId &&
              String(replyPreview.installId).trim() === String(installId || "").trim()) ||
              (!replyPreview.installId &&
                String(replyPreview.nick || "").trim() === String(selfNick || "").trim()))
          );
          const podiumRank = Number(msg?.weeklyVocabPodiumRank) || (msg?.isWeeklyVocabChampion ? 1 : 0);
          const podiumClass =
            podiumRank === 1
              ? "nick-podium-gold"
              : podiumRank === 2
              ? "nick-podium-silver"
              : podiumRank === 3
              ? "nick-podium-bronze"
              : "";
          const authorNickClass =
            (typeof getAuthorNickClassName === "function"
              ? getAuthorNickClassName(msg, author)
              : "") ||
            (podiumClass
              ? podiumClass
              : isAmbientBot
              ? darkMode
                ? "text-slate-400"
                : "text-amber-900/75"
              : isYou
            ? "text-white"
            : darkMode
            ? "text-slate-100"
                : "text-black");

          return (
            <div
              key={msg.id}
              data-chat-row
              className={`w-full transition-opacity duration-300 ${isLast ? "slide-fade-in" : ""}`}
            >
              {isSystem ? (
                <div
                  className="w-full px-1 py-0.5 italic text-orange-700"
                  style={{ fontSize: `${desktopChatFontPx}px`, lineHeight: `${desktopChatLineHeightPx}px` }}
                >
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    {messageTime ? (
                      <span
                        className="font-semibold not-italic opacity-85"
                        style={{ fontSize: `${desktopChatMicroFontPx}px` }}
                      >
                        {messageTime}
                      </span>
                    ) : null}
                    {isEdited ? (
                      <span
                        className="leading-none opacity-60 not-italic"
                        style={{ fontSize: `${desktopChatMicroFontPx}px` }}
                      >
                        (modifié)
                      </span>
                    ) : null}
                  </div>
                  <div>{msg.text}</div>
                </div>
              ) : (
                <div className={`w-full flex ${isYou ? "justify-end" : "justify-start"}`}>
                  <div
                    data-chat-message-id={msg?.id || undefined}
                    className={[
                      "group/chatmsg max-w-[88%] px-2 rounded-lg",
                      isYou
                        ? darkMode
                          ? "bg-blue-500 text-white"
                          : "bg-blue-600 text-white"
                        : isAmbientBot
                        ? darkMode
                          ? "py-0.5 italic bg-slate-950/45 text-slate-400 border border-slate-800"
                          : "py-0.5 italic bg-amber-50/60 text-amber-900/70 border border-amber-100"
                        : darkMode
                        ? "py-1 bg-slate-800 text-slate-100 border border-slate-700"
                        : "py-1 bg-slate-100 text-slate-900 border border-slate-200",
                    ].join(" ")}
                    style={{
                      fontSize: `${isAmbientBot ? Math.max(7, desktopChatFontPx - 2) : desktopChatFontPx}px`,
                      lineHeight: `${isAmbientBot ? Math.max(9, desktopChatLineHeightPx - 3) : desktopChatLineHeightPx}px`,
                    }}
                  >
                    {replyPreview ? (
                      <div
                        className={`mb-1 rounded-md border-l-4 px-2 py-1 ${
                          replyTargetsSelf
                            ? "border-blue-500 bg-blue-50 text-slate-700"
                            : darkMode
                            ? "border-slate-600 bg-slate-700/80 text-slate-200"
                            : "border-slate-300 bg-slate-50 text-slate-700"
                        }`}
                        style={{
                          fontSize: `${desktopChatMetaFontPx}px`,
                          lineHeight: `${desktopChatMetaLineHeightPx}px`,
                        }}
                      >
                        <div className="font-semibold">{replyPreview.nick}</div>
                        <div
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {replyPreview.text}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      {canOpenMenu ? (
                        <button
                          type="button"
                          className={`font-semibold hover:underline ${authorNickClass}`}
                          onClick={(e) =>
                            actionsRef?.current?.openUserMenu?.(e, {
                              nick: author,
                              userId: msg.userId,
                              installId: authorInstallId,
                              messageId: msg.id,
                            })
                          }
                        >
                          {author} :
                        </button>
                      ) : (
                        <span
                          className={`font-semibold ${authorNickClass}`}
                        >
                          {author} :
                        </span>
                      )}
                      {messageTime ? (
                        <span
                          className={`text-[10px] leading-none ${
                            isYou
                              ? "text-white/80"
                              : darkMode
                              ? "text-slate-400"
                              : "text-slate-500"
                          }`}
                        >
                          {messageTime}
                        </span>
                      ) : null}
                      <span
                        className={
                          isYou
                            ? "text-white"
                            : isAmbientBot
                            ? darkMode
                              ? "text-slate-400"
                              : "text-amber-900/70"
                            : darkMode
                            ? "text-slate-100"
                            : "text-black"
                        }
                      >
                        {msg.text}
                      </span>
                    </div>
                    {!isYou && !isAmbientBot ? (
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-blue-600 hover:underline"
                          onClick={() => actionsRef?.current?.setChatReplyTargetFromMessage?.(msg)}
                        >
                          Répondre
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-slate-600 hover:underline"
                          onClick={(event) =>
                            actionsRef?.current?.openDesktopChatReactionPicker?.(event, msg)
                          }
                        >
                          Réagir
                        </button>
                      </div>
                    ) : isYou ? (
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-amber-600 hover:underline"
                          onClick={() => actionsRef?.current?.beginChatEditFromMessage?.(msg)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-rose-600 hover:underline"
                          onClick={() => actionsRef?.current?.deleteOwnChatMessage?.(msg)}
                        >
                          Supprimer
                        </button>
                      </div>
                    ) : null}
                    {reactionEntries.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {reactionEntries.map((entry) => (
                          <button
                            key={`${msg.id || "msg"}:${entry.emoji}`}
                            type="button"
                            className="h-5 rounded-full border border-slate-300 bg-white px-2 text-[10px] inline-flex items-center gap-1 text-slate-700"
                            onMouseEnter={(event) =>
                              actionsRef?.current?.openDesktopChatReactionDetails?.(event, msg, entry)
                            }
                            onMouseLeave={() =>
                              actionsRef?.current?.scheduleCloseDesktopChatReactionDetails?.()
                            }
                            onClick={(event) =>
                              actionsRef?.current?.openDesktopChatReactionDetails?.(event, msg, entry)
                            }
                          >
                            <span>{entry.emoji}</span>
                            <span>{entry.count}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {desktopChatTab !== "system" ? (
        <>
          {chatEditTarget ? (
            <div
              className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-slate-700"
              style={{ fontSize: `${desktopChatMetaFontPx}px`, lineHeight: `${desktopChatMetaLineHeightPx}px` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">Modification du message</div>
                  <div
                    style={{
                      fontSize: `${desktopChatMetaFontPx}px`,
                      lineHeight: `${desktopChatMetaLineHeightPx}px`,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {chatEditTarget.text || ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="h-6 w-6 rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 shrink-0"
                  onClick={() => actionsRef?.current?.clearChatEditTarget?.()}
                  aria-label="Annuler la modification"
                >
                  x
                </button>
              </div>
            </div>
          ) : null}
          {chatReplyTarget ? (
            <div
              className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-slate-700"
              style={{ fontSize: `${desktopChatMetaFontPx}px`, lineHeight: `${desktopChatMetaLineHeightPx}px` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">Réponse à {chatReplyTarget.nick || "Anonyme"}</div>
                  <div
                    style={{
                      fontSize: `${desktopChatMetaFontPx}px`,
                      lineHeight: `${desktopChatMetaLineHeightPx}px`,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {chatReplyTarget.text || ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="h-6 w-6 rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 shrink-0"
                  onClick={() => actionsRef?.current?.clearChatReplyTarget?.()}
                  aria-label="Annuler la réponse"
                >
                  x
                </button>
              </div>
            </div>
          ) : null}
          <div className="desktop-chat-quick-row mt-2 flex flex-nowrap items-center overflow-hidden">
            {quickReplies.map((txt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => actionsRef?.current?.submitChat?.(null, txt)}
                disabled={chatInputDisabled}
                className="desktop-chat-quick-button rounded-full border bg-gray-100 hover:bg-gray-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontSize: `${desktopChatQuickReplyFontPx}px` }}
              >
                {txt}
              </button>
            ))}
          </div>

          {isDesktopEmojiPickerOpen ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {desktopEmojiList.map((emoji) => (
                <button
                  key={`chat-emoji-${emoji}`}
                  type="button"
                  onClick={() => actionsRef?.current?.appendChatEmoji?.(emoji)}
                  disabled={chatInputDisabled}
                  className={`h-8 w-8 rounded-md border leading-none flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                    darkMode
                      ? "bg-slate-800 border-slate-700 hover:bg-slate-700"
                      : "bg-white border-slate-300 hover:bg-slate-100"
                  }`}
                  style={{ fontSize: `${Math.round(18 * chatDesktopFontScale)}px` }}
                  title={`Ajouter ${emoji}`}
                  aria-label={`Ajouter ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          <div className="desktop-chat-input-row mt-3 flex items-end">
            <button
              type="button"
              onClick={() => actionsRef?.current?.toggleDesktopEmojiPicker?.()}
              disabled={chatInputDisabled}
              className={`desktop-chat-input-button rounded border disabled:opacity-50 disabled:cursor-not-allowed ${
                darkMode
                  ? "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
              style={{ fontSize: `${desktopChatInputFontPx}px`, lineHeight: `${desktopChatInputLineHeightPx}px` }}
              aria-label="Raccourci émoticônes"
              title="Raccourci émoticônes"
            >
              🙂
            </button>
            <textarea
              ref={chatInputRef}
              rows={1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="send"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-autofill="off"
              aria-autocomplete="none"
              aria-label="Message du chat"
              onPointerDownCapture={() =>
                actionsRef?.current?.prepareDesktopChatInputFocus?.()
              }
              onFocus={() => actionsRef?.current?.handleChatInputFocus?.()}
              readOnly={chatInputDisabled}
              aria-disabled={chatInputDisabled}
              className="desktop-chat-input flex-1 min-w-0 border rounded ios-input chat-input resize-none"
              style={{ fontSize: `${desktopChatInputFontPx}px`, lineHeight: `${desktopChatInputLineHeightPx}px` }}
              placeholder={chatInputPlaceholder}
              value={chatInput}
              onChange={(e) =>
                actionsRef?.current?.setChatInputValue?.(e.target.value, e.currentTarget)
              }
              onKeyDown={(e) => actionsRef?.current?.handleChatInputKeyDown?.(e)}
            />
            <button
              type="button"
              className="desktop-chat-send-button rounded bg-blue-600 text-white disabled:opacity-50 whitespace-nowrap"
              style={{ fontSize: `${desktopChatInputFontPx}px`, lineHeight: `${desktopChatInputLineHeightPx}px` }}
              disabled={!chatInput.trim() || chatInputDisabled}
              onClick={() => actionsRef?.current?.submitChat?.(null)}
            >
              Envoyer
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default React.memo(DesktopChatPanel);
