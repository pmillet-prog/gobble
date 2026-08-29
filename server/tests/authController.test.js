import assert from "node:assert/strict";
import test from "node:test";

import { createAuthController } from "../../src/components/auth/createAuthController.js";

test("login submission reaches the auth endpoint and clears its pending state", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const submittingStates = [];
  const modalModes = [];
  const authStates = [];
  const nicknames = [];
  const noop = () => {};
  const user = {
    id: "test-user",
    usernameDisplay: "Test",
  };

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      body: options.body ? JSON.parse(options.body) : null,
      url: String(url),
    });
    const payload =
      String(url) === "/api/auth/login"
        ? { ok: true, user }
        : { ok: true, status: "authenticated", user };
    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  };

  try {
    const controller = createAuthController([
      {
        auth: {},
        connected: false,
        disconnect: noop,
        off: noop,
        once: noop,
      },
      { current: null },
      false,
      {
        CHANGE_PASSWORD: "change-password",
        CLAIM_LEGACY: "claim-legacy",
        LOGIN: "login",
        REGISTER: "register",
      },
      "",
      { loading: false, status: "login_required", user: null },
      "Test",
      (mode) => modalModes.push(mode),
      noop,
      noop,
      noop,
      (value) => submittingStates.push(value),
      false,
      "local-test-install",
      (state) => authStates.push(state),
      noop,
      "Serveur de comptes indisponible.",
      false,
      false,
      noop,
      noop,
      "login",
      {
        confirmPassword: "",
        currentPassword: "",
        email: "",
        password: "secret",
        username: "Test",
      },
      "Session compte indisponible.",
      (nickname) => nicknames.push(nickname),
      noop,
      noop,
      false,
      noop,
    ]);

    await controller[11]();

    assert.deepEqual(
      requests.map((request) => request.url),
      ["/api/auth/login", "/api/auth/status"]
    );
    assert.deepEqual(requests[0].body, {
      installId: "local-test-install",
      password: "secret",
      username: "Test",
    });
    assert.deepEqual(submittingStates, [true, false]);
    assert.equal(modalModes.at(-1), null);
    assert.equal(authStates.at(-1)?.status, "authenticated");
    assert.equal(nicknames.at(-1), "Test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
