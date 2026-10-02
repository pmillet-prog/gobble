// One queue per room, shared by every socket. Persist before broadcasting or
// committing a mutation; a failed archive write never silently loses a message.
export function createAuditedChatCommands({ archive, pushChatMessage, updateChatMessageText, deleteChatMessage }) {
  const queues = new Map();
  let pending = 0;
  function run(room, command) {
    if (pending >= 100) return Promise.resolve({ ok: false, error: "chat_busy" });
    pending += 1;
    const previous = queues.get(room.id) || Promise.resolve();
    const task = previous.then(command).catch(error => {
      console.error("[chat-audit] command failed", error.code || error.message);
      return { ok: false, error: "chat_archive_unavailable" };
    });
    queues.set(room.id, task);
    return task.finally(() => {
      pending -= 1;
      if (queues.get(room.id) === task) queues.delete(room.id);
    });
  }
  return {
    send(room, message, submittedText) {
      return run(room, async () => {
        await archive.append({ action: "sent", roomId: room.id, message, submittedText });
        pushChatMessage(room, message);
        return { ok: true };
      });
    },
    edit(room, args) {
      return run(room, async () => {
        const id = typeof args.messageId === "string" ? args.messageId.trim() : "";
        const target = room.chatMessages?.find(message => message.id === id);
        const staged = { ...room, chatMessages: target ? [{ ...target }] : [] };
        const result = updateChatMessageText(staged, args);
        if (!result.ok) return result;
        await archive.append({ action: "edited", roomId: room.id, message: result.message,
          previousText: target.text, submittedText: args.text.trim(), at: result.message.editedAt });
        // Reactions can arrive while the disk write is in flight. Keep them.
        target.text = result.message.text;
        target.editedAt = result.message.editedAt;
        return { ...result, message: target };
      });
    },
    delete(room, args) {
      return run(room, async () => {
        const id = typeof args.messageId === "string" ? args.messageId.trim() : "";
        const target = room.chatMessages?.find(message => message.id === id);
        const staged = { ...room, chatMessages: target ? [target] : [] };
        const result = deleteChatMessage(staged, args);
        if (!result.ok) return result;
        await archive.append({ action: "deleted", roomId: room.id, message: target, at: result.deletedAt });
        room.chatMessages = room.chatMessages.filter(message => message.id !== result.messageId);
        return result;
      });
    },
  };
}
