export function isKeyboardEditableTarget(target) {
  if (typeof HTMLElement === "undefined") return false;
  const targetElement = target instanceof HTMLElement ? target : null;
  if (!targetElement) return false;
  const tag = targetElement.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    targetElement.isContentEditable ||
    !!targetElement.closest?.("[contenteditable='true']")
  );
}
