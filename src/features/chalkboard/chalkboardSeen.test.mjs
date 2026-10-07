import test from "node:test";
import assert from "node:assert/strict";
import {
  chalkboardSeenKey, getUnseenChalkboardEntries, hasUnseenChalkboardEntries,
  markChalkboardSeen, readChalkboardSeen,
} from "./chalkboardSeen.js";

const weekId = "2026-10-05";
const snapshot = interventions => ({ weekId, interventions });

function storage(t) {
  const data = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
  return data;
}

test("seeing later entries first keeps the home alert and remembers partial visits when reopening", t => {
  storage(t);
  const board = snapshot([{ z: 1 }, { z: 2 }, { z: 3 }]);
  const marker = markChalkboardSeen("partial", board, [board.interventions[2]]);
  assert.deepEqual(marker, { weekId, latestEntry: 0, seenEntries: [3] });
  assert.deepEqual(readChalkboardSeen("partial"), marker);
  assert.deepEqual(getUnseenChalkboardEntries(board, readChalkboardSeen("partial")).map(entry => entry.z), [1, 2]);
  assert.equal(hasUnseenChalkboardEntries({ weekId, latestEntry: 3 }, marker), true);
  assert.deepEqual(markChalkboardSeen("partial", board, [board.interventions[0]]), { weekId, latestEntry: 1, seenEntries: [3] });
  const complete = markChalkboardSeen("partial", board, [board.interventions[1]]);
  assert.deepEqual(complete, { weekId, latestEntry: 3 });
  assert.equal(hasUnseenChalkboardEntries({ weekId, latestEntry: 3 }, complete), false);
});

test("own publications never count as unread or conceal an earlier unseen contribution", t => {
  storage(t);
  const other = { z: 2, canErase: false };
  const own = { z: 3, canErase: true };
  const board = snapshot([{ z: 1, canErase: true }, other, own]);
  const marker = markChalkboardSeen("author", board, [own]);
  assert.deepEqual(marker, { weekId, latestEntry: 1 });
  assert.deepEqual(getUnseenChalkboardEntries(board, marker), [other]);
  assert.equal(hasUnseenChalkboardEntries({ weekId, latestEntry: 2 }, marker), true);
  assert.deepEqual(markChalkboardSeen("author", board, [other]), { weekId, latestEntry: 2 });
  assert.deepEqual(getUnseenChalkboardEntries(snapshot([own]), null), []);
});

test("legacy markers and full snapshot callers remain compatible and isolated by account", t => {
  const data = storage(t);
  data.set(chalkboardSeenKey("legacy"), JSON.stringify({ weekId, latestEntry: 2 }));
  const board = snapshot([{ z: 1 }, { z: 2 }, { z: 4 }]);
  assert.deepEqual(getUnseenChalkboardEntries(board, readChalkboardSeen("legacy")), [{ z: 4 }]);
  assert.deepEqual(markChalkboardSeen("legacy", board), { weekId, latestEntry: 4 });
  assert.deepEqual(markChalkboardSeen("legacy", snapshot([{ z: 2 }]), []), { weekId, latestEntry: 4 });
  assert.equal(readChalkboardSeen("different-account"), null);
});

test("an own publish response cannot acknowledge another contribution not fetched yet", t => {
  storage(t);
  const older = { z: 1 }, concurrent = { z: 2 }, own = { z: 3, canErase: true };
  markChalkboardSeen("concurrent-publication", snapshot([older]));
  const afterPublish = markChalkboardSeen("concurrent-publication", snapshot([older, own]), [own]);
  assert.equal(afterPublish.latestEntry, 1);
  assert.deepEqual(getUnseenChalkboardEntries(snapshot([older, concurrent, own]), afterPublish), [concurrent]);
  assert.equal(hasUnseenChalkboardEntries({ weekId, latestEntry: 2 }, afterPublish), true);
});

test("deletions let the read watermark advance and discard consumed partial markers", t => {
  storage(t);
  markChalkboardSeen("deletion", snapshot([{ z: 1 }, { z: 2 }, { z: 3 }]), [{ z: 3 }]);
  assert.deepEqual(markChalkboardSeen("deletion", snapshot([{ z: 2 }, { z: 3 }]), []), { weekId, latestEntry: 1, seenEntries: [3] });
  assert.deepEqual(markChalkboardSeen("deletion", snapshot([{ z: 3 }]), []), { weekId, latestEntry: 3 });
  assert.deepEqual(markChalkboardSeen("deletion", snapshot([]), []), { weekId, latestEntry: 3 });
});

test("new weeks reset partial progress while stale snapshots cannot move it backward", t => {
  storage(t);
  const old = markChalkboardSeen("weekly", snapshot([{ z: 1 }, { z: 5 }]), [{ z: 5 }]);
  const next = { weekId: "2026-10-12", interventions: [{ z: 1 }, { z: 2 }] };
  assert.deepEqual(getUnseenChalkboardEntries(next, old), next.interventions);
  const marker = markChalkboardSeen("weekly", next, [{ z: 2 }]);
  assert.deepEqual(marker, { weekId: next.weekId, latestEntry: 0, seenEntries: [2] });
  assert.deepEqual(markChalkboardSeen("weekly", snapshot([{ z: 10 }])), marker);
  assert.deepEqual(getUnseenChalkboardEntries(snapshot([{ z: 10 }]), marker), []);
});

test("invalid data is ignored and the in-memory progress wins after a failed storage write", t => {
  const data = storage(t);
  assert.equal(markChalkboardSeen("invalid", { weekId: "", interventions: [] }), null);
  assert.equal(markChalkboardSeen("invalid", { weekId }), null);
  assert.deepEqual(getUnseenChalkboardEntries({ weekId: "", interventions: [{ z: 1 }] }, null), []);
  const board = snapshot([{ z: 1 }, { z: 2 }, { z: "3" }, { z: NaN }, { z: -1 }, null]);
  assert.deepEqual(getUnseenChalkboardEntries(board, null), [{ z: 1 }, { z: 2 }]);
  const initial = markChalkboardSeen("storage-failure", board, []);
  globalThis.localStorage.setItem = () => { throw new Error("storage disabled"); };
  const partial = markChalkboardSeen("storage-failure", board, [{ z: 2 }, { z: 999 }]);
  assert.deepEqual(partial, { weekId, latestEntry: 0, seenEntries: [2] });
  assert.deepEqual(JSON.parse(data.get(chalkboardSeenKey("storage-failure"))), initial);
  assert.deepEqual(readChalkboardSeen("storage-failure"), partial);
  assert.deepEqual(markChalkboardSeen("storage-failure", board, [{ z: 1 }]), { weekId, latestEntry: 2 });
  assert.deepEqual(markChalkboardSeen("storage-failure", null), { weekId, latestEntry: 2 });
});
