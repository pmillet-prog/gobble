import test from "node:test";
import assert from "node:assert/strict";
import { watchScreenOrientation } from "./screenOrientation.js";

test("board orientation overrides the portrait default and restores the game policy on exit", () => {
  const document = new EventTarget(), calls = [];
  const orientation = { lock: async mode => { calls.push(mode); }, unlock: () => calls.push("default") };
  const stopGame = watchScreenOrientation({ orientation, document, mode: "portrait" });
  stopGame();
  const stopBoard = watchScreenOrientation({ orientation, document, mode: "any" });
  document.dispatchEvent(new Event("fullscreenchange"));
  document.visibilityState = "hidden"; document.dispatchEvent(new Event("visibilitychange"));
  document.visibilityState = "visible"; document.dispatchEvent(new Event("visibilitychange"));
  stopBoard();
  const stopRestored = watchScreenOrientation({ orientation, document, mode: "portrait" });
  stopRestored(); document.dispatchEvent(new Event("fullscreenchange"));
  assert.deepEqual(calls, ["portrait", "any", "any", "any", "default", "portrait"]);
});

test("a refused browser lock cannot undo a newer portrait request after leaving the board", async () => {
  const document = new EventTarget(), calls = [];
  let reject;
  const orientation = { lock: mode => {
    calls.push(mode);
    return mode === "any" ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve();
  }, unlock: () => calls.push("default") };
  const stopBoard = watchScreenOrientation({ orientation, document, mode: "any" });
  stopBoard();
  const stopGame = watchScreenOrientation({ orientation, document, mode: "portrait" });
  reject(new Error("not_allowed")); await Promise.resolve();
  assert.deepEqual(calls, ["any", "default", "portrait"]);
  stopGame();
  const stopUnsupported = watchScreenOrientation({ orientation: {}, document, mode: "any" });
  document.dispatchEvent(new Event("fullscreenchange")); stopUnsupported();
});
