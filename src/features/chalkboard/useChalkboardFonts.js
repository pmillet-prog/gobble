import React from "react";
import { fetchChalkboardFonts } from "./chalkboardApi.js";
import { loadChalkboardFont } from "./chalkboardFonts.js";

export default function useChalkboardFonts() {
  const [fonts, setFonts] = React.useState([]);
  const [error, setError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    setError(false);
    const load = async () => {
      try {
        const catalog = await fetchChalkboardFonts({ signal: controller.signal });
        const results = await Promise.allSettled((catalog.fonts || []).map(loadChalkboardFont));
        const available = results.filter(result => result.status === "fulfilled").map(result => result.value);
        if (!available.length) throw new Error("no_chalkboard_fonts");
        if (!controller.signal.aborted) setFonts(available);
      } catch (error) {
        if (!controller.signal.aborted) setError(true);
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);
  const retry = React.useCallback(() => setAttempt(value => value + 1), []);
  return { fonts, ready: fonts.length > 0, error, retry };
}
