// Only public tile kinds define words. Revealing a letter never moves the board.
function boardWords(tiles) {
  const words = []; let word = null, separator = null;
  for (const tile of tiles) {
    if (tile.kind === 'space') { word = null; separator = tile; continue; }
    if (!word) { word = { tiles: [], separator }; words.push(word); separator = null; }
    word.tiles.push(tile);
  }
  return words;
}
const wordWidth = words => Math.max(1, ...words.map(word => word.tiles.length));

function packWords(words, width, height, start = 0, stepped = false) {
  const rows = Array.from({ length: height }, () => []); let cursor = 0;
  for (let i = start; i < height && cursor < words.length; i++) {
    const capacity = width - (stepped && (i === 0 || i === height - 1) ? 2 : 0), row = rows[i];
    while (cursor < words.length) {
      const word = words[cursor], separator = row.length && word.separator;
      if (row.length + (separator ? 1 : 0) + word.tiles.length > capacity) break;
      if (separator) row.push(separator);
      row.push(...word.tiles); cursor++;
    }
  }
  return cursor === words.length ? rows : null;
}

export function layoutFinaleBoard(tiles, columns) {
  const words = boardWords(tiles), width = Math.max(1, Math.floor(columns), wordWidth(words));
  return packWords(words, width, Math.max(1, words.length)).filter(row => row.length);
}

function frameWords(words, columns) {
  const width = Math.max(4, Math.floor(columns), wordWidth(words));
  const length = words.reduce((sum, word) => sum + word.tiles.length, 0);
  for (let height = Math.max(4, Math.ceil(length / width)); ; height++) {
    let content = packWords(words, width, height, 0, true);
    if (!content) continue;
    const last = content.findLastIndex(row => row.length);
    const top = Math.floor((height - last - 1) / 2);
    if (top > 0) content = packWords(words, width, height, top, true) || content;
    return content.map((row, rowIndex) => {
      const left = Math.floor((width - row.length) / 2);
      return Array.from({ length: width }, (_, columnIndex) => row[columnIndex - left] || {
        index: `padding-${rowIndex}-${columnIndex}`, kind: 'padding', character: null,
      });
    });
  }
}

// Only the first and last row lose their corners. Every middle row can use the
// full width, and a word is never split to obtain a larger cell.
export function frameFinaleBoard(tiles, columns) { return frameWords(boardWords(tiles), columns); }

export function fitFinaleBoard(tiles, { width, height, aspect = .79 }) {
  const words = boardWords(tiles), minimum = Math.max(10, wordWidth(words));
  let best = null;
  for (let columns = minimum; columns <= Math.max(32, minimum + 2); columns++) {
    const rows = frameWords(words, columns);
    const cell = Math.max(1, Math.min(46, (width - (columns - 1) * 2) / columns,
      (height - (rows.length - 1) * 2) / rows.length * aspect));
    if (!best || cell > best.cell + .01) best = { columns, rows, cell,
      width: cell * columns + (columns - 1) * 2 };
  }
  return best;
}
