import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createChatInteractionController } from "../../src/components/chat/createChatInteractionController.js";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function mutableRef(current) {
  return { current };
}

test("chat feature owns mobile viewport, handoff, and interaction resources", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const ownerSource = read(
    "../../src/features/chat/useChatInteractionController.js"
  );

  assert.match(applicationSource, /useChatInteractionResources\(/);
  assert.match(applicationSource, /useChatInteractionController\(/);
  assert.doesNotMatch(applicationSource, /createChatInteractionController/);
  assert.doesNotMatch(applicationSource, /wasMobileLiveLobbyRef/);
  assert.doesNotMatch(applicationSource, /window\.addEventListener\("focusin"/);
  assert.doesNotMatch(applicationSource, /chatBaselineHeightRef = useRef/);
  assert.doesNotMatch(applicationSource, /lobbyChatSubscriptionRef = useRef/);

  assert.match(ownerSource, /createChatInteractionController/);
  assert.match(ownerSource, /wasMobileLiveLobbyRef = React\.useRef/);
  assert.match(ownerSource, /window\.addEventListener\("focusin"/);
  assert.match(ownerSource, /chatBaselineHeightRef = React\.useRef/);
  assert.match(ownerSource, /lobbyChatSubscriptionRef = React\.useRef/);
  assert.match(ownerSource, /hasActiveChatDraft/);
});

test("chat controller receives rules and lobby subscription ownership", () => {
  const acceptedValues = [];
  const rulesOpenValues = [];
  const seenMarkers = [];
  const lobbyChatSubscriptionRef = mutableRef({
    roomId: null,
    subscribed: false,
    inFlight: false,
    connectPending: false,
  });
  const socket = {
    connected: true,
    emit(eventName, payload, acknowledge) {
      if (eventName === "chat:subscribe") {
        acknowledge({ ok: true, roomId: payload.roomId });
      }
    },
  };
  const noop = () => {};
  const actions = createChatInteractionController([
    mutableRef(0),
    mutableRef(0),
    noop,
    mutableRef(null),
    mutableRef(null),
    mutableRef(false),
    mutableRef(false),
    mutableRef(false),
    mutableRef(0),
    mutableRef(null),
    mutableRef(null),
    mutableRef(0),
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    false,
    mutableRef(false),
    mutableRef("room-4x4"),
    socket,
    noop,
    noop,
    true,
    true,
    noop,
    false,
    (value) => rulesOpenValues.push(value),
    { clearReactionToasts: noop, enqueueReactionToast: noop },
    mutableRef(false),
    noop,
    noop,
    false,
    noop,
    (marker) => seenMarkers.push(marker),
    noop,
    noop,
    mutableRef(null),
    noop,
    (value) => value,
    "install:self",
    noop,
    {},
    (value) => acceptedValues.push(value),
    lobbyChatSubscriptionRef,
  ]);

  actions[10]();
  actions[4]();

  assert.deepEqual(acceptedValues, [true]);
  assert.deepEqual(rulesOpenValues, [false]);
  assert.equal(seenMarkers.length, 1);
  assert.equal(lobbyChatSubscriptionRef.current.subscribed, true);
  assert.equal(lobbyChatSubscriptionRef.current.roomId, "room-4x4");
});

test("lazy desktop chat consumers own focus and auto-scroll resources", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const panelSource = read("../../src/components/DesktopChatPanel.jsx");
  const finaleSource = read(
    "../../src/components/finale/TournamentFinaleScreen.jsx"
  );
  const ownerSource = read(
    "../../src/features/chat/useDesktopChatPresentationController.js"
  );

  assert.doesNotMatch(applicationSource, /chatDesktopListRef/);
  assert.doesNotMatch(applicationSource, /chatDesktopAutoScrollRafRef/);
  assert.doesNotMatch(applicationSource, /scheduleDesktopChatAutoScroll/);
  assert.doesNotMatch(applicationSource, /desktopChatActionsRef/);
  assert.match(panelSource, /useDesktopChatPresentationController/);
  assert.match(finaleSource, /useDesktopChatPresentationController/);
  assert.match(ownerSource, /registerInputFocusHandler/);
  assert.match(ownerSource, /window\.requestAnimationFrame/);
  assert.match(ownerSource, /autoScrollTimersRef = React\.useRef/);
  assert.match(ownerSource, /chatFeature\.store\.subscribe/);
});
