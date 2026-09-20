import React from "react";
import AvatarThumbnail from "../../features/avatar/AvatarThumbnail.jsx";
import { playerProfileUserId } from "../../features/overlays/playerProfileTarget.js";
import { isChatBotMessage, isSystemChatMessage } from "../../utils/chatMessages.js";

export default React.memo(function PlayerChatAvatar({ message, onClick, label, className = "-my-1 mr-0.5 self-center" }) {
  const excluded = isChatBotMessage(message) || isSystemChatMessage(message);
  const userId = excluded ? null : playerProfileUserId(message);
  if (!userId) return null;
  return <AvatarThumbnail userId={userId} onClick={onClick} label={label} className={className}
    buttonProps={{ "data-chat-author-button": "true", "aria-haspopup": "menu" }} />;
});
