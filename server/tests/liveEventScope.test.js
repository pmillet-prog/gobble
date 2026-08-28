import assert from "node:assert/strict";
import {
  shouldProcessAttachedLiveRoomEvent,
  shouldProcessLiveRoomEvent,
} from "../../src/utils/liveEventScope.js";

assert.equal(
  shouldProcessLiveRoomEvent({ appView: "home", isLoggedIn: true }),
  false,
  "the main lobby must reject live gameplay events"
);
assert.equal(
  shouldProcessLiveRoomEvent({ appView: "daily_play", isLoggedIn: true }),
  false,
  "daily play must reject live gameplay events"
);
assert.equal(
  shouldProcessLiveRoomEvent({ appView: "training", isLoggedIn: true }),
  false,
  "standalone training must reject live gameplay and feed events"
);
assert.equal(
  shouldProcessLiveRoomEvent({
    appView: "live",
    isLoggedIn: true,
    activeRoomId: "room-4x4",
    incomingRoomId: "room-4x4",
  }),
  true
);
assert.equal(
  shouldProcessLiveRoomEvent({
    appView: "live",
    isLoggedIn: true,
    activeRoomId: "room-4x4",
    incomingRoomId: "room-5x5",
  }),
  false,
  "another live room must not leak into the active one"
);

const liveSessionReadyRef = { current: false };
const gameplaySession = {
  acceptsEvent: ({ roomId, roundId }) =>
    roomId === "room-4x4" && roundId === "round-current",
};
assert.equal(
  shouldProcessAttachedLiveRoomEvent({
    activeRoomId: "room-4x4",
    appView: "live",
    gameplaySession,
    incomingRoomId: "room-4x4",
    incomingRoundId: "round-current",
    isLoggedIn: true,
    liveSessionReadyRef,
  }),
  false,
  "returning to live must remain sealed until the authoritative snapshot is applied"
);
liveSessionReadyRef.current = true;
assert.equal(
  shouldProcessAttachedLiveRoomEvent({
    activeRoomId: "room-4x4",
    appView: "live",
    gameplaySession,
    incomingRoomId: "room-4x4",
    incomingRoundId: "round-obsolete",
    isLoggedIn: true,
    liveSessionReadyRef,
  }),
  false,
  "an attached live view must still reject events from an obsolete round"
);
assert.equal(
  shouldProcessAttachedLiveRoomEvent({
    activeRoomId: "room-4x4",
    appView: "live",
    gameplaySession,
    incomingRoomId: "room-4x4",
    incomingRoundId: "round-current",
    isLoggedIn: true,
    liveSessionReadyRef,
  }),
  true
);

console.log("liveEventScope tests OK");
