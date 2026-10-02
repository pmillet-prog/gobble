export function createChatMessageMutations({ normalizeInstallId, isSystemChatEntry, censorTargetSpoilersInChatText, maxTextLength = 300 }) {
  function findTarget(room, messageId, installId) {
    if (!room || typeof messageId !== "string" || !messageId.trim()) return { ok: false, error: "invalid_message_id" };
    const safeInstallId = normalizeInstallId(installId);
    if (!safeInstallId) return { ok: false, error: "invalid_install_id" };
    const target = room.chatMessages?.find(entry => entry?.id === messageId.trim());
    if (!target || isSystemChatEntry(target)) return { ok: false, error: "message_not_found" };
    if (normalizeInstallId(target.installId) !== safeInstallId) return { ok: false, error: "forbidden" };
    return { ok: true, target };
  }
  return {
    updateChatMessageText(room, { messageId, installId, text }) {
      const result = findTarget(room, messageId, installId);
      if (!result.ok) return result;
      const trimmed = typeof text === "string" ? text.trim() : "";
      if (!trimmed) return { ok: false, error: "empty_text" };
      if (trimmed.length > maxTextLength) return { ok: false, error: "text_too_long" };
      result.target.text = censorTargetSpoilersInChatText(room, trimmed);
      result.target.editedAt = Date.now();
      return { ok: true, message: result.target };
    },
    deleteChatMessage(room, { messageId, installId }) {
      const result = findTarget(room, messageId, installId);
      if (!result.ok) return result;
      room.chatMessages.splice(room.chatMessages.indexOf(result.target), 1);
      return { ok: true, messageId: result.target.id, deletedAt: Date.now() };
    },
  };
}
