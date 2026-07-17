export const FACEBOOK_GROUP_ID = "1345680507600003";
export const FACEBOOK_GROUP_URL = `https://www.facebook.com/groups/${FACEBOOK_GROUP_ID}`;

export function openFacebookGroup() {
  if (typeof window === "undefined") return;
  const userAgent = String(window.navigator?.userAgent || "");
  const isAndroid = /Android/i.test(userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);

  if (isAndroid) {
    const fallbackUrl = encodeURIComponent(FACEBOOK_GROUP_URL);
    window.location.href =
      `intent://www.facebook.com/groups/${FACEBOOK_GROUP_ID}` +
      `#Intent;scheme=https;package=com.facebook.katana;` +
      `S.browser_fallback_url=${fallbackUrl};end`;
    return;
  }

  if (isIos) {
    // Le lien universel ouvre l'application Facebook lorsqu'elle est installée,
    // et reste une page web normale dans le cas contraire.
    window.location.href = FACEBOOK_GROUP_URL;
    return;
  }

  const opened = window.open(FACEBOOK_GROUP_URL, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = FACEBOOK_GROUP_URL;
}
