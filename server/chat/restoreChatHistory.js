// Only public display metadata belongs in the live history. The audit's original
// submissions and previous versions must never be sent back to players.
const DISPLAY_FIELDS = ["team", "isDailyChampion", "weeklyVocabPodiumRank", "isWeeklyVocabChampion", "replyTo"];

export function chatHistoryMetadata(message) {
  return Object.fromEntries(DISPLAY_FIELDS.filter(key => message?.[key] !== undefined)
    .map(key => [key, message[key]]));
}

export async function restoreChatHistory(db, { roomId, limit, cutoff }) {
  const rows = await db.all(`SELECT current.* FROM chat_audit AS current
    WHERE current.room_id=? AND current.at>=? AND current.action!='deleted'
      AND NOT EXISTS (SELECT 1 FROM chat_audit AS newer
        WHERE newer.room_id=current.room_id AND newer.message_id=current.message_id AND newer.seq>current.seq)
    ORDER BY current.sent_at DESC,current.message_id DESC LIMIT ?`, roomId, cutoff, limit);
  return rows.reverse().map(row => {
    let metadata = {};
    try { metadata = chatHistoryMetadata(JSON.parse(row.public_metadata)); } catch { /* Older archives have no metadata. */ }
    return { ...metadata, id: row.message_id, roomId: row.room_id, t: row.sent_at,
      nick: row.nick, userId: row.user_id, installId: row.install_id, text: row.text,
      ...(row.action === "edited" ? { editedAt: row.at } : {}) };
  });
}
