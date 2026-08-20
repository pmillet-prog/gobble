import assert from "node:assert/strict";
import {
  emitChatSocketEvent,
  getChatSocketRoomId,
  joinSocketToChatRoom,
  leaveSocketChatRoom,
} from "../chat/chatSocketRooms.js";

assert.equal(getChatSocketRoomId("room-4x4"), "chat:room-4x4");
assert.equal(getChatSocketRoomId(""), "");

const joined = [];
const left = [];
const socket = {
  data: {},
  join(roomId) {
    joined.push(roomId);
  },
  leave(roomId) {
    left.push(roomId);
  },
};

joinSocketToChatRoom(socket, "room-4x4");
assert.deepEqual(joined, ["chat:room-4x4"]);
assert.deepEqual(left, []);
assert.equal(socket.data.chatRoomId, "room-4x4");
assert.equal(
  joined.includes("room-4x4"),
  false,
  "a chat-only subscriber must never join the live gameplay room"
);

joinSocketToChatRoom(socket, "room-5x5");
assert.deepEqual(joined, ["chat:room-4x4", "chat:room-5x5"]);
assert.deepEqual(left, ["chat:room-4x4"]);
assert.equal(socket.data.chatRoomId, "room-5x5");

assert.equal(leaveSocketChatRoom(socket), "chat:room-5x5");
assert.deepEqual(left, ["chat:room-4x4", "chat:room-5x5"]);
assert.equal(socket.data.chatRoomId, null);

const emissions = [];
const io = {
  to(roomId) {
    return {
      emit(eventName, payload) {
        emissions.push({ roomId, eventName, payload });
      },
    };
  },
};

assert.equal(emitChatSocketEvent(io, "room-4x4", "chatMessage", { id: "m1" }), true);
assert.deepEqual(emissions, [
  {
    roomId: "chat:room-4x4",
    eventName: "chatMessage",
    payload: { id: "m1" },
  },
]);

console.log("chatSocketRooms tests OK");
