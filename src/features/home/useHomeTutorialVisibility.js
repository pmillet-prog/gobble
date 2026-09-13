import React from "react";
import { getProfileRoundCount, isHomeTutorialEligible } from "./homeTutorialEligibility.js";

// Once the threshold has been reached, it cannot fall again. Avoid requesting
// the profile on subsequent visits to the home screen during this session.
const experiencedAccounts = new Set();

export default function useHomeTutorialVisibility({ isAuthenticated, statusPending, serverUnavailable, userId } = {}) {
  const accountKey = isAuthenticated && !statusPending ? String(userId || "") : "";
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (!accountKey || experiencedAccounts.has(accountKey)) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    fetch(`/api/player-profile/user/${encodeURIComponent(accountKey)}`, {
      credentials: "include", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return;
      const payload = await response.json();
      if (cancelled || !payload.ok || String(payload.profile?.userId) !== accountKey) return;
      const count = getProfileRoundCount(payload.profile);
      if (count === null) return;
      const visible = isHomeTutorialEligible(count);
      if (!visible) experiencedAccounts.add(accountKey);
      setResult({ accountKey, visible });
    }).catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, [accountKey]);

  if (statusPending || serverUnavailable) return false;
  if (!isAuthenticated) return true;
  return !!accountKey && !experiencedAccounts.has(accountKey) && result?.accountKey === accountKey && result.visible;
}
