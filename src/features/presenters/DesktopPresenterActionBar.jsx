import React from "react";

import {
  PRESENTERS,
  PresenterButton,
} from "./MobilePresenterActionBar.jsx";
import { PRESENTER_HINT_KEYS } from "./createPresenterHintsController.js";
import usePresenterHintsController from "./usePresenterHintsController.js";

const PRESENTER_SHORTCUTS = Object.freeze([
  {
    key: PRESENTER_HINT_KEYS.romejko,
    codes: ["Digit1", "Numpad1"],
    characters: ["1", "&"],
    label: "1",
  },
  {
    key: PRESENTER_HINT_KEYS.lepers,
    codes: ["Digit2", "Numpad2"],
    characters: ["2", "é"],
    label: "2",
  },
  {
    key: PRESENTER_HINT_KEYS.capello,
    codes: ["Digit3", "Numpad3"],
    characters: ["3", '"'],
    label: "3",
  },
]);

export function resolvePresenterShortcut(event) {
  const shortcut = PRESENTER_SHORTCUTS.find(
    (entry) =>
      entry.codes.includes(event?.code) || entry.characters.includes(event?.key),
  );
  return shortcut?.key || "";
}

function isTextEntryTarget(target) {
  const tagName = String(target?.tagName || "").toLowerCase();
  return (
    target?.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

function DesktopPresenterActionBar({
  buttonSize = "min(29cqi, 128px)",
  darkMode = false,
  hostRef = null,
  presentersDisabled = false,
  roundId = null,
}) {
  const controller = usePresenterHintsController();
  const presenterState = React.useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  React.useEffect(() => {
    controller.setRound(roundId);
  }, [controller, roundId]);

  React.useLayoutEffect(
    () => controller.setInterventionHost(hostRef?.current, "inside-top"),
    [controller, hostRef],
  );

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (presentersDisabled) return;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextEntryTarget(event.target)) return;
      const presenterKey = resolvePresenterShortcut(event);
      if (!presenterKey || !controller.request(presenterKey)) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller, presentersDisabled]);

  return (
    <div
      className={`mt-2 flex-none border-t pt-2 ${
        darkMode ? "border-slate-700" : "border-slate-300"
      }`}
      style={{ containerType: "inline-size" }}
      aria-label="Indices des présentateurs"
    >
      <div
        className="grid grid-cols-3 items-start justify-items-center"
        style={{ gap: "clamp(4px, 2cqi, 12px)" }}
      >
        {PRESENTERS.map((presenter, index) => {
          const shortcut = PRESENTER_SHORTCUTS[index];
          return (
            <div key={presenter.key} className="flex min-w-0 flex-col items-center gap-1">
              <PresenterButton
                controller={controller}
                darkMode={darkMode}
                disabled={presentersDisabled}
                presenter={presenter}
                shortcutLabel={shortcut.label}
                size={buttonSize}
                state={presenterState.entries[presenter.key]}
              />
              <kbd
                className={`inline-flex h-6 min-w-7 items-center justify-center rounded-md border border-b-[3px] px-2 font-sans text-xs font-black leading-none shadow-sm ${
                  darkMode
                    ? "border-slate-500 bg-slate-700 text-slate-50"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
                aria-label={`Raccourci clavier ${shortcut.label}`}
              >
                {shortcut.label}
              </kbd>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(DesktopPresenterActionBar);
