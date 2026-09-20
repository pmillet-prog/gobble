import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

function createRealtimeStub() {
  return {
    auth: {},
    connected: false,
    bind: () => () => {},
    connect: () => {},
    disconnect: () => {},
    emit: () => {},
    emitReserved: () => {},
    off: () => {},
    on: () => {},
    once: () => {},
  };
}

function installBrowserGlobals() {
  const globalNames = ["document", "navigator", "self", "window"];
  const originalDescriptors = new Map(
    globalNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ])
  );
  const storedValues = new Map();
  const storage = {
    clear: () => storedValues.clear(),
    getItem: (key) => storedValues.get(String(key)) ?? null,
    removeItem: (key) => storedValues.delete(String(key)),
    setItem: (key, value) => storedValues.set(String(key), String(value)),
  };
  const classList = {
    add: () => {},
    contains: () => false,
    remove: () => {},
    toggle: () => false,
  };
  const documentStub = {
    addEventListener: () => {},
    body: { appendChild: () => {}, classList, style: {} },
    createElement: () => ({
      classList,
      getBoundingClientRect: () => ({ height: 0, width: 0 }),
      remove: () => {},
      style: {},
    }),
    documentElement: {
      classList,
      clientHeight: 720,
      clientWidth: 1280,
      style: {},
    },
    removeEventListener: () => {},
    visibilityState: "visible",
  };
  const navigatorStub = {
    language: "fr",
    languages: ["fr", "fr-FR"],
    maxTouchPoints: 0,
    onLine: true,
    userAgent: "Gobble client render smoke test",
  };
  const windowStub = {
    addEventListener: () => {},
    cancelAnimationFrame: () => {},
    crypto: globalThis.crypto,
    devicePixelRatio: 1,
    document: documentStub,
    getComputedStyle: () => ({ fontSize: "16px" }),
    innerHeight: 720,
    innerWidth: 1280,
    localStorage: storage,
    location: {
      hash: "",
      hostname: "localhost",
      href: "http://localhost:3000/",
      origin: "http://localhost:3000",
      pathname: "/",
      search: "",
    },
    matchMedia: () => ({
      addEventListener: () => {},
      matches: false,
      removeEventListener: () => {},
    }),
    navigator: navigatorStub,
    removeEventListener: () => {},
    requestAnimationFrame: () => 1,
    sessionStorage: storage,
    visualViewport: null,
  };
  windowStub.self = windowStub;
  windowStub.window = windowStub;

  Object.defineProperties(globalThis, {
    document: { configurable: true, value: documentStub },
    navigator: { configurable: true, value: navigatorStub },
    self: { configurable: true, value: windowStub },
    window: { configurable: true, value: windowStub },
  });

  return () => {
    for (const [name, descriptor] of originalDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete globalThis[name];
      }
    }
  };
}

test("GobbleApplication renders home, quick help in the salon, and authenticated live gameplay", async () => {
  let kernel = null;
  let vite = null;
  let restoreBrowserGlobals = () => {};
  vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    plugins: [
      {
        enforce: "pre",
        load(id) {
          // Server rendering cannot mount DOM portals. Keep the real help content
          // and render its portal inline to exercise the application's salon branch.
          if (id === "\0gobble-help-portal-stub") return "export const createPortal = children => children;";
          if (id !== "\0gobble-client-socket-stub") return null;
          return `
            const socket = {
              auth: {}, connected: false,
              bind: () => () => {}, connect: () => {}, disconnect: () => {},
              emit: () => {}, emitReserved: () => {}, off: () => {},
              on: () => {}, once: () => {}
            };
            export default socket;
          `;
        },
        name: "gobble-client-socket-stub",
        transform(source, id) {
          if (!id.replaceAll("\\", "/").endsWith("/components/HelpOverlay.jsx")) return null;
          return { code: source.replace('from "react-dom";', 'from "virtual:gobble-help-portal";'), map: null };
        },
        resolveId(source) {
          if (source === "virtual:gobble-help-portal") {
            return "\0gobble-help-portal-stub";
          }
          return source === "./socket.js" ||
            source === "../socket.js" ||
            source.endsWith("/socket.js")
            ? "\0gobble-client-socket-stub"
            : null;
        },
      },
    ],
    server: { middlewareMode: true },
  });
  try {
    const [
      { default: GobbleApplication },
      { createApplicationKernel },
      { registerClientFeatures },
      { ApplicationRuntimeProvider },
      { TraceRuntimeProvider },
      { CelebrationRuntimeProvider },
      { default: AboutModals },
      { PATCH_NOTES_VERSION },
    ] = await Promise.all([
      vite.ssrLoadModule("/src/GobbleApplication.jsx"),
      vite.ssrLoadModule("/src/app/core/createApplicationKernel.js"),
      vite.ssrLoadModule("/src/app/registerClientFeatures.js"),
      vite.ssrLoadModule("/src/app/react/ApplicationRuntimeProvider.jsx"),
      vite.ssrLoadModule("/src/features/trace/TraceRuntime.jsx"),
      vite.ssrLoadModule("/src/features/celebration/CelebrationRuntime.jsx"),
      vite.ssrLoadModule("/src/components/about/AboutModals.jsx"),
      vite.ssrLoadModule("/src/features/overlays/useLobbyPopupCoordinator.js"),
    ]);
    restoreBrowserGlobals = installBrowserGlobals();
    kernel = registerClientFeatures(
      createApplicationKernel({ ports: { realtime: createRealtimeStub() } })
    );
    const createTree = () =>
      React.createElement(
        ApplicationRuntimeProvider,
        { kernel },
        React.createElement(
          TraceRuntimeProvider,
          null,
          React.createElement(
            CelebrationRuntimeProvider,
            null,
            React.createElement(GobbleApplication)
          )
        )
      );

    const originalConsoleError = console.error;
    console.error = (...args) => {
      if (
        String(args[0] || "").includes(
          "useLayoutEffect does nothing on the server"
        )
      ) {
        return;
      }
      originalConsoleError(...args);
    };
    try {
      const homeHtml = renderToString(createTree());
      assert.match(homeHtml, /aria-label="Le grand tableau"/, "Visitors can open the public chalkboard from home");

      const patchNotesHtml = renderToString(React.createElement(AboutModals, { isPatchNotesOpen: true }));
      const newReleasePosition = patchNotesHtml.indexOf(`dateTime="${PATCH_NOTES_VERSION}"`);
      assert.ok(newReleasePosition >= 0, "The announced release is included in the Patchnotes dialog");
      assert.ok(
        newReleasePosition < patchNotesHtml.indexOf('dateTime="2026-09-19"'),
        "The new release appears before the previous patch notes",
      );

      kernel.commands.session.setAuthState({
        legacyProfile: null,
        loading: false,
        status: "authenticated",
        user: { id: "test-user", usernameDisplay: "Test" },
      });
      kernel.commands.session.setIsLoggedIn(true);
      kernel.commands.session.setNickname("Test");
      kernel.commands.navigation.go("live");
      kernel.commands.game.setPhase("lobby");
      const overlays = kernel.features.prepare("overlays");
      overlays.set("helpOpen", true);
      renderToString(createTree());
      await vite.ssrLoadModule("/src/components/HelpOverlay.jsx");
      await new Promise(resolve => setImmediate(resolve));
      const salonHelpHtml = renderToString(createTree());
      assert.match(salonHelpHtml, /aria-label="Aide de jeu"/, "Quick help is mounted in the salon");
      assert.equal((salonHelpHtml.match(/aria-label="Aide de jeu"/g) || []).length, 1);
      assert.match(salonHelpHtml, /Règles et scoring/);
      overlays.set("helpOpen", false);
      assert.doesNotMatch(renderToString(createTree()), /aria-label="Aide de jeu"/);
      kernel.commands.game.setPhase("playing");

      assert.doesNotThrow(() => renderToString(createTree()));
    } finally {
      console.error = originalConsoleError;
    }
  } finally {
    kernel?.dispose();
    await vite?.close();
    restoreBrowserGlobals();
  }
});
