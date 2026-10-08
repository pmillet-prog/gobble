import test from "node:test";
import assert from "node:assert/strict";
import { reportPresenterHit } from "./presenterHitReporter.js";

function fixture() {
  const sent = [];
  const state = { navigation: { view: "live" }, session: { isLoggedIn: true }, realtime: { roundId: 15 } };
  const socket = { connected: true, emit: (...args) => sent.push(args) };
  const kernel = { getState: () => state, ports: { realtime: socket } };
  return { sent, state, socket, kernel };
}

test("accepted hits use one reconnect-safe sequence without queuing disconnected taps", () => {
  const f = fixture();
  assert.equal(reportPresenterHit(f.kernel, "lepers"), true);
  f.socket.connected = false;
  assert.equal(reportPresenterHit(f.kernel, "lepers"), false);
  f.socket.connected = true;
  assert.equal(reportPresenterHit(f.kernel, "foucault", { surface: "quiz" }), true);
  assert.equal(f.sent[0][0], "presenter:hit");
  assert.equal(f.sent[1][1].sequence, 2);
  assert.equal(f.sent[1][1].streamId, f.sent[0][1].streamId);
  assert.equal(f.sent[1][1].roundId, 15);
});

test("demo, training, guests outside live and unsupported presenter identifiers do not emit", () => {
  const f = fixture();
  assert.equal(reportPresenterHit(null, "pivot"), false);
  assert.equal(reportPresenterHit(f.kernel, "pivot", { devPreview: true }), false);
  assert.equal(reportPresenterHit(f.kernel, "player-avatar"), false);
  for (const view of ["training", "home", "daily_play"]) {
    f.state.navigation.view = view;
    assert.equal(reportPresenterHit(f.kernel, "pivot"), false);
  }
  f.state.navigation.view = "live";
  f.state.session.isLoggedIn = false;
  assert.equal(reportPresenterHit(f.kernel, "pivot"), false);
  assert.equal(f.sent.length, 0);
});
