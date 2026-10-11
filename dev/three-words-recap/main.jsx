import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createApplicationKernel } from "../../src/app/core/createApplicationKernel.js";
import { createStateFeature } from "../../src/app/core/createStateFeature.js";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import AssetManager from "../../src/assets/assetManager.js";
import DailySpecialRecapDialog from "../../src/components/daily/DailySpecialRecapDialog.jsx";
import { getDailySpecialWordReview } from "../../src/components/daily/dailySpecialRecapModel.js";
import "../../src/index.css";
import "../../src/styles/gameRuntime.css";

// Isolated browser fixture: no game transport, API requests or saved preferences.
const defaults = { isSfxMuted: false, soundGobbleEnabled: true, soundValidationEnabled: true,
  soundInvalidErrorEnabled: true, visualGobbleEnabled: true, preferLiteVisualEffects: false };
const kernel = createApplicationKernel({ ports: {} });
kernel.features.define("preferences", context => createStateFeature(context, defaults));
// Preferences belong to the application, so retain the same feature across dialogs.
const preferencesLease = kernel.features.acquire("preferences");
const preferences = preferencesLease.feature;
const single = { score: 451, wordReview: [
  { word: "INTERPRETATION", valid: true, points: 400, gobble: true },
  { word: "INVENTIONFAUSSE", valid: false, points: 900, gobble: true, doubleGobble: true, reason: "not_in_dictionary" },
  { word: "CHAT", valid: true, points: 51 },
] };
const fixtures = {
  single,
  double: { ...single, wordReview: [{ ...single.wordReview[0], doubleGobble: true }, ...single.wordReview.slice(1)] },
  delayed: { ...single, wordReview: [single.wordReview[2], single.wordReview[0], single.wordReview[1]] },
  invalid: { score: 51, wordReview: [single.wordReview[1], single.wordReview[2], { word: "", valid: false }] },
};
let started = performance.now(), revision = 0, setOpened;
let calls = [], changes = [], lastState = "";
const elapsed = () => performance.now() - started;
function snapshot() {
  const dialog = document.querySelector(".daily-special-recap");
  return {
    at: elapsed(), open: !!dialog?.open,
    modal: !!dialog?.matches(":modal"),
    statuses: [...document.querySelectorAll(".daily-special-recap-word")].map(el => el.className.split("is-")[1]),
    badges: [...document.querySelectorAll(".daily-special-recap-gobble-badge")].map(el => el.textContent),
    effects: [...document.querySelectorAll(".daily-special-recap-gobble-effect img")].map(el => el.getAttribute("src")),
    done: document.querySelector(".daily-special-recap-done")?.textContent || null,
  };
}
function record() {
  const value = snapshot();
  const key = JSON.stringify({ ...value, at: 0 });
  if (key !== lastState) { changes.push(value); lastState = key; }
}
new MutationObserver(record).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open"] });
AssetManager.playSfx = (key, options) => {
  calls.push({ at: elapsed(), key, options });
  return true;
};
function close() { setOpened(null); }
window.recapHarness = {
  open({ fixture = "single", animate = true, prefs = {} } = {}) {
    flushSync(() => setOpened(null));
    preferences.patch({ ...defaults, ...prefs });
    started = performance.now(); calls = []; changes = []; lastState = "";
    const result = fixtures[fixture], review = getDailySpecialWordReview(result);
    flushSync(() => setOpened({ key: ++revision, result, review, animate }));
    record();
    return { result, review };
  },
  close() { flushSync(close); },
  preferences(patch) { flushSync(() => preferences.patch(patch)); },
  report() { return { state: snapshot(), calls, changes, preferences: preferences.store.getState() }; },
};
function Preview() {
  const [opened, update] = React.useState(null);
  setOpened = update;
  return <ApplicationRuntimeProvider kernel={kernel}>
    <main style={{ padding: 20, fontFamily: "system-ui", color: "#e2e8f0", background: "#0b1525", minHeight: "100vh" }}>
      <h1 style={{ fontWeight: 800 }}>Bilan 3 mots — vérification locale</h1>
      <p>Vrais composants ; résultats fictifs ; son observé sans lecture audio.</p>
      <button type="button" onClick={() => window.recapHarness.open()} style={{ padding: 12, border: "1px solid #64748b", marginTop: 16 }}>Ouvrir le bilan</button>
      <div id="behind-layer" style={{ position: "fixed", zIndex: 2147483647, bottom: 10, left: 10, padding: 4, color: "#8295ad" }}>Couche de l’application, sous le dialogue</div>
    </main>
    {opened ? <DailySpecialRecapDialog {...opened} onClose={close} /> : null}
  </ApplicationRuntimeProvider>;
}
createRoot(document.getElementById("root")).render(<Preview />);
