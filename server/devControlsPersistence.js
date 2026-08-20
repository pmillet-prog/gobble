export function extractPersistedDevControls(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const wrappedControls = raw.controls;
  if (
    wrappedControls &&
    typeof wrappedControls === "object" &&
    !Array.isArray(wrappedControls)
  ) {
    return wrappedControls;
  }
  return raw;
}
