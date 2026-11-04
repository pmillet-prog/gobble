import React from "react";
import { loadInfortuneContestants } from "./loadInfortuneContestants.js";

export function useInfortuneContestants(plateau) {
  const [resolved, setResolved] = React.useState(null);
  React.useEffect(() => {
    if (!plateau) return;
    let active = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 6000);
    loadInfortuneContestants(plateau.opponents, { signal: controller.signal }).catch(() => plateau.opponents)
      .then(contestants => { if (active) setResolved({ id: plateau.id, contestants }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [plateau]);
  return { loading: !!plateau && resolved?.id !== plateau.id,
    contestants: plateau && resolved?.id === plateau.id ? resolved.contestants : undefined };
}
