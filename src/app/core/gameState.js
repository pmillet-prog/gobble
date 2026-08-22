export const GAME_STATE_FIELDS = Object.freeze([
  "accepted",
  "allWords",
  "board",
  "cultureThemeChallenge",
  "currentRoomId",
  "dictionary",
  "gridRotationTurns",
  "gridSize",
  "implodeActive",
  "inputLocked",
  "isGridRotating",
  "lastInputMode",
  "lastWords",
  "phase",
  "roomId",
  "score",
  "shake",
  "shakeGrid",
  "showAllWords",
  "sortMode",
  "statusMessage",
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
    dictionary: null,
    gridRotationTurns: 0,
    gridSize: safeGridSize,
    implodeActive: false,
    inputLocked: false,
    isGridRotating: false,
    lastInputMode: "keyboard",
    lastWords: [],
    phase: "lobby",
    roomId,
    score: 0,
    shake: false,
    shakeGrid: false,
    showAllWords: false,
    sortMode: "score",
    statusMessage: null,
    submissionTick: 0,
  });
}
