import { buildInterventionTextSegments, splitInterventionText } from "./spriteInterventionAnimation.js";

export function getInterventionWord(segment, highlights) {
  const text = segment.text.trim();
  // Only explicit answer/definition highlights are words. Automatic emphasis
  // also includes scores, shouted phrases and punctuation.
  if (!segment.highlighted || !/^[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*$/u.test(text)) return null;
  return (highlights || []).find(word =>
    String(word).trim().toLocaleLowerCase("fr") === text.toLocaleLowerCase("fr")) ? text : null;
}

export function mountTypedText(container, text, highlights, onOpenWord = null) {
  const doc = container?.ownerDocument;
  if (!doc) return { units: [], revealAll() {} };
  container.replaceChildren();
  const units = [];
  const writers = [];
  for (const segment of buildInterventionTextSegments(text, highlights)) {
    const word = onOpenWord ? getInterventionWord(segment, highlights) : null;
    const element = doc.createElement(word ? "button" : "span");
    if (segment.highlighted) element.className = "sprite-intervention-highlight";
    if (word) {
      element.className += " sprite-intervention-word";
      element.type = "button";
      element.disabled = true;
      element.onclick = event => {
        event.stopPropagation();
        if (!element.disabled) onOpenWord(word);
      };
    }
    const node = doc.createTextNode("");
    element.append(node);
    container.append(element);
    const writer = {
      fullText: segment.text, node,
      write(value) {
        node.data = value;
        if (word && value === segment.text) {
          element.disabled = false;
          element.setAttribute("aria-label", `Voir la définition de ${word}`);
          element.title = "Définition et coffre-fort";
        }
      },
    };
    writers.push(writer);
    for (const unit of splitInterventionText(segment.text)) units.push({ unit, writer });
  }
  return { units, revealAll() { for (const writer of writers) writer.write(writer.fullText); } };
}
