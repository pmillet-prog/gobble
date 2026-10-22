import test from "node:test";
import assert from "node:assert/strict";
import { createGotusWaitingController } from "./createGotusWaitingController.js";
import { GOTUS_WAITING_INVITATIONS, shouldOfferGotus } from "./gotusWaitingPolicy.js";

function harness() {
  const sent = [], listeners = new Map(), timers = new Map(), joined = [], entries = [], notices = [];
  let id = 0;
  const socket = { connected: true,
    on: (name, callback) => listeners.set(name, callback),
    off: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    emit: (event, payload, ack) => sent.push({ event, payload, ack }),
  };
  const controller = createGotusWaitingController({ now: () => 100, random: () => .5,
    setTimeoutFn: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    clearTimeoutFn: timer => timers.delete(timer),
  });
  controller.configure({ socket, authenticated: true, ensureAuthenticated: () => true,
    getIdentity: () => ({ roomId: "room-4x4", nick: "Test", installId: "7" }),
    ensureConnection: async () => socket.connected,
    onJoinLive: snapshot => joined.push(snapshot), showToast: text => notices.push(text),
  });
  controller.start();
  const setRoom = (round = 3, phase = "closed") => controller.configure({ roomsStats: [{ roomId: "room-4x4",
    liveStatus: { tournamentRound: round }, tournamentLobby: { phase } }] });
  const expire = delay => { for (const [key, timer] of [...timers]) if (timer.delay === delay) { timers.delete(key); timer.callback(); } };
  return { controller, state: () => controller.store.getState(), socket, sent, listeners, timers, joined, entries, notices, setRoom, expire };
}

test("Gotus offer begins at round three, including intermission, never the next lobby", () => {
  assert.equal(GOTUS_WAITING_INVITATIONS.length, 10);
  assert.equal(new Set(GOTUS_WAITING_INVITATIONS).size, 10);
  assert.equal(shouldOfferGotus({ liveStatus: { round: { number: 2 } } }), false);
  assert.equal(shouldOfferGotus({ liveStatus: { round: { number: 3 } } }), true);
  assert.equal(shouldOfferGotus({ liveStatus: { tournamentRound: 5, phase: "results" } }), true);
  assert.equal(shouldOfferGotus({ liveStatus: { tournamentRound: 5 }, tournamentLobby: { phase: "countdown" } }), false);
  assert.equal(shouldOfferGotus(null), false);
});

test("offering Gotus never joins a room; direct entry remains available exactly once", () => {
  const h = harness(); h.setRoom();
  h.controller.requestEntry(() => h.entries.push("live"));
  assert.equal(h.state().dialog.kind, "offer");
  assert.equal(h.sent.length, 0);
  h.controller.enterAnyway(); h.controller.enterAnyway();
  assert.deepEqual(h.entries, ["live"]);
  h.setRoom(2); h.controller.requestEntry(() => h.entries.push("round2"));
  assert.deepEqual(h.entries, ["live", "round2"]);
  h.controller.dispose();
});

test("training sends only dedicated presence; stop cannot join live implicitly", async () => {
  const h = harness(); await h.controller.startTraining();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].event, "training:standalone:presence");
  assert.equal(h.sent[0].payload.type, "gotus");
  assert.equal(h.sent[0].payload.nick, "Test");
  h.controller.close();
  assert.equal(h.sent[1].event, "training:standalone:stop");
  assert.equal(h.sent[1].payload.joinLive, false);
  assert.equal(h.state().session, null);
  h.controller.dispose();
});

test("countdown reminder is not repeated at intro and mute lasts across training sessions", async () => {
  const h = harness(); h.setRoom(); await h.controller.startTraining();
  h.setRoom(0, "countdown");
  assert.equal(h.state().dialog.kind, "reminder");
  h.controller.dismissDialog(); h.setRoom(0, "intro");
  assert.equal(h.state().dialog, null);
  h.setRoom(1); h.setRoom(0, "countdown");
  assert.equal(h.state().dialog.kind, "reminder");
  h.controller.muteReminders(true); h.controller.dismissDialog();
  h.controller.close(); await h.controller.startTraining();
  assert.equal(h.state().dialog, null);
  assert.equal(h.state().remindersMuted, true);
  h.controller.dispose();
  const next = harness();
  assert.equal(next.state().remindersMuted, false);
  next.controller.dispose();
});

test("joining live waits for authoritative snapshot and preserves training on failure", async () => {
  const h = harness(); await h.controller.startTraining();
  const failed = h.controller.joinLive(); await Promise.resolve();
  h.sent.at(-1).ack({ ok: false, error: "playtime_limit" });
  assert.equal(await failed, false);
  assert.ok(h.state().session);
  const joining = h.controller.joinLive(); await Promise.resolve();
  const snapshot = { roomId: "room-4x4", player: { nick: "Test" } };
  assert.equal(h.sent.at(-1).payload.joinLive, true);
  h.sent.at(-1).ack({ ok: true, snapshot });
  assert.equal(await joining, true);
  assert.equal(h.state().session, null);
  assert.deepEqual(h.joined, [snapshot]);
  h.controller.dispose();
});

test("lost ACK releases busy state; late response cannot enter live", async () => {
  const h = harness(); await h.controller.startTraining();
  const joining = h.controller.joinLive(); await Promise.resolve();
  const ack = h.sent.at(-1).ack;
  h.expire(8000);
  assert.equal(await joining, false);
  assert.equal(h.state().busy, false);
  ack({ ok: true, snapshot: { roomId: "room-4x4" } });
  assert.equal(h.joined.length, 0);
  h.controller.dispose();
});

test("reconnect restores training presence, closing invalidates delayed presence", async () => {
  const h = harness(); await h.controller.startTraining();
  h.listeners.get("connect")(); h.expire(900);
  assert.equal(h.sent.filter(item => item.event.endsWith(":presence")).length, 2);
  h.controller.close(); h.expire(2400);
  assert.equal(h.sent.filter(item => item.event.endsWith(":presence")).length, 2);
  h.controller.dispose();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test("closing while joining invalidates pending live snapshot", async () => {
  const h = harness(); await h.controller.startTraining();
  const joining = h.controller.joinLive(); await Promise.resolve();
  const ack = h.sent.at(-1).ack;
  h.controller.close();
  assert.deepEqual(h.sent.slice(-2).map(item => item.event), ["training:standalone:presence", "training:standalone:stop"]);
  ack({ ok: true, snapshot: { roomId: "room-4x4" } });
  assert.equal(await joining, false);
  assert.equal(h.joined.length, 0);
  h.controller.dispose();
});

test("reconnect presence cannot race with a slow successful join ACK", async () => {
  const h = harness(); await h.controller.startTraining();
  h.listeners.get("connect")();
  const joining = h.controller.joinLive(); await Promise.resolve();
  const ack = h.sent.at(-1).ack;
  h.expire(900); h.expire(2400);
  assert.equal(h.sent.filter(item => item.event.endsWith(":presence")).length, 1);
  ack({ ok: true, snapshot: { roomId: "room-4x4" } });
  assert.equal(await joining, true);
  h.controller.dispose();
});

test("authentication prompt closes the offer and never announces training", async () => {
  const h = harness(); h.setRoom();
  h.controller.requestEntry(() => {});
  h.controller.configure({ ensureAuthenticated: () => false });
  assert.equal(await h.controller.startTraining(), false);
  assert.equal(h.state().dialog, null);
  assert.equal(h.state().session, null);
  assert.equal(h.sent.length, 0);
  h.controller.dispose();
});
