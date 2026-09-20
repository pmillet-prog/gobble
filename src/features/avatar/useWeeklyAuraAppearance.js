import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getWeeklyAuraDeadline } from "../../../shared/avatarWeeklyAuras.js";
import { weeklyAuraStore } from "./weeklyAuraStore.js";

export default function useWeeklyAuraAppearance(value) {
  const snapshot = useSyncExternalStore(weeklyAuraStore.subscribe, weeklyAuraStore.getSnapshot, () => null);
  const deadline = getWeeklyAuraDeadline(value, snapshot);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!deadline || deadline <= Date.now()) return;
    const check = () => { if (Date.now() >= deadline) redraw(count => count + 1); };
    const timer = setTimeout(check, Math.min(2147483647, deadline - Date.now() + 10));
    document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", check); };
  }, [deadline]);
  const expired = deadline > 0 && deadline <= Date.now();
  return useMemo(() => expired ? { ...value, auras: "", weeklyAura: undefined } : value, [value, expired]);
}
