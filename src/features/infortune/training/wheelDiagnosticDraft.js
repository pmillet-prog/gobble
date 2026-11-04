export const WHEEL_DIAGNOSTIC_DRAFT_KEY = "gobble.wheel-diagnostic.pending.v1";
export function readWheelDiagnosticDraft(storage) {
  try {
    const draft = JSON.parse(storage?.getItem(WHEEL_DIAGNOSTIC_DRAFT_KEY));
    return draft?.version === 1 && typeof draft.id === "string" && Array.isArray(draft.runs)
      && draft.runs.length > 0 && draft.runs.length <= 8 && draft.environment ? draft : null;
  } catch { return null; }
}
export function saveWheelDiagnosticDraft(value) {
  try { sessionStorage.setItem(WHEEL_DIAGNOSTIC_DRAFT_KEY, JSON.stringify(value)); } catch {}
}
