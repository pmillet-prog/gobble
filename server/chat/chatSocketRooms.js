const CHAT_SOCKET_ROOM_PREFIX = "chat:";

export function getChatSocketRoomId(roomId) {
  const safeRoomId = String(roomId || "").trim();
  return safeRoomId ? `${CHAT_SOCKET_ROOM_PREFIX}${safeRoomId}` : "";
}

export function joinSocketToChatRoom(socket, roomId) {
  const safeRoomId = String(roomId || "").trim();
  const chatSocketRoomId = getChatSocketRoomId(safeRoomId);
  if (!socket || !chatSocketRoomId) return "";

  const previousRoomId = String(socket.data?.chatRoomId || "").trim();
  if (previousRoomId && previousRoomId !== safeRoomId) {
    const previousChatSocketRoomId = getChatSocketRoomId(previousRoomId);
    if (previousChatSocketRoomId) {
      socket.leave(previousChatSocketRoomId);
    }
  }

  socket.data = socket.data && typeof socket.data === "object" ? socket.data : {};
  socket.data.chatRoomId = safeRoomId;
  socket.join(chatSocketRoomId);
  return chatSocketRoomId;
}

export function leaveSocketChatRoom(socket) {
  if (!socket) return "";
  const previousRoomId = String(socket.data?.chatRoomId || "").trim();
  const previousChatSocketRoomId = getChatSocketRoomId(previousRoomId);
  if (previousChatSocketRoomId) {
    socket.leave(previousChatSocketRoomId);
  }
  if (socket.data && typeof socket.data === "object") {
    socket.data.chatRoomId = null;
  }
  return previousChatSocketRoomId;
}

export function emitChatSocketEvent(io, roomId, eventName, payload) {
  const chatSocketRoomId = getChatSocketRoomId(roomId);
  if (!io || !chatSocketRoomId || !eventName) return false;
  io.to(chatSocketRoomId).emit(eventName, payload);
  return true;
}
