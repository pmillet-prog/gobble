export const GAME_STATE_FIELDS = Object.freeze([
  "accepted",
  "allWords",
  "board",
  "cultureThemeChallenge",
  "currentRoomId",
  "gridRotationTurns",
  "gridSize",
  "implodeActive",
  "inputLocked",
  "isGridRotating",
  "lastWords",
  "phase",
  "roomId",
  "score",
  "showAllWords",
  "submissionTick",
]);

export const GAME_STATE_FIELD_SET = new Set(GAME_STATE_FIELDS);

function createEmptyBoard(gridSize) {
  return Array(gridSize * gridSize).fill(Object.freeze({ letter: "?", bonus: null }));
}

export function createInitialGameState({ gridSize = 4, roomId = "room-4x4" } = {}) {
  const safeGridSize = Number.isInteger(gridSize) && gridSize > 0 ? gridSize : 4;
  return Object.freeze({
    accepted: [],
    allWords: [],
    board: createEmptyBoard(safeGridSize),
    cultureThemeChallenge: null,
    currentRoomId: null,
    gridRotationTurns: 0,
    gridSize: safeGridSize,
    implodeActive: false,
    inputLocked: false,
    isGridRotating: false,
    lastWords: [],
    phase: "lobby",
    roomId,
    score: 0,
    showAllWords: false,
    submissionTick: 0,
  });
}
