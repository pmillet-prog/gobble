import test from "node:test";
import assert from "node:assert/strict";
import { requestChatAudit } from "./chatAuditClient.js";

test("closing the panel ignores late replies and cancels its timeout", async () => {
  let reply, calls = 0;
  const connection = { connected: true, emit: (_event, _payload, cb) => { reply = cb; } };
  const cancel = requestChatAudit(connection, {}, () => { calls++; }, 5);
  cancel();
  reply({ ok: true, entries: ["private"] });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(calls, 0);
});

test("disconnected clients do not buffer a private history request for later", () => {
  let result;
  requestChatAudit({ connected: false, emit: () => assert.fail("must not emit") }, {}, response => { result = response; });
  assert.equal(result.error, "disconnected");
});

test("timeouts release the loading state and ignore stale acknowledgements", async () => {
  let reply;
  const responses = [];
  requestChatAudit({ connected: true, emit: (_event, _payload, cb) => { reply = cb; } }, {}, response => responses.push(response), 5);
  await new Promise(resolve => setTimeout(resolve, 15));
  reply({ ok: true });
  assert.deepEqual(responses, [{ ok: false, error: "timeout" }]);
});
