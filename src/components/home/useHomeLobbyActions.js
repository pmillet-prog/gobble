import React from "react";

const HOME_ACTION_NAMES = [
  "onDismissResume",
  "onOpenAccount",
  "onOpenChat",
  "onOpenDaily",
  "onOpenDuel",
  "onOpenPlayers",
  "onOpenSettings",
  "onOpenStats",
  "onOpenVault",
  "onOpenWeeklyRecap",
  "onPlay",
  "onResume",
];

export default function useHomeLobbyActions(actions) {
  const actionsRef = React.useRef(actions);
  React.useLayoutEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  return React.useMemo(
    () =>
      Object.fromEntries(
        HOME_ACTION_NAMES.map((actionName) => [
          actionName,
          (...args) => actionsRef.current?.[actionName]?.(...args),
        ])
      ),
    []
  );
}
