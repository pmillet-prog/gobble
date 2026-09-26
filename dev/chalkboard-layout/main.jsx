// Local-only browser fixture: no account, game server or persistent writes.
import React from "react";
import { createRoot } from "react-dom/client";
import ChalkboardApplication from "../../src/features/chalkboard/ChalkboardApplication.jsx";
import useScreenOrientation from "../../src/features/layout/useScreenOrientation.js";
const SettingsFixture = React.lazy(() => import("./SettingsFixture.jsx"));

const originalFetch = window.fetch.bind(window);
window.fetch = (url, options) => {
  const path = String(url).split("?")[0];
  if (!path.startsWith("/api/")) return originalFetch(url, options);
  if (options?.method && options.method !== "GET") throw new Error("No writes in the layout fixture");
  const payload = path === "/api/chalkboard/fonts" ? { fonts: [
    { id: "chalk", src: "/chalkfont/chalk.otf" },
    { id: "white-chalk", src: "/chalkfont/white-chalk.ttf" },
    { id: "vintage-fair", src: "/chalkfont/Vintage_fair.ttf" },
  ] }
    : path === "/api/chalkboard/archives" ? { archives: [], next: null }
    : { board: "free", interventions: [], revision: 1, weekId: "2026-09-21", canModerate: false };
  return Promise.resolve(Response.json({ ok: true, ...payload }));
};
window.layoutOrientationCalls = [];
screen.orientation.lock = mode => { window.layoutOrientationCalls.push(mode); return Promise.resolve(); };
screen.orientation.unlock = () => window.layoutOrientationCalls.push("default");
const nativeViewport = window.visualViewport;
window.layoutViewport = {};
const viewport = new Proxy(nativeViewport, { get(target, property) {
  if (Object.hasOwn(window.layoutViewport, property)) return window.layoutViewport[property];
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
} });
Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
window.setLayoutViewport = value => { window.layoutViewport = value; nativeViewport.dispatchEvent(new Event("resize")); };

function Fixture() {
  const [open, setOpen] = React.useState(true);
  useScreenOrientation({ isMobileLayout: true, allowLandscape: open });
  return open ? <ChalkboardApplication canPublish onClose={() => setOpen(false)} /> : <p>Accueil</p>;
}
createRoot(document.getElementById("root")).render(new URLSearchParams(location.search).has("settings")
  ? <React.Suspense fallback={null}><SettingsFixture /></React.Suspense> : <Fixture />);
