import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
async function setup(t, options) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gobble-chat-audit-"));
  const filename = path.join(directory, "audit.sqlite");
  let repository = await openChatAuditRepository(filename, options);
  t.after(async () => {
    await repository.close();
    const relative = path.relative(os.tmpdir(), directory);
    assert.ok(relative.startsWith("gobble-chat-audit-") && !relative.includes(path.sep));
    await rm(directory, { recursive: true, force: true });
  });
  return { get repository() { return repository; }, async reopen() { await repository.close(); repository = await openChatAuditRepository(filename, options); } };
}

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
