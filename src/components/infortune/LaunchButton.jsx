import React from "react";

export function LaunchButton({ wheel, className, children }) {
  return <button className={className} type="button"
    disabled={wheel.inputLocked || Boolean(wheel.renderError) || !["ready", "aiming"].includes(wheel.view.phase)}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
      wheel.clickLaunch(event.timeStamp);
    }}
    onClick={event => { if (event.detail === 0) wheel.clickLaunch(event.timeStamp); }}
    onKeyDown={event => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault(); if (!event.repeat) wheel.clickLaunch(event.timeStamp);
      }
      if (event.key === "Escape") wheel.cancelLaunch();
    }}>{children}</button>;
}
