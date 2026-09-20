import React from "react";
import { createDailyHistoryWordsLoader } from "./createDailyHistoryWordsLoader.js";

export default function useDailyHistoryWords({ installId, section, rankingView }) {
  const loader = React.useMemo(() => createDailyHistoryWordsLoader(), [installId]);
  const [opened, setOpened] = React.useState(null);
  const generation = React.useRef(0);

  React.useEffect(() => {
    setOpened(null);
    return () => {
      generation.current += 1;
      loader.cancel();
    };
  }, [loader, section, rankingView]);

  async function toggle(dateId) {
    const current = ++generation.current;
    if (opened?.dateId === dateId && !opened.error) {
      loader.cancel();
      setOpened(null);
      return;
    }
    setOpened({ dateId, loading: true });
    try {
      const data = await loader.load(dateId, section, installId);
      if (data && current === generation.current) setOpened({ ...data, loading: false });
    } catch (_) {
      if (current === generation.current) setOpened({ dateId, error: true });
    }
  }

  return { opened, toggle };
}
