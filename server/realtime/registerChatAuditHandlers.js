export function registerChatAuditHandlers(socket, { archive, requireModerationAccess, getRoom }) {
  let reading = false;
  socket.on("moderation:chat-history", async (payload, cb) => {
    if (typeof cb !== "function") return;
    if (!requireModerationAccess(socket, cb)) return;
    if (reading) return cb({ ok: false, error: "chat_busy" });
    const room = getRoom(socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) return cb({ ok: false, error: "invalid_room" });
    reading = true;
    try {
      const result = await archive.list({
        roomId: room.id, from: payload?.from, to: payload?.to,
        before: payload?.before, query: payload?.query,
      });
      // Recheck if permissions changed while the database query was running.
      if (!requireModerationAccess(socket, cb)) return;
      cb({ ok: true, roomId: room.id, ...result });
    } catch (error) {
      const invalid = error.message === "invalid_chat_query";
      if (!invalid) console.error("[chat-audit] read failed", error.code || error.message);
      cb({ ok: false, error: invalid ? error.message : "chat_archive_unavailable" });
    } finally {
      reading = false;
    }
  });
}
