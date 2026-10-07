import React from "react";
import { chalkboardSeenKey, getUnseenChalkboardEntries, markChalkboardSeen, readChalkboardSeen } from "./chalkboardSeen.js";
import { getChalkboardUnseenRegions } from "./chalkboardUnseenRegions.js";

function sameMarker(a, b) {
  const entriesA = a?.seenEntries || [], entriesB = b?.seenEntries || [];
  return a?.weekId === b?.weekId && a?.latestEntry === b?.latestEntry &&
    entriesA.length === entriesB.length && entriesA.every((z, index) => z === entriesB[index]);
}

export default function useChalkboardUnseenRegions({ accountId, snapshot, viewport, enabled }) {
  const initialSeen = React.useMemo(() => readChalkboardSeen(accountId), [accountId]);
  const [saved, setSaved] = React.useState(() => ({ accountId, marker: initialSeen }));
  const [documentVisible, setDocumentVisible] = React.useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const seen = saved.accountId === accountId ? saved.marker : initialSeen;
  const updateSeen = React.useCallback(marker => {
    setSaved(current => current.accountId === accountId && sameMarker(current.marker, marker)
      ? current : { accountId, marker });
  }, [accountId]);
  const unseen = React.useMemo(() => getUnseenChalkboardEntries(snapshot, seen),
    [snapshot.interventions, snapshot.weekId, seen]);
  const regions = React.useMemo(() => getChalkboardUnseenRegions(unseen, viewport),
    [unseen, viewport.width, viewport.height, viewport.scrollLeft, viewport.scale]);

  React.useEffect(() => {
    const onStorage = event => {
      if (event.key === chalkboardSeenKey(accountId) || event.key === null) updateSeen(readChalkboardSeen(accountId));
    };
    const onVisibility = () => setDocumentVisible(document.visibilityState !== "hidden");
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [accountId, updateSeen]);

  React.useEffect(() => {
    if (!enabled || !documentVisible || viewport.width <= 1 || viewport.height <= 1 || !(viewport.scale > 0)) return undefined;
    // Let the canvas paint this zone before acknowledging it. Moving away or
    // reopening the loader cancels the acknowledgement of an unseen zone.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => updateSeen(markChalkboardSeen(accountId, snapshot, regions.visible)));
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId, enabled, documentVisible, snapshot, regions, updateSeen, viewport.width, viewport.height, viewport.scale]);

  return { left: regions.left, right: regions.right };
}
