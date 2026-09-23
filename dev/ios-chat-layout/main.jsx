// Actual home/chat components with an in-memory chat store. No game server.
import React from "react";
import { createRoot } from "react-dom/client";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import HomeLobby from "../../src/components/home/HomeLobby.jsx";
import ChatStyleSlide from "../../src/components/chat/ChatStyleSlide.jsx";
import "../../src/index.css";
import "../../src/styles/gameRuntime.css";

Object.defineProperty(navigator, "standalone", { configurable: true,
  value: new URLSearchParams(location.search).get("mode") !== "browser" });

let state = { input: "", messages: [], tab: "messages", blockedInstallIds: [], showBotMessages: true };
const subscribers = new Set();
const chat = {
  store: { getState: () => state, subscribe: callback => { subscribers.add(callback); return () => subscribers.delete(callback); } },
  set: (key, value) => {
    state = { ...state, [key]: typeof value === "function" ? value(state[key]) : value };
    subscribers.forEach(callback => callback());
  },
};
const kernel = { features: {
  prepare: name => { if (name !== "chat") throw new Error(`Unexpected feature: ${name}`); return chat; },
  acquire: () => ({ release() {} }),
} };
const nativeViewport = window.visualViewport;
window.layoutViewport = {};
Object.defineProperty(window, "visualViewport", { configurable: true, value: new Proxy(nativeViewport, {
  get(target, property) {
    if (Object.hasOwn(window.layoutViewport, property)) return window.layoutViewport[property];
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) });
window.setLayoutViewport = value => { window.layoutViewport = value; nativeViewport.dispatchEvent(new Event("resize")); };

function Fixture() {
  const [open, setOpen] = React.useState(true);
  window.openLayoutChat = () => setOpen(true);
  return <ApplicationRuntimeProvider kernel={kernel}>
    <HomeLobby playIntro={false} accountLabel="Test" onOpenChat={() => setOpen(true)} />
    <ChatStyleSlide darkMode isChatOpenMobile={open} chatOpenedAtMs={1} chatAnimationMs={0} setIsChatOpenMobile={setOpen} />
  </ApplicationRuntimeProvider>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
