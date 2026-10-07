import test from "node:test";
import assert from "node:assert/strict";
import { createChalkboardService } from "./chalkboardService.js";
import { registerChalkboardRoutes } from "./registerChalkboardRoutes.js";
import { hasUnseenChalkboardEntries, markChalkboardSeen, readChalkboardSeen } from "../../src/features/chalkboard/chalkboardSeen.js";

const draft = { elements: [{ type: "stroke", id: "local", seed: 42, color: "#ffffff", size: 9, points: [{ x: 12, y: 24, p: .4 }, { x: 38, y: 45, p: .7 }] }] };

test("new entries trigger activity even with identical timestamps; deletion, undo and weekly reset are handled", () => {
  let now = Date.parse("2026-10-06T12:00:00Z");
  const service = createChalkboardService({ now: () => now });
  assert.equal(hasUnseenChalkboardEntries(service.getActivity(), null), false);
  const first = service.addIntervention("free", draft, { userId: 7 });
  assert.equal(first.ok, true);
  const seen = service.getActivity();
  assert.deepEqual(Object.keys(seen).sort(), ["latestEntry", "ok", "weekId"]);
  assert.equal(hasUnseenChalkboardEntries(seen, null), true);
  assert.equal(hasUnseenChalkboardEntries(seen, seen), false);
  const second = service.addIntervention("free", draft, { userId: 8 });
  assert.equal(hasUnseenChalkboardEntries(service.getActivity(), seen), true);
  service.deleteIntervention(second.intervention.id, { userId: 1 });
  assert.equal(hasUnseenChalkboardEntries(service.getActivity(), seen), false);
  service.undoLastDeletion("free", { userId: 1 });
  const visited = service.getActivity();
  assert.equal(hasUnseenChalkboardEntries(visited, seen), true);
  service.deleteIntervention(second.intervention.id, { userId: 1 });
  service.undoLastDeletion("free", { userId: 1 });
  assert.equal(hasUnseenChalkboardEntries(service.getActivity(), visited), false);
  const reopened = createChalkboardService({ now: () => now });
  reopened.restoreState(service.exportState());
  assert.deepEqual(reopened.getActivity(), service.getActivity());
  now += 7 * 86400000;
  assert.equal(hasUnseenChalkboardEntries(service.getActivity(), visited), false);
  service.addIntervention("free", draft, { userId: 7 });
  assert.equal(hasUnseenChalkboardEntries(service.getActivity(), visited), true);
});

test("seen markers persist per account, never move backward and ignore invalid snapshots", t => {
  const data = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
  const snapshot = { weekId: "2026-10-05", interventions: [{ z: 3 }, { z: 5 }] };
  markChalkboardSeen("marker-test", snapshot);
  assert.deepEqual(readChalkboardSeen("marker-test"), { weekId: "2026-10-05", latestEntry: 5 });
  assert.equal(readChalkboardSeen("another-marker-test"), null);
  markChalkboardSeen("marker-test", { ...snapshot, interventions: [{ z: 2 }] });
  assert.equal(readChalkboardSeen("marker-test").latestEntry, 5);
  markChalkboardSeen("marker-test", { ...snapshot, weekId: "" });
  assert.equal(readChalkboardSeen("marker-test").weekId, snapshot.weekId);
});

test("activity excludes only the reader's own entries and preserves unseen entries by others", () => {
  let now = Date.parse("2026-10-06T12:00:00Z");
  const service = createChalkboardService({ now: () => now });
  const reader = { userId: 7 };
  const own = service.addIntervention("free", draft, reader);
  assert.equal(service.getActivity(reader).latestEntry, 0);
  assert.equal(service.getActivity({ userId: "7" }).latestEntry, 0);
  assert.equal(service.getActivity().latestEntry, own.intervention.z);
  assert.equal(service.getActivity({}).latestEntry, own.intervention.z);

  const other = service.addIntervention("free", draft, { userId: 8 });
  const latestOwn = service.addIntervention("free", draft, reader);
  assert.equal(service.getActivity(reader).latestEntry, other.intervention.z);
  assert.equal(service.getActivity({ userId: 8 }).latestEntry, latestOwn.intervention.z);
  assert.equal(service.getActivity(null).latestEntry, latestOwn.intervention.z);
  assert.deepEqual(Object.keys(service.getActivity(reader)).sort(), ["latestEntry", "ok", "weekId"]);

  service.deleteIntervention(other.intervention.id, { userId: 1 });
  assert.equal(service.getActivity(reader).latestEntry, 0);
  service.undoLastDeletion("free", { userId: 1 });
  assert.equal(service.getActivity(reader).latestEntry, other.intervention.z);
  now += 7 * 86400000;
  assert.equal(service.getActivity(reader).latestEntry, 0);
});

test("activity route is a small no-store response personalized by authenticated identity, with the existing maintenance gate", async () => {
  const routes = new Map();
  let maintenance = false;
  const app = Object.fromEntries(["get", "post", "delete"].map(method => [method, (url, fn) => routes.set(`${method}:${url}`, fn)]));
  const service = createChalkboardService();
  const own = service.addIntervention("free", draft, { userId: 7 });
  registerChalkboardRoutes({ app, getRequestIdentity: async req => req.identity, isMaintenanceModeActive: () => maintenance, service });
  const res = { code: 200, headers: {}, set(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await routes.get("get:/api/chalkboard/activity")({ identity: { userId: 7 } }, res);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.latestEntry, 0);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.ok(JSON.stringify(res.body).length < 100);
  await routes.get("get:/api/chalkboard/activity")({}, res);
  assert.equal(res.body.latestEntry, own.intervention.z);
  maintenance = true;
  await routes.get("get:/api/chalkboard/activity")({}, res);
  assert.equal(res.code, 503);
});
