// shared/gameLogic.js
// Logique pure du Boggle : génération de grille, voisinage, scoring, solveur.

// -----------------
// Constantes
// -----------------
export const SIZE = 5;

export const LETTER_BAG =
  "EEEEEEEEAAAAAAAAAIIIIIIOOOOONNNNNNRRRRRRTTTTTLLLLSSSSSSSUUUUUDDDDGGBBCCMMFPPHVWYKJXQZ";

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
    .replace(/œ/g, "oe")   // au cas où tu corriges le dico plus tard
    .replace(/æ/g, "ae")
    .replace(/['\" -]/g, "")
    .toLowerCase();
}

export function randomLetter() {
  const letter = LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

// retourne les indices voisins (8-neighborhood) d’une case i dans la grille 1D
export function neighbors(i, size = SIZE, total = null) {
  // si size n'est pas fourni, on tente de le déduire du total de cases
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
// Génération de la grille
// -----------------

// Reproduit la logique de startGame() dans ton App.jsx :
// - 25 tuiles { letter, bonus }
// - 4 bonus placés aléatoirement : L2, L3, M2, M3
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

export function computeScore(wordNorm, path, board) {
  let base = 0;
  let wordMultiplier = 1;

  for (const idx of path) {
    const tile = board[idx];
    const bonus = tile.bonus;
    const letterValue = tileScore(tile);

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

// Chemin “optimisé score” pour un mot donné (wordNorm déjà normalisé)
export function findBestPathForWord(board, wordNorm) {
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
      const score = computeScore(wordNorm, nextPath, board);
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

// Filtre un dico (Set de mots normalisés) en ne gardant
// que les mots compatibles avec les lettres présentes sur la grille.
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
export function solveGrid(board, dictionary) {
  if (!dictionary) {
    return new Map();
  }

  const filtered = filterDictionary(dictionary, board);
  const found = new Map();

  for (const word of filtered) {
    if (word.length < 3 || word.length > 25) continue;
    const path = findBestPathForWord(board, word);
    if (path) {
      const pts = computeScore(word, path, board);
      found.set(word, { path, pts });
    }
  }

  return found;
}

// Fonction pratique pour valider / scorer UN mot côté serveur
// - retourne null si le mot n’est pas sur la grille
// - sinon { norm, path, pts }
export function scoreWordOnGrid(rawWord, board) {
  const norm = normalizeWord(rawWord);
  if (!norm || norm.length < 3) return null;

  const path = findBestPathForWord(board, norm);
  if (!path) return null;

  const pts = computeScore(norm, path, board);
  return { norm, path, pts };
}

