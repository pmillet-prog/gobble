import React from "react";

import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import LiveFeed, { buildMixedFeed } from "../../components/LiveFeed.jsx";

const PROGRESS_BANNER_FIELD = Object.freeze(["bannerText"]);

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
  const progress = useFeatureRuntime("progress");
  const { bannerText } = useFeatureFields(progress, PROGRESS_BANNER_FIELD);
  return (
    <LiveFeed
      {...feedProps}
      bannerText={feedProps.bannerText ?? bannerText}
      items={items}
    />
  );
}
