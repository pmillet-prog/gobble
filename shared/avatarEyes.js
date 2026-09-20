export const MINIMAL_AVATAR_EYES = Object.freeze([
  { id: "dots", label: "Petits points", style: "dots", diameter: 25 },
  { id: "iris_only", label: "Iris et pupilles", style: "iris_only", diameter: 62 },
]);
export const hasAvatarEyelids = id => !!id && !MINIMAL_AVATAR_EYES.some(part => part.id === id);

export function withMinimalAvatarEyes(parts = []) {
  const reference = parts.find(part => part.id === "open");
  if (!reference) return parts;
  return [...parts.filter(part => !MINIMAL_AVATAR_EYES.some(extra => extra.id === part.id)), ...MINIMAL_AVATAR_EYES.map(part => ({
    id: part.id, label: part.label, minimalStyle: part.style,
    file: `extras/eyes-${part.id}.svg`, anchor: { x: 512, y: 390 },
    eye_centers: [{ side: "left", x: 430, y: 390, iris_diameter: part.diameter }, { side: "right", x: 594, y: 390, iris_diameter: part.diameter }],
    iris: reference.iris, layers: part.style === "iris_only" ? reference.layers : {},
    masks: part.style === "iris_only" ? { iris_color: reference.masks.iris_color } : {},
  }))];
}
