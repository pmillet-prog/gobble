// Stay below the existing 1 MiB HTTP limit, including normalized coordinates.
// Shared by the editor and server so publication never silently drops ink.
export const CHALKBOARD_LIMITS = Object.freeze({ maxElements: 256, maxPoints: 16000, maxStrokePoints: 1400 });

export function getChalkboardDraftUsage(elements) {
  return {
    elements: elements.length,
    points: elements.reduce((sum, element) => sum + (element?.points?.length || 0), 0),
  };
}

export function chalkboardDraftFits(elements) {
  const usage = getChalkboardDraftUsage(elements);
  return usage.elements <= CHALKBOARD_LIMITS.maxElements && usage.points <= CHALKBOARD_LIMITS.maxPoints &&
    elements.every(element => element?.type !== "stroke" || (element.points?.length || 0) <= CHALKBOARD_LIMITS.maxStrokePoints);
}
