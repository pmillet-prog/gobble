export function isAudioPageHidden(documentTarget = globalThis.document) {
  return documentTarget?.hidden === true || documentTarget?.visibilityState === 'hidden';
}
