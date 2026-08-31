import test from "node:test";
import assert from "node:assert/strict";

import { handleGridKeyboardEvent } from "./useGridInputLifecycle.js";

class FakeElement {
  constructor({ authDialog = false, editable = false } = {}) {
    this.authDialog = authDialog;
    this.editable = editable;
    this.blurCount = 0;
  }

  closest(selector) {
    if (selector === "[data-auth-dialog='true']") return this.authDialog ? this : null;
    return this.editable ? this : null;
  }

  blur() {
    this.blurCount += 1;
  }
}

function createEvent(key, target = new FakeElement()) {
  return {
    key,
    target,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function createEnvironment(activeElement = new FakeElement()) {
  const scheduled = [];
  return {
    activeElement,
    scheduled,
    value: {
      documentTarget: { activeElement },
      HTMLElementCtor: FakeElement,
      schedule: (callback) => scheduled.push(callback),
    },
  };
}

test("Tab switches between game and chat without escaping an auth dialog", () => {
  const environment = createEnvironment();
  let activeArea = "game";
  let focusCount = 0;
  const config = {
    activeArea,
    authDialogOpen: false,
    focusChatInput: () => {
      focusCount += 1;
    },
    setActiveArea: (updater) => {
      activeArea = updater(activeArea);
    },
  };

  const openChatEvent = createEvent("Tab");
  assert.equal(handleGridKeyboardEvent(openChatEvent, config, environment.value), true);
  assert.equal(openChatEvent.prevented, true);
  assert.equal(activeArea, "chat");
  assert.equal(focusCount, 0);
  environment.scheduled.shift()();
  assert.equal(focusCount, 1);

  const returnToGameEvent = createEvent("Tab");
  assert.equal(handleGridKeyboardEvent(returnToGameEvent, config, environment.value), true);
  assert.equal(activeArea, "game");
  assert.equal(environment.activeElement.blurCount, 1);

  const authTarget = new FakeElement({ authDialog: true });
  const authTabEvent = createEvent("Tab", authTarget);
  assert.equal(handleGridKeyboardEvent(authTabEvent, config, environment.value), false);
  assert.equal(authTabEvent.prevented, false);
});

test("game keyboard commands dispatch narrow grid intents", () => {
  const calls = [];
  const lastInputModeRef = { current: "mouse" };
  const config = {
    activeArea: "game",
    phase: "playing",
    inputLockedRef: { current: false },
    lastInputModeRef,
    addLetter: (letter) => calls.push(["letter", letter]),
    cycleWordHistory: (direction) => calls.push(["history", direction]),
    submit: () => calls.push(["submit"]),
    removeLastLetter: () => calls.push(["remove"]),
  };
  const environment = createEnvironment();

  for (const key of ["a", "ArrowUp", "ArrowDown", "Enter", "Backspace"]) {
    const event = createEvent(key);
    assert.equal(handleGridKeyboardEvent(event, config, environment.value), true);
    assert.equal(event.prevented, true);
  }

  assert.deepEqual(calls, [
    ["letter", "A"],
    ["history", -1],
    ["history", 1],
    ["submit"],
    ["remove"],
  ]);
  assert.equal(lastInputModeRef.current, "keyboard");
});

test("game commands ignore editable, inactive and locked input", () => {
  let addCount = 0;
  const config = {
    activeArea: "game",
    phase: "playing",
    inputLockedRef: { current: false },
    addLetter: () => {
      addCount += 1;
    },
  };
  const environment = createEnvironment();

  handleGridKeyboardEvent(
    createEvent("a", new FakeElement({ editable: true })),
    config,
    environment.value
  );
  handleGridKeyboardEvent(createEvent("a"), { ...config, activeArea: "chat" }, environment.value);
  handleGridKeyboardEvent(
    createEvent("a"),
    { ...config, inputLockedRef: { current: true } },
    environment.value
  );

  assert.equal(addCount, 0);
});
