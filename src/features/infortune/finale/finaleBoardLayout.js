// Wrapping uses only public tile kinds: it cannot reveal an unbought character.
// Keep words together when they fit; longer words remain readable on mobile.
export function layoutFinaleBoard(tiles, columns) {
  const width = Math.max(1, Math.floor(columns));
  const rows = [];
  let row = [], word = [];
  const flushRow = () => { if (row.length) { rows.push(row); row = []; } };
  const flushWord = () => {
    if (!word.length) return;
    if (row.length && row.length + word.length > width) flushRow();
    for (const tile of word) {
      if (row.length === width) flushRow();
      row.push(tile);
    }
    word = [];
  };
  for (const tile of tiles) {
    if (tile.kind !== "space") { word.push(tile); continue; }
    flushWord();
    if (row.length && row.length < width) row.push(tile);
    else flushRow();
  }
  flushWord(); flushRow();
  return rows;
}
