import React from 'react';

const owners = new Set();
let root, previousInert, previousLayer;

// Both wheel surfaces share the root lock. A handoff must not unlock the game
// beneath another wheel, lower the chat, or focus away from a message draft.
export function useWheelOverlayLayer(visible, dialog) {
  React.useEffect(() => {
    if (!visible) return;
    const owner = {}, previousFocus = document.activeElement;
    if (!owners.size) {
      root = document.getElementById('root'); previousInert = root?.inert;
      previousLayer = document.body.style.getPropertyValue('--infortune-social-z');
      if (root) root.inert = true;
      document.body.style.setProperty('--infortune-social-z', '250100');
    }
    owners.add(owner);
    if (!document.querySelector('[data-chat-panel], .stats-overlay')) dialog.current?.focus({ preventScroll: true });
    return () => {
      owners.delete(owner);
      if (!owners.size) {
        if (root) root.inert = previousInert;
        if (previousLayer) document.body.style.setProperty('--infortune-social-z', previousLayer);
        else document.body.style.removeProperty('--infortune-social-z');
        if (!document.querySelector('[data-chat-panel], .stats-overlay') && previousFocus?.isConnected)
          previousFocus.focus?.({ preventScroll: true });
        root = null;
      }
    };
  }, [visible, dialog]);
}
