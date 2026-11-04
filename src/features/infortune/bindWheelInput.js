// Pointer capture keeps a fling continuous even when the finger leaves the rim.
// The same launch path handles touch, mouse, pen and the accessible hold button.
export function bindWheelInput({ surface, chargeButton, controller, documentTarget = document, windowTarget = window }) {
  const listeners = [];
  let wheelPointer = null, chargePointer = null, heldKey = null;
  function on(target, type, listener) {
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  }
  function position(event) {
    const rect = surface.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height * 334 / 640;
    return { angle: Math.atan2(y, x), radius: Math.hypot(x, y) / rect.width };
  }
  function clearCapture(target, pointer) {
    if (pointer !== null && target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
  }
  function cancel() {
    controller.cancelGesture();
    const wheel = wheelPointer, charge = chargePointer;
    wheelPointer = chargePointer = heldKey = null;
    clearCapture(surface, wheel);
    clearCapture(chargeButton, charge);
  }
  on(surface, "pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || wheelPointer !== null) return;
    const point = position(event);
    if (point.radius < 0.16 || point.radius > 0.46 || !controller.beginDrag(point.angle)) return;
    event.preventDefault();
    wheelPointer = event.pointerId;
    surface.setPointerCapture(wheelPointer);
  });
  on(surface, "pointermove", event => {
    if (event.pointerId !== wheelPointer) return;
    controller.drag(position(event).angle);
  });
  on(surface, "pointerup", event => {
    if (event.pointerId !== wheelPointer) return;
    controller.drag(position(event).angle);
    controller.endDrag();
    const pointer = wheelPointer;
    wheelPointer = null;
    clearCapture(surface, pointer);
  });
  on(surface, "pointercancel", cancel);
  on(surface, "lostpointercapture", event => { if (event.pointerId === wheelPointer) cancel(); });
  on(chargeButton, "pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || !controller.beginCharge()) return;
    event.preventDefault();
    chargeButton.focus({ preventScroll: true });
    chargePointer = event.pointerId;
    chargeButton.setPointerCapture(chargePointer);
  });
  on(chargeButton, "pointerup", event => {
    if (event.pointerId !== chargePointer) return;
    controller.endCharge();
    const pointer = chargePointer;
    chargePointer = null;
    clearCapture(chargeButton, pointer);
  });
  on(chargeButton, "pointercancel", cancel);
  on(chargeButton, "lostpointercapture", event => { if (event.pointerId === chargePointer) cancel(); });
  on(chargeButton, "keydown", event => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!event.repeat && !heldKey && controller.beginCharge()) heldKey = event.key;
  });
  on(chargeButton, "keyup", event => {
    if (event.key !== heldKey) return;
    event.preventDefault();
    heldKey = null;
    controller.endCharge();
  });
  on(chargeButton, "blur", () => { if (heldKey) cancel(); });
  on(windowTarget, "blur", cancel);
  on(documentTarget, "visibilitychange", () => {
    if (documentTarget.hidden) { cancel(); controller.pause(); }
    else controller.resume();
  });
  if (documentTarget.hidden) controller.pause();
  return () => { cancel(); for (const remove of listeners) remove(); };
}
