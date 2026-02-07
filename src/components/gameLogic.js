export function normalizeWord(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/gi, "oe")
    .replace(/\u00e6/gi, "ae")
    .replace(/['" -]/g, "")
    .toLowerCase();
}

export function neighbors(i, size) {
  const n = size || 4;
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) {
        out.push(rr * n + cc);
      }
    }
  }
  return out;
}

/**
 * Pathfinder simple (chemin valide, sans optimisation de score).
 */
export function findPathForWord(board, targetNorm) {
  const labels = board.map((cell) =>
    cell.letter === "Qu" ? "qu" : cell.letter.toLowerCase()
  );
  const total = board.length;
  const size = Math.max(1, Math.round(Math.sqrt(total)));
  const used = new Array(total).fill(false);
  let bestPath = null;

  function dfs(idx, pos, path) {
    const label = labels[idx];
    if (!targetNorm.startsWith(label, pos)) return;
    const nextPos = pos + label.length;
    const nextPath = [...path, idx];

    if (nextPos === targetNorm.length) {
      bestPath = nextPath;
      return;
    }

    used[idx] = true;
    for (const nb of neighbors(idx, size)) {
      if (!used[nb]) dfs(nb, nextPos, nextPath);
    }
    used[idx] = false;
  }

  for (let i = 0; i < total; i++) {
    dfs(i, 0, []);
    if (bestPath) break;
  }

  return bestPath;
}

export function filterDictionary(dictionary, board) {
  const boardLetters = new Set(
    board.map((cell) =>
      cell.letter === "Qu" ? "qu" : cell.letter.toLowerCase()
    )
  );

  const filtered = new Set(
    [...dictionary].filter((word) => {
      let i = 0;
      while (i < word.length) {
        const char = word[i] === "q" && word[i + 1] === "u" ? "qu" : word[i];
        i += char === "qu" ? 2 : 1;
        if (!boardLetters.has(char)) return false;
      }
      return true;
    })
  );

  return filtered;
}

const SCRABBLE_FR = {
  a: 1,
  e: 1,
  i: 1,
  l: 1,
  n: 1,
  o: 1,
  r: 1,
  s: 1,
  t: 1,
  u: 1,
  d: 2,
  g: 2,
  m: 2,
  b: 3,
  c: 3,
  p: 3,
  f: 4,
  h: 4,
  v: 4,
  j: 8,
  q: 10,
  k: 10,
  w: 10,
  x: 10,
  y: 10,
  z: 10,
};

export function tileScore(tile) {
  if (tile.letter === "Qu") return SCRABBLE_FR["q"] + SCRABBLE_FR["u"];
  return SCRABBLE_FR[tile.letter.toLowerCase()] || 0;
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

export function computeScore(word, path, board, special = null) {
  let base = 0;
  let wordMultiplier = 1;
  const bonusKey =
    special && special.bonusLetter ? normalizeLetterKey(special.bonusLetter) : null;
  const bonusValue =
    special && Number.isFinite(special.bonusLetterScore) ? special.bonusLetterScore : null;
  const disableBonuses = !!special?.disableBonuses;

  for (const idx of path) {
    const tile = board[idx];
    const bonus = tile.bonus;
    const letterValue =
      bonusKey && bonusValue != null && normalizeLetterKey(tile.letter) === bonusKey
        ? bonusValue
        : tileScore(tile);

    if (disableBonuses) {
      base += letterValue;
      continue;
    }

    if (bonus === "L2") base += letterValue * 2;
    else if (bonus === "L3") base += letterValue * 3;
    else if (bonus === "M2") {
      base += letterValue;
      wordMultiplier *= 2;
    } else if (bonus === "M3") {
      base += letterValue;
      wordMultiplier *= 3;
    } else base += letterValue;
  }

  const bonusLength =
    word.length >= 8
      ? 15
      : word.length === 7
      ? 10
      : word.length === 6
      ? 6
      : word.length === 5
      ? 3
      : 0;

  return (base + bonusLength) * wordMultiplier;
}

export function summarizeBonuses(path, board) {
  const counts = { L2: 0, L3: 0, M2: 0, M3: 0 };
  for (const idx of path) {
    const bonus = board[idx]?.bonus;
    if (bonus && counts[bonus] !== undefined) counts[bonus]++;
  }
  return counts;
}

/**
 * Pathfinder optimisé : cherche le chemin qui maximise le score.
 */
export function findBestPathForWord(board, targetNorm, special = null) {
  const labels = board.map((cell) =>
    cell.letter === "Qu" ? "qu" : cell.letter.toLowerCase()
  );
  const total = board.length;
  const size = Math.max(1, Math.round(Math.sqrt(total)));
  const used = new Array(total).fill(false);

  let bestPath = null;
  let bestScore = -Infinity;

  function dfs(idx, pos, path) {
    const label = labels[idx];
    if (!targetNorm.startsWith(label, pos)) return;

    const nextPos = pos + label.length;
    const nextPath = [...path, idx];

    if (nextPos === targetNorm.length) {
      const score = computeScore(targetNorm, nextPath, board, special);
      if (score > bestScore) {
        bestScore = score;
        bestPath = nextPath;
      }
      return;
    }

    used[idx] = true;
    for (const nb of neighbors(idx, size)) {
      if (!used[nb]) dfs(nb, nextPos, nextPath);
    }
    used[idx] = false;
  }

  for (let i = 0; i < total; i++) {
    dfs(i, 0, []);
  }

  return bestPath;
}

export function solveAll(board, dictionary, special = null) {
  const found = new Map();
  for (const word of dictionary) {
    if (word.length < 2 || word.length > 25) continue;
    const path = findBestPathForWord(board, word, special);
    if (path) {
      found.set(word, path);
    }
  }
  return found;
}
