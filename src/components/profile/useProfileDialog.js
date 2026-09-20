import { useEffect, useRef } from "react";

export default function useProfileDialog(ref, onClose, active = true, focusKey = "profile") {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const root = ref.current;
    const focusable = () => Array.from(root?.querySelectorAll("button:not(:disabled), [href], input, select, summary, [tabindex='0']") || []).filter(node => node.getClientRects().length);
    (focusable()[0] || root)?.focus();
    const keydown = event => {
      // Native purchase dialogs own Escape, focus trapping and focus restoration.
      if (root?.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); root?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => { document.removeEventListener("keydown", keydown, true); if (previous?.isConnected) previous.focus(); };
  }, [active, focusKey]); // The modal owns focus; changing callback identity must not reset it.
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [active]);
}
