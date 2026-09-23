import React from "react";
import { createPortal } from "react-dom";
import useOverlayViewport from "../../hooks/useOverlayViewport.js";
import useMobileBackTarget from "../../features/mobile/useMobileBackTarget.js";

export default function ViewportOverlay({ children, label, onClose, className = "" }) {
  const viewportRef = useOverlayViewport();
  useMobileBackTarget(onClose);

  React.useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = viewportRef.current;
    dialog?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected &&
          (document.activeElement === document.body || dialog?.contains(document.activeElement))) {
        previousFocus.focus?.({ preventScroll: true });
      }
    };
  }, [viewportRef]);

  const overlay = (
    <div
      ref={viewportRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={`fixed left-0 top-0 z-[12150] flex w-full items-center justify-center overflow-hidden overscroll-contain bg-black/70 text-white outline-none ${className}`}
      style={{
        height: "100dvh",
        minHeight: 0,
        padding: "max(8px, min(2vmin, 24px), env(safe-area-inset-top)) max(8px, min(2vmin, 24px), env(safe-area-inset-right)) max(8px, min(2vmin, 24px), env(safe-area-inset-bottom)) max(8px, min(2vmin, 24px), env(safe-area-inset-left))",
      }}
      onKeyDown={(event) => {
        // Portalled child dialogs handle their own keyboard navigation.
        if (event.defaultPrevented || !event.currentTarget.contains(event.target)) return;
        if (event.key === "Escape" && onClose) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "Tab") {
          const buttons = Array.from(event.currentTarget.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
          )).filter((element) => element.getClientRects().length);
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (!first || (event.shiftKey && (event.target === first || event.target === event.currentTarget))) {
            event.preventDefault();
            (last || event.currentTarget).focus();
          } else if (!event.shiftKey && event.target === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      {children}
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
