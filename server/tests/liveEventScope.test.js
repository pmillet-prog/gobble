import assert from "node:assert/strict";
import { shouldProcessLiveRoomEvent } from "../../src/utils/liveEventScope.js";

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

console.log("liveEventScope tests OK");
