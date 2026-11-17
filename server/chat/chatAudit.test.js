import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, lstat, readdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { openChatAuditRepository } from "./chatAuditRepository.js";
import { createAuditedChatCommands } from "./auditedChatCommands.js";
import { createChatMessageMutations } from "./chatMessageMutations.js";
import { registerChatAuditHandlers } from "../realtime/registerChatAuditHandlers.js";
import { registerChatHandlers } from "../realtime/registerChatHandlers.js";

const roomId = "room-4x4";
const message = (overrides = {}) => ({ id: "m1", t: Date.now(), nick: "Tigre", userId: 7, installId: "7", text: "Bonjour", ...overrides });
const mutations = createChatMessageMutations({
  normalizeInstallId: value => typeof value === "string" ? value.trim() : "",
  isSystemChatEntry: entry => entry.type === "system",
  censorTargetSpoilersInChatText: (_room, text) => text.replace("secret", "******"),
});
const commandsFor = archive => createAuditedChatCommands({ archive, ...mutations, pushChatMessage: (room, entry) => room.chatMessages.push(entry) });
async function noLinks(directory) {
  const stat = await lstat(directory);
  assert.equal(stat.isSymbolicLink(), false, `Refusing reparse point: ${directory}`);
  if (stat.isDirectory()) for (const entry of await readdir(directory)) await noLinks(path.join(directory, entry));
}
async function setup(t, { prepare, ...options } = {}) {
  const workspace = process.cwd(), testsRoot = path.resolve(workspace, ".tmp/codex-tests");
  await mkdir(testsRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testsRoot, "chat-audit-"));
  const filename = path.join(directory, "audit.sqlite");
  let repository;
  t.after(async () => {
    try {
      await repository?.close();
      const relative = path.relative(testsRoot, path.resolve(directory));
      assert.ok(relative.startsWith("chat-audit-") && !relative.includes(path.sep) && !path.isAbsolute(relative));
      for (const ancestor of [workspace, path.dirname(testsRoot), testsRoot]) {
        assert.equal((await lstat(ancestor)).isSymbolicLink(), false, `Refusing reparse point: ${ancestor}`);
      }
      await noLinks(directory);
      await rm(directory, { recursive: true, force: true });
    } catch (error) { console.error(`Remaining disposable directory: ${directory}`); throw error; }
  });
  await prepare?.(filename);
  repository = await openChatAuditRepository(filename, options);
  return { get repository() { return repository; }, async reopen() {
    await repository.close(); repository = null; repository = await openChatAuditRepository(filename, options);
  } };
}

test("restart restores public player messages in order with latest edits and excludes deleted text", async t => {
  const h = await setup(t);
  const room = { id: roomId, chatMessages: [] }, commands = commandsFor(h.repository);
  const first = message({ id: "first", t: Date.now() - 1000, team: "red",
    replyTo: { id: "earlier", nick: "Test", text: "Une question", t: 1 },
    isDailyChampion: true, weeklyVocabPodiumRank: 2, isWeeklyVocabChampion: false });
  await commands.send(room, first);
  await commands.send(room, message({ id: "removed", text: "À supprimer" }));
  await commands.edit(room, { messageId: "first", installId: "7", text: "un secret" });
  await commands.delete(room, { messageId: "removed", installId: "7" });
  await commands.send(room, message({ id: "last", t: first.t + 500, text: "Dernier message" }));
  await h.reopen();
  const restored = await h.repository.history({ roomId });
  assert.deepEqual(restored.map(entry => entry.id), ["first", "last"]);
  assert.deepEqual(restored[0], { ...first, roomId, text: "un ******", editedAt: room.chatMessages[0].editedAt });
  assert.equal(JSON.stringify(restored).includes("secret"), false);
  assert.equal(restored.some(entry => "submittedText" in entry || "previousText" in entry || "action" in entry), false);
});

test("restored live history keeps only the latest 200 messages for the requested room and retention", async t => {
  let now = Date.now();
  const h = await setup(t, { now: () => now });
  for (let i = 0; i < 205; i++) {
    await h.repository.append({ action: "sent", roomId, message: message({ id: `m${i}`, t: now - 1000 + i }) });
  }
  await h.repository.append({ action: "sent", roomId: "other-room", message: message({ id: "private-to-other-room" }) });
  await h.reopen();
  const restored = await h.repository.history({ roomId });
  assert.equal(restored.length, 200);
  assert.equal(restored[0].id, "m5");
  assert.equal(restored.at(-1).id, "m204");
  assert.deepEqual((await h.repository.history({ roomId, limit: 2 })).map(entry => entry.id), ["m203", "m204"]);
  assert.throws(() => h.repository.history({ roomId, limit: 201 }), /invalid_chat_history_query/);
  now += 31 * 86400000;
  assert.deepEqual(await h.repository.history({ roomId }), []);
});

test("existing audit databases migrate without losing previously archived player messages", async t => {
  const h = await setup(t, { prepare: async filename => {
    const db = await open({ filename, driver: sqlite3.Database });
    try {
      await db.exec(`CREATE TABLE chat_audit (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, message_id TEXT NOT NULL,
        action TEXT NOT NULL, at INTEGER NOT NULL, sent_at INTEGER NOT NULL, nick TEXT NOT NULL,
        user_id INTEGER, install_id TEXT, text TEXT NOT NULL, previous_text TEXT, submitted_text TEXT);`);
      await db.run(`INSERT INTO chat_audit (room_id,message_id,action,at,sent_at,nick,user_id,install_id,text)
        VALUES (?,?,'sent',?,?,'Test',7,'7','Ancien message')`, roomId, "legacy", Date.now(), Date.now());
    } finally { await db.close(); }
  } });
  await h.reopen();
  const restored = await h.repository.history({ roomId });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].text, "Ancien message");
  assert.equal(restored[0].id, "legacy");
  assert.equal((await h.repository.list({ roomId })).entries[0].text, "Ancien message");
});

test("send/edit/delete archive exact versions and authenticated identity across database reopen", async t => {
  const setupResult = await setup(t);
  const room = { id: roomId, chatMessages: [] };
  const commands = commandsFor(setupResult.repository);
  assert.equal((await commands.send(room, message())).ok, true);
  assert.equal((await commands.edit(room, { messageId: "m1", installId: "7", text: "un secret" })).ok, true);
  assert.equal(room.chatMessages[0].text, "un ******");
  assert.equal((await commands.delete(room, { messageId: "m1", installId: "7" })).ok, true);
  assert.equal(room.chatMessages.length, 0);
  await setupResult.reopen();
  const result = await setupResult.repository.list({ roomId });
  assert.deepEqual(result.entries.map(entry => entry.action), ["deleted", "edited", "sent"]);
  assert.equal(result.entries[1].previousText, "Bonjour");
  assert.equal(result.entries[1].submittedText, "un secret");
  assert.equal(result.entries[2].userId, 7);
  assert.equal(result.entries[2].nick, "Tigre");
  assert.equal(result.retentionDays, 30);
});

test("default history covers the last 24 hours", async t => {
  const now = Date.now();
  const { repository } = await setup(t, { now: () => now });
  for (const hours of [0, 2, 23, 25]) await repository.append({ action: "sent", roomId, message: message({ id: String(hours) }), at: now - hours * 3600000 });
  assert.deepEqual((await repository.list({ roomId })).entries.map(entry => entry.messageId), ["23", "2", "0"]);
});

test("failed disk writes do not publish, edit or delete; subsequent commands recover", async () => {
  let fail = true;
  const entries = [];
  const commands = commandsFor({ append: async entry => { if (fail) throw new Error("disk_unavailable"); entries.push(entry); } });
  const room = { id: roomId, chatMessages: [message()] };
  assert.equal((await commands.send(room, message({ id: "m2" }))).error, "chat_archive_unavailable");
  assert.equal((await commands.edit(room, { messageId: "m1", installId: "7", text: "edited" })).ok, false);
  assert.equal((await commands.delete(room, { messageId: "m1", installId: "7" })).ok, false);
  assert.equal(room.chatMessages.length, 1);
  assert.equal(room.chatMessages[0].text, "Bonjour");
  fail = false;
  assert.equal((await commands.delete(room, { messageId: "m1", installId: "7" })).ok, true);
  assert.equal(entries.length, 1);
});

test("same-room edit/delete commands are serialized without overwriting reactions or other arrivals", async () => {
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const entries = [];
  const commands = commandsFor({ append: async entry => { entries.push(structuredClone(entry)); await barrier; } });
  const original = message();
  const room = { id: roomId, chatMessages: [original] };
  const edit = commands.edit(room, { messageId: "m1", installId: "7", text: "new" });
  const remove = commands.delete(room, { messageId: "m1", installId: "7" });
  await Promise.resolve();
  assert.equal(original.text, "Bonjour");
  original.reactions = { smile: [{ nick: "Test" }] };
  room.chatMessages.push(message({ id: "bot", isBot: true }));
  release();
  assert.equal((await edit).message.reactions.smile[0].nick, "Test");
  await remove;
  assert.deepEqual(entries.map(entry => entry.action), ["edited", "deleted"]);
  assert.equal(entries[1].message.text, "new");
  assert.deepEqual(room.chatMessages.map(entry => entry.id), ["bot"]);
});

test("invalid/foreign/system mutations create no archive entries", async () => {
  let writes = 0;
  const commands = commandsFor({ append: async () => { writes += 1; } });
  const room = { id: roomId, chatMessages: [message(), message({ id: "system", type: "system" })] };
  assert.equal((await commands.delete(room, { messageId: "m1", installId: "8" })).error, "forbidden");
  assert.equal((await commands.edit(room, { messageId: "m1", installId: "8", text: "attack" })).error, "forbidden");
  assert.equal((await commands.delete(room, { messageId: "system", installId: "7" })).error, "message_not_found");
  assert.equal((await commands.delete(room, { messageId: 12, installId: "7" })).error, "invalid_message_id");
  assert.equal((await commands.edit(room, { messageId: "m1", installId: "7", text: "x".repeat(301) })).error, "text_too_long");
  assert.equal(writes, 0);
});

test("pagination has no overlaps despite concurrent arrivals; filters are parameterized", async t => {
  const { repository } = await setup(t);
  for (let i = 0; i < 55; i++) await repository.append({ action: "sent", roomId, message: message({ id: String(i), text: i === 3 ? "l'apostrophe %" : "hello" }) });
  await repository.append({ action: "sent", roomId: "another-room", message: message() });
  const first = await repository.list({ roomId });
  assert.equal(first.entries.length, 50);
  await repository.append({ action: "sent", roomId, message: message({ id: "new" }) });
  const next = await repository.list({ roomId, before: first.nextBefore });
  assert.equal(next.entries.length, 5);
  assert.equal(new Set([...first.entries, ...next.entries].map(entry => entry.seq)).size, 55);
  assert.equal((await repository.list({ roomId, query: "l'apostrophe %" })).entries.length, 1);
  assert.equal((await repository.list({ roomId, query: "' OR 1=1 --" })).entries.length, 0);
  await assert.rejects(repository.list({ roomId, from: "bad" }), /invalid_chat_query/);
});

test("expired events are immediately hidden and purged after 30 days", async t => {
  let now = Date.now();
  const { repository } = await setup(t, { now: () => now });
  await repository.append({ action: "sent", roomId, message: message(), at: now });
  now += 31 * 86400000;
  assert.equal((await repository.list({ roomId, from: 0 })).entries.length, 0);
  assert.equal((await repository.prune()).changes, 1);
});

test("archive endpoint denies unauthorised readers and rechecks permission after reading", async () => {
  let handler, allowed = false, reads = 0, revoke = false;
  const socket = { on: (_event, fn) => { handler = fn; }, data: {} };
  registerChatAuditHandlers(socket, {
    archive: { list: async () => { reads++; if (revoke) allowed = false; return { entries: ["private"] }; } },
    requireModerationAccess: (_socket, cb) => { if (allowed) return { userId: 1 }; cb({ ok: false, error: "moderation_forbidden" }); return null; },
    getRoom: () => ({ id: roomId }),
  });
  let result;
  await handler({}, response => { result = response; });
  assert.equal(reads, 0);
  assert.equal(result.ok, false);
  allowed = true;
  await handler({}, response => { result = response; });
  assert.deepEqual(result.entries, ["private"]);
  revoke = true;
  await handler({}, response => { result = response; });
  assert.equal(result.ok, false);
  assert.equal(result.entries, undefined);
});

test("socket send archives authenticated identity even without an acknowledgement callback", async t => {
  const { repository } = await setup(t);
  const handlers = {};
  const socket = { id: "s1", data: {}, on: (event, handler) => { handlers[event] = handler; } };
  const room = { id: roomId, chatMessages: [], players: new Map([["s1", { nick: "Tigre" }]]) };
  const publicEvents = [];
  registerChatHandlers(socket, {
    NICK_MAX_LEN: 30,
    auditedChatCommands: commandsFor(repository), getRoom: () => room,
    emitChatSocketEvent: (_io, _roomId, event, payload) => publicEvents.push({ event, payload }),
    requireSocketPlayerIdentity: () => ({ userId: 7, installId: "7" }),
    isInstallIdMuted: () => false, markSocketPlayerActivity: () => false,
    checkTargetChatRateLimit: () => ({ ok: true }), censorTargetSpoilersInChatText: (_room, text) => text,
    resolveReplyPreviewFromPayload: () => null, randomUUID: () => "socket-message",
    getTeamForInstallCached: () => null, isDailyChampionInstallId: () => false,
    getWeeklyVocabPodiumRankForInstallId: () => null, isWeeklyVocabChampionInstallId: () => false,
  });
  await handlers["chat:send"]({ text: "hello", userId: 99, installId: "99", nick: "impostor" });
  assert.equal(room.chatMessages.length, 1);
  const entry = (await repository.list({ roomId })).entries[0];
  assert.equal(entry.nick, "Tigre");
  assert.equal(entry.userId, 7);
  let result;
  await handlers["chat:edit"]({ messageId: "socket-message", text: "edited" }, response => { result = response; });
  assert.equal(result.ok, true);
  await handlers["chat:delete"]({ messageId: "socket-message" }, response => { result = response; });
  assert.equal(result.ok, true);
  assert.equal(room.chatMessages.length, 0);
  assert.deepEqual(publicEvents.map(event => event.event), ["chat:message_update", "chat:message_delete"]);
  assert.equal(publicEvents[1].payload.text, undefined);
  assert.equal(publicEvents[0].payload.message.previousText, undefined);
  assert.deepEqual((await repository.list({ roomId })).entries.map(row => row.action), ["deleted", "edited", "sent"]);
  // Sending historically accepts long messages: archiving must not truncate them.
  await handlers["chat:send"]("x".repeat(301), response => { result = response; });
  assert.equal(result.ok, true);
  assert.equal((await repository.list({ roomId })).entries[0].text.length, 301);
});
