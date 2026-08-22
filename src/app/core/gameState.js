export const GAME_STATE_FIELDS = Object.freeze([
  "allWords",
  "board",
  "cultureThemeChallenge",
  "currentRoomId",
  "gridRotationTurns",
  "gridSize",
  "implodeActive",
  "inputLocked",
  "isGridRotating",
  "phase",
  "roomId",
  "showAllWords",
]);

export const GAME_STATE_FIELD_SET = new Set(GAME_STATE_FIELDS);

function createEmptyBoard(gridSize) {
  return Array(gridSize * gridSize).fill(Object.freeze({ letter: "?", bonus: null }));
}

export function createInitialGameState({ gridSize = 4, roomId = "room-4x4" } = {}) {
  const safeGridSize = Number.isInteger(gridSize) && gridSize > 0 ? gridSize : 4;
  return Object.freeze({
    allWords: [],
    board: createEmptyBoard(safeGridSize),
    cultureThemeChallenge: null,
    currentRoomId: null,
    gridRotationTurns: 0,
    gridSize: safeGridSize,
    implodeActive: false,
    inputLocked: false,
    isGridRotating: false,
    phase: "lobby",
    roomId,
    showAllWords: false,
  });
}
