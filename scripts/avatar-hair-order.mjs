// Selection order follows hairstyle length, not the PNG's height (a quiff or
// an updo can be tall). Applied once at import, with no sorting during rendering.
const HAIR_LENGTH_ORDER = [
  // Shaved and short cuts.
  "stubble", "gobble_h07", "buzz", "fade", "highforehead", "recedingtemples",
  "pixie", "gobble_f05", "sidepart", "gobble_h05", "hipster", "gobble_h04",
  "shortcurls", "gobble_h08", "gobble_h01", "spikes", "quiff", "gobble_h02",
  "gobble_h09", "gobble_h03", "punk",
  // Medium lengths, bobs and fuller curls.
  "shag", "gobble_h06", "bob", "gobble_f07", "wavybob", "gobble_f03",
  "afro", "gobble_f10", "goth",
  // Long hair, then long hair worn up or tied back.
  "longstraight", "gobble_f02", "longwaves", "gobble_f09", "hippie",
  "ponytail", "gobble_f04", "bun", "gobble_h10", "gobble_f01", "gobble_f06", "gobble_f08",
];
const ranks = new Map(HAIR_LENGTH_ORDER.map((id, index) => [id, index]));

export function orderAvatarHair(parts) {
  return [...parts].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
}
