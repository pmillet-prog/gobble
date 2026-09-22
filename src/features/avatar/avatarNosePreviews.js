// Visible alpha bounds (>= 8/255) in the original 1024px nose PNGs.
// Only shop thumbnails are cropped; avatar rendering keeps the full image.
const BOUNDS = {
  short: [466, 384, 559, 471], long: [487, 340, 538, 471],
  wide: [449, 394, 575, 471], upturned: [470, 388, 554, 470],
  aquiline: [471, 345, 553, 470], flat: [458, 393, 566, 470],
  bulbous: [464, 358, 560, 470], straight: [473, 352, 551, 470],
  pointed: [477, 365, 548, 470], asymmetric: [468, 365, 556, 470],
};

export function withAvatarNosePreviews(catalog) {
  return { ...catalog, families: { ...catalog.families, nose: (catalog.families.nose || []).map(part => {
    if (part.preview || !BOUNDS[part.id]) return part;
    const [left, top, right, bottom] = BOUNDS[part.id];
    // Same 6:5 crop and breathing room as the new noses.
    const height = Math.max(bottom - top, (right - left) / 1.2) * 1.12;
    const width = height * 1.2;
    return { ...part, preview: { width: 1024, height: 1024,
      viewBox: [(left + right - width) / 2, (top + bottom - height) / 2, width, height] } };
  }) } };
}
