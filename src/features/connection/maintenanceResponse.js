export const MAINTENANCE_RESPONSE_EVENT = "gobble:maintenance-response";

export function isMaintenanceResponse(status, body) {
  return status >= 500 && /<meta\s+name=["']gobble-page["']\s+content=["']maintenance["']\s*\/?\s*>/i.test(String(body || ""));
}

export function reportMaintenanceResponse(status, body) {
  if (isMaintenanceResponse(status, body) && typeof window !== "undefined") {
    window.dispatchEvent(new Event(MAINTENANCE_RESPONSE_EVENT));
  }
}
