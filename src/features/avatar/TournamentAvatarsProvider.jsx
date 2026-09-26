import React from "react";
import { createTournamentAvatarResources } from "./createTournamentAvatarResources.js";

const Context = React.createContext(null);
export const useTournamentAvatarResources = () => React.useContext(Context);

export default function TournamentAvatarsProvider({ children, resources: provided }) {
  const [resources] = React.useState(() => provided || createTournamentAvatarResources());
  const lifetime = React.useRef(0);
  React.useEffect(() => {
    const generation = ++lifetime.current;
    return () => queueMicrotask(() => { if (lifetime.current === generation) resources.dispose(); });
  }, [resources]);
  return <Context.Provider value={resources}>{children}</Context.Provider>;
}

export function useTournamentThumbnail(userId, source) {
  const resources = useTournamentAvatarResources();
  const snapshot = React.useCallback(() => resources?.thumbnail(userId) || null, [resources, userId]);
  const subscribe = React.useCallback(listener => resources?.subscribeThumbnail(userId, listener) || (() => {}), [resources, userId]);
  const thumbnail = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  React.useEffect(() => { resources?.ensureThumbnail(userId, source); }, [resources, userId, source, thumbnail]);
  return thumbnail;
}
