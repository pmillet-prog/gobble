export const CHAT_USER_MENU_WIDTH = 280;
export const CHAT_USER_MENU_HEIGHT = 294;

export function getChatUserMenuPosition(rect, width, height) {
  const padding = 12;
  const menuWidth = Math.min(CHAT_USER_MENU_WIDTH, width - padding * 2);
  return {
    left: Math.max(padding, Math.min(width - menuWidth - padding,
      (rect?.left || 0) + (rect?.width || 0) / 2 - menuWidth / 2)),
    top: Math.max(padding, Math.min(height - CHAT_USER_MENU_HEIGHT - padding,
      (rect?.top || 0) + (rect?.height || 0) / 2 - CHAT_USER_MENU_HEIGHT / 2)),
  };
}
