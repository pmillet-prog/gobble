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

test("chat feature owns mobile viewport and interaction resources without phase handoff", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const ownerSource = read(
    "../../src/features/chat/useChatInteractionController.js"
  );
  const viewportSource = read(
    "../../src/components/chat/useChatViewport.js"
  );
  const slideSource = read("../../src/components/chat/ChatStyleSlide.jsx");
  const controllerSource = read(
    "../../src/components/chat/createChatInteractionController.js"
  );

  assert.match(applicationSource, /useChatInteractionResources\(/);
  assert.match(applicationSource, /useChatInteractionController\(/);
  assert.doesNotMatch(applicationSource, /createChatInteractionController/);
  assert.doesNotMatch(applicationSource, /wasMobileLiveLobbyRef/);
  assert.doesNotMatch(applicationSource, /chatViewportHeight|chatBodyLockHeightRef/);
  assert.doesNotMatch(applicationSource, /gameViewportFreezeHeightRef/);
  assert.doesNotMatch(applicationSource, /lobbyChatSubscriptionRef = useRef/);

  assert.match(ownerSource, /createChatInteractionController/);
  assert.doesNotMatch(ownerSource, /wasMobileLiveLobbyRef|hasActiveChatDraft/);
  assert.doesNotMatch(ownerSource, /visualViewport|chatBodyLockHeightRef/);
  assert.match(ownerSource, /lobbyChatSubscriptionRef = React\.useRef/);
  assert.match(applicationSource, /key="global-chat-layer"/);
  assert.match(viewportSource, /visualViewport/);
  assert.match(viewportSource, /offsetTop/);
  assert.match(viewportSource, /baselineRef = React\.useRef/);
  assert.match(slideSource, /createPortal/);
  assert.match(slideSource, /document\.body/);
  assert.match(slideSource, /useChatViewport/);
  assert.doesNotMatch(controllerSource, /documentElement|body\.style|scrollTo/);
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
    mutableRef(null),
    mutableRef(null),
    mutableRef(false),
    mutableRef(false),
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

  actions[9]();
  actions[3]();

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
