import { useEffect } from "react";

// A single deadline while the atelier is open; no server polling.
export default function useAvatarInventoryExpiry(temporary, setInventory) {
  useEffect(() => {
    const deadlines = Object.values(temporary || {});
    if (!deadlines.length) return;
    const expire = () => setInventory(current => {
      if (!current) return current;
      const entries = Object.entries(current.temporary || {}), valid = entries.filter(([, until]) => until > Date.now());
      return valid.length === entries.length ? current : { ...current, temporary: Object.fromEntries(valid) };
    });
    const timer = setTimeout(expire, Math.max(0, Math.min(...deadlines) - Date.now() + 10));
    document.addEventListener("visibilitychange", expire);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", expire); };
  }, [temporary, setInventory]);
}
