// shared/gameLogic.js
// Logique pure du Boggle : gÃ©nÃ©ration de grille, voisinage, scoring, solveur.

// -----------------
// Constantes
// -----------------
export const SIZE = 5;

export const LETTER_BAG =
  "EEEEEEAAAAAAIIIIIIOOOOONNNNNRRRRRTTTTTLLLLSSSSSSSUUUUDDDDGGBBCCMMFPPHVWYKJXQZ";

export const SCRABBLE_FR = {
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

// -----------------
// Normalisation et utilitaires
// -----------------
export function normalizeWord(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/gi, "oe") // au cas ou tu corriges le dico plus tard
    .replace(/\u00e6/gi, "ae")
    .replace(/['\" -]/g, "")
    .toLowerCase();
}

export function randomLetter() {
  const letter = LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

// retourne les indices voisins (8-neighborhood) dâ€™une case i dans la grille 1D
export function neighbors(i, size = SIZE, total = null) {
  // si size n'est pas fourni, on tente de le dÃ©duire du total de cases
  const n = size || (total ? Math.sqrt(total) : SIZE);
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

// -----------------
// GÃ©nÃ©ration de la grille
// -----------------

// Reproduit la logique de startGame() dans ton App.jsx :
// - 25 tuiles { letter, bonus }
// - 4 bonus placÃ©s alÃ©atoirement : L2, L3, M2, M3
export function generateGrid(size = SIZE) {
  const T = size * size;

  const base = Array(T)
    .fill(null)
    .map(() => ({ letter: randomLetter(), bonus: null }));

  const shuffled = [...Array(T).keys()].sort(() => 0.5 - Math.random());
  const bonuses = ["L2", "L3", "M2", "M3"];
  bonuses.forEach((bonus, i) => {
    base[shuffled[i]].bonus = bonus;
  });

  return base;
}

// -----------------
// Scoring
// -----------------

export function tileScore(tile) {
  if (tile.letter === "Qu") {
    return SCRABBLE_FR["q"] + SCRABBLE_FR["u"];
  }
  return SCRABBLE_FR[tile.letter.toLowerCase()] || 0;
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

export function computeScore(wordNorm, path, board, special = null) {
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
    } else {
      base += letterValue;
    }
  }

  const len = wordNorm.length;
  const bonusLength =
    len >= 8 ? 15 :
    len === 7 ? 10 :
    len === 6 ? 6 :
    len === 5 ? 3 : 0;

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

// -----------------
// Pathfinder / solveur
// -----------------

// Chemin â€œoptimisÃ© scoreâ€ pour un mot donnÃ© (wordNorm dÃ©jÃ  normalisÃ©)
export function findBestPathForWord(board, wordNorm, special = null) {
  const labels = board.map((cell) =>
    cell.letter === "Qu" ? "qu" : cell.letter.toLowerCase()
  );
  const total = board.length;
  const size = Math.sqrt(total);
  const used = new Array(total).fill(false);

  let bestPath = null;
  let bestScore = -Infinity;

  function dfs(idx, pos, path) {
    const label = labels[idx];
    if (!wordNorm.startsWith(label, pos)) return;

    const nextPos = pos + label.length;
    const nextPath = [...path, idx];

    if (nextPos === wordNorm.length) {
      const score = computeScore(wordNorm, nextPath, board, special);
      if (score > bestScore) {
        bestScore = score;
        bestPath = nextPath;
      }
      return;
    }

    used[idx] = true;
    for (const nb of neighbors(idx, size, total)) {
      if (!used[nb]) dfs(nb, nextPos, nextPath);
    }
    used[idx] = false;
  }

  for (let i = 0; i < total; i++) {
    dfs(i, 0, []);
  }

  return bestPath;
}

export function pathMatchesWord(board, wordNorm, path) {
  if (!Array.isArray(path) || path.length === 0) return false;
  const total = board.length;
  const size = Math.sqrt(total);
  if (!Number.isFinite(size) || size <= 0) return false;

  const used = new Set();
  let pos = 0;
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (!Number.isInteger(idx) || idx < 0 || idx >= total) return false;
    if (used.has(idx)) return false;
    if (i > 0) {
      const prev = path[i - 1];
      const nbs = neighbors(prev, size, total);
      if (!nbs.includes(idx)) return false;
    }
    const tile = board[idx];
    if (!tile) return false;
    const label = tile.letter === "Qu" ? "qu" : String(tile.letter || "").toLowerCase();
    if (!label || !wordNorm.startsWith(label, pos)) return false;
    pos += label.length;
    if (pos > wordNorm.length) return false;
    used.add(idx);
  }

  return pos === wordNorm.length;
}
// Filtre un dico (Set de mots normalisÃ©s) en ne gardant
// que les mots compatibles avec les lettres prÃ©sentes sur la grille.
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

// Solveur complet : renvoie une Map(wordNorm -> { path, pts })
export function solveGrid(board, dictionary, special = null) {
  if (!dictionary) {
    return new Map();
  }

  const filtered = filterDictionary(dictionary, board);
  const found = new Map();

  for (const word of filtered) {
    if (word.length < 3 || word.length > 25) continue;
    const path = findBestPathForWord(board, word, special);
    if (path) {
      const pts = computeScore(word, path, board, special);
      found.set(word, { path, pts });
    }
  }

  return found;
}

// Fonction pratique pour valider / scorer UN mot cÃ´tÃ© serveur
// - retourne null si le mot nâ€™est pas sur la grille
// - sinon { norm, path, pts }
export function scoreWordOnGrid(rawWord, board, special = null) {
  const norm = normalizeWord(rawWord);
  if (!norm || norm.length < 3) return null;

  const path = findBestPathForWord(board, norm, special);
  if (!path) return null;

  const pts = computeScore(norm, path, board, special);
  return { norm, path, pts };
}

export function scoreWordOnGridWithPath(rawWord, board, path, special = null) {
  const norm = normalizeWord(rawWord);
  if (!norm || norm.length < 3) return null;
  if (!pathMatchesWord(board, norm, path)) return null;
  const pts = computeScore(norm, path, board, special);
  return { norm, path, pts };
}


