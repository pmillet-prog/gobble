import test from "node:test";
import assert from "node:assert/strict";
import { backspaceGotusInput, createGotusInput, deleteGotusLetter, editGotusInput, moveGotusCursor,
  selectGotusCell, typeGotusLetters } from "./gotusInput.js";

test("a new row prefills its first letter and selects the first empty cell", () => {
  assert.deepEqual(createGotusInput("B"), { draft: "B", activeColumn: 1 });
  assert.deepEqual(createGotusInput(), { draft: "", activeColumn: 0 });
});

test("typing replaces the selected cell without shifting its neighbours", () => {
  const input = selectGotusCell(editGotusInput("BALLON"), 2);
  assert.deepEqual(typeGotusLetters(input, "t"), { draft: "BATLON", activeColumn: 3 });
  assert.deepEqual(typeGotusLetters(createGotusInput("B"), "b"), { draft: "BB", activeColumn: 2 });
});

test("empty cells keep their position and may be filled in any order", () => {
  let input = typeGotusLetters(selectGotusCell(createGotusInput("B"), 4), "on");
  assert.deepEqual(input, { draft: "B   ON", activeColumn: 5 });
  input = typeGotusLetters(selectGotusCell(input, 1), "all");
  assert.deepEqual(input, { draft: "BALLON", activeColumn: 4 });
  assert.deepEqual(editGotusInput("B L ON"), { draft: "B L ON", activeColumn: 1 });
});

test("accented input and ligatures normalize to letters before occupying cells", () => {
  assert.deepEqual(typeGotusLetters(createGotusInput(), "é-Œçà!"), { draft: "EOECA", activeColumn: 5 });
  assert.deepEqual(editGotusInput("bâllôn"), { draft: "BALLON", activeColumn: 5 });
});

test("typing reaches the last cell and never wraps or shifts a full word", () => {
  const input = typeGotusLetters(createGotusInput("B"), "allontrop");
  assert.deepEqual(input, { draft: "BALLON", activeColumn: 5 });
  assert.deepEqual(typeGotusLetters(input, "s"), { draft: "BALLOS", activeColumn: 5 });
});

test("Backspace clears the occupied selection, then goes back from an empty cell", () => {
  let input = backspaceGotusInput(editGotusInput("BALLON"));
  assert.deepEqual(input, { draft: "BALLO", activeColumn: 5 });
  input = backspaceGotusInput(input);
  assert.deepEqual(input, { draft: "BALL", activeColumn: 4 });
  input = backspaceGotusInput(selectGotusCell(editGotusInput("BALLON"), 2));
  assert.deepEqual(input, { draft: "BA LON", activeColumn: 2 });
  assert.deepEqual(backspaceGotusInput(createGotusInput()), { draft: "", activeColumn: 0 });
});

test("Delete leaves a hole without moving or shifting", () => {
  const input = deleteGotusLetter(selectGotusCell(editGotusInput("BALLON"), 0));
  assert.deepEqual(input, { draft: " ALLON", activeColumn: 0 });
  assert.deepEqual(deleteGotusLetter(input), input);
});

test("arrows, Home and End navigate inside the active row", () => {
  let input = moveGotusCursor(createGotusInput("B"), "ArrowLeft");
  assert.equal(input.activeColumn, 0);
  assert.equal(moveGotusCursor(input, "ArrowLeft").activeColumn, 0);
  input = moveGotusCursor(input, "End");
  assert.equal(input.activeColumn, 5);
  assert.equal(moveGotusCursor(input, "ArrowRight").activeColumn, 5);
  assert.equal(moveGotusCursor(input, "Home").activeColumn, 0);
  assert.deepEqual(moveGotusCursor(input, "ArrowDown"), input);
});

test("a new row includes every known letter and selects its first remaining hole", () => {
  const known = ["B", "", "L", "", "", "N"];
  assert.deepEqual(createGotusInput("B", known), { draft: "B L  N", activeColumn: 1 });
  assert.deepEqual(createGotusInput("B", ["B", "A", "", "", "", ""]), { draft: "BA", activeColumn: 2 });
});

test("continuous typing replaces known letters as the cursor passes through them", () => {
  const known = ["B", "", "L", "", "", "N"];
  let input = { ...createGotusInput("B", known), known };
  input = { ...input, ...typeGotusLetters(input, "AR") };
  assert.equal(input.draft, "BAR  N");
  assert.equal(input.activeColumn, 3);
  input = { ...input, ...typeGotusLetters(input, "LOS") };
  assert.equal(input.draft, "BARLOS", "the known final N is also freely replaceable");
});

test("selecting the remaining holes retains known letters without typing them again", () => {
  const known = ["B", "", "L", "", "", "N"];
  let input = { ...createGotusInput("B", known), known };
  input = { ...input, ...typeGotusLetters(input, "A") };
  assert.equal(input.activeColumn, 2, "the cursor moves one cell, even onto a known letter");
  input = { ...input, ...selectGotusCell(input, 3) };
  input = { ...input, ...typeGotusLetters(input, "LO") };
  assert.equal(input.draft, "BALLON");
});

test("a pasted completion preserves a known suffix without requiring its letters", () => {
  const known = ["B", "", "", "", "O", "N"];
  const input = { ...createGotusInput("B", known), known };
  assert.equal(typeGotusLetters(input, "ALL").draft, "BALLON");
});

test("selecting a known letter allows an intentional replacement without shifting", () => {
  const known = ["B", "A", "L", "", "", "N"];
  let input = { ...createGotusInput("B", known), known };
  input = { ...input, ...selectGotusCell(input, 2) };
  input = { ...input, ...typeGotusLetters(input, "R") };
  assert.equal(input.draft, "BAR  N");
  assert.equal(input.activeColumn, 3);
});

test("Backspace and Delete can clear known letters without restoring them", () => {
  const known = ["B", "A", "L", "", "", "N"];
  for (const remove of [backspaceGotusInput, deleteGotusLetter]) {
    let input = { ...editGotusInput("BALLON"), known, activeColumn: 2 };
    input = { ...input, ...remove(input) };
    assert.equal(input.draft, "BA LON");
    input = { ...input, ...selectGotusCell(input, 5) };
    input = { ...input, ...typeGotusLetters(input, "S") };
    assert.equal(input.draft, "BA LOS", "later typing cannot resurrect a deleted known letter");
  }
});
