export function hasActiveChatDraft(value) {
  return typeof value === "string" && value.trim().length > 0;
}
