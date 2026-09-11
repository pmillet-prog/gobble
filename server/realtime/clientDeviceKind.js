export function getClientDeviceKind({ mobileHint = "", userAgent = "" } = {}) {
  const hint = String(mobileHint || "").trim();
  if (hint === "?1" || hint === "1") return "mobile";
  if (hint === "?0" || hint === "0") return "desktop";
  const ua = String(userAgent || "");
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Silk|Kindle/i.test(ua)
    ? "mobile"
    : "desktop";
}

export function getSocketDeviceKind(socket) {
  const headers = socket?.handshake?.headers || {};
  return getClientDeviceKind({
    mobileHint: headers["sec-ch-ua-mobile"],
    userAgent: headers["user-agent"],
  });
}
