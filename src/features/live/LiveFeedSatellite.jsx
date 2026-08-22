import React from "react";

import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import LiveFeed, { buildMixedFeed } from "../../components/LiveFeed.jsx";

export function useLiveFeedItems(limit = 0) {
  const announcements = useApplicationSelector(
    (state) => state.realtime.announcements
  );
  const lastWords = useApplicationSelector((state) => state.game.lastWords);
  return React.useMemo(() => {
    const items = buildMixedFeed({ announcements, lastWords });
    const safeLimit = Math.max(0, Number(limit) || 0);
    return safeLimit > 0 ? items.slice(-safeLimit) : items;
  }, [announcements, lastWords, limit]);
}

export default function LiveFeedSatellite({ limit = 0, ...feedProps }) {
  const items = useLiveFeedItems(limit);
  return <LiveFeed {...feedProps} items={items} />;
}

