import test from "node:test";
import assert from "node:assert/strict";

import { createRealtimeGateway } from "./createRealtimeGateway.js";

test("realtime gateway isolates the application from the Socket.IO client", () => {
  const calls = [];
  const client = {
    auth: {},
    connected: false,
    connect() {
      calls.push(["connect"]);
      this.connected = true;
    },
    disconnect() {
      calls.push(["disconnect"]);
      this.connected = false;
    },
    emit(eventName, ...args) {
      calls.push(["emit", eventName, ...args]);
    },
    off(eventName, handler) {
      calls.push(["off", eventName, handler]);
    },
    on(eventName, handler) {
      calls.push(["on", eventName, handler]);
    },
    once(eventName, handler) {
      calls.push(["once", eventName, handler]);
    },
  };
  const gateway = createRealtimeGateway(client);
  const handler = () => {};

  gateway.auth = { token: "test" };
  gateway.connect();
  const unbind = gateway.bind({ roundStarted: handler });
  gateway.emit("login", { nick: "Tigre" });
  unbind();
  gateway.disconnect();

  assert.deepEqual(client.auth, { token: "test" });
  assert.equal(gateway.connected, false);
  assert.deepEqual(calls, [
    ["connect"],
    ["on", "roundStarted", handler],
    ["emit", "login", { nick: "Tigre" }],
    ["off", "roundStarted", handler],
    ["disconnect"],
  ]);
});
