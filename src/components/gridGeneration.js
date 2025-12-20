const LETTER_BAG =
  "EEEEEEEEEEEEEEAAAAAAAAAAIIIIIIIIOOOOONNNNNNRRRRRRTTTTTLLLSSSSSSSUUUUUDDDDGGGBCMFPPHVWYKJXQZZ";

export function randomLetter() {
  const letter = LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

export function generateGrid(gridSize) {
  const T = gridSize * gridSize;
  const base = Array(T)
    .fill(null)
    .map(() => ({ letter: randomLetter(), bonus: null }));

  const shuffled = [...Array(T).keys()].sort(() => 0.5 - Math.random());
  const bonuses = ["L2", "L3", "W2", "W3"];
  bonuses.forEach((bonus, i) => {
    base[shuffled[i]].bonus = bonus;
  });

  return base;
}
