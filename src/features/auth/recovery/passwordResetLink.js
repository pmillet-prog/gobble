export function consumePasswordResetLink(browser) {
  if (!browser || browser.location.pathname !== "/reset-password") return { active: false, token: "" };
  const params = new URLSearchParams(browser.location.hash.slice(1));
  const candidate = params.get("token") || "";
  // Remove the bearer secret before crash breadcrumbs or the app can read href.
  browser.history.replaceState(null, "", "/reset-password");
  return { active: true, token: /^[a-f0-9]{64}$/.test(candidate) ? candidate : "" };
}

export const passwordResetLink = consumePasswordResetLink(typeof window === "undefined" ? null : window);
