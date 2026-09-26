export function extractPersistedDevControls(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const wrappedControls = raw.controls;
  if (
    wrappedControls &&
    typeof wrappedControls === "object" &&
    !Array.isArray(wrappedControls)
  ) {
    return { ...wrappedControls, maintenanceMode: false };
  }
  // Maintenance belongs to the running process, never to the next deployment.
  return { ...raw, maintenanceMode: false };
}

export function buildPersistedDevControls(controls, updatedAt = Date.now()) {
  return { version: 1, updatedAt, controls: { ...controls, maintenanceMode: false } };
}
