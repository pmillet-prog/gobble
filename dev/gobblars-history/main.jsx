import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import GobblarsHistoryDialog from "../../src/features/gobblars/GobblarsHistoryDialog.jsx";
import "../../src/index.css";

const accountId = 9123;
const at = Date.parse("2026-10-06T14:15:00+02:00");
const firstPage = [
  { id: "weekly", at, kind: "weekly_duel_winner", amount: 100, weekId: "2026-W40" },
  { id: "avatar", at: at - 1000, kind: "avatar_unlock", amount: -450,
    items: [{ key: "headwear:mage", label: "Chapeau de mage", amount: 300 }, { key: "glasses:round", label: "Rondes", amount: 150 }] },
  { id: "theme", at: at - 2000, kind: "theme_unlock_single", amount: -125,
    items: [{ key: "background:midnight", label: "Nuit étoilée", amount: 125 }] },
  { id: "refund", at: at - 3000, kind: "avatar_refund", amount: 450 },
  { id: "tournament", at: at - 4000, kind: "tournament", amount: 23, gobbles: 3, medalAmount: 20, medals: { gold: 1 } },
];
const olderPage = [{ id: "theme-full", at: at - 5000, kind: "theme_unlock_full", amount: -1000,
  items: Array.from({ length: 8 }, (_, index) => ({ key: `background:old-${index}`, label: `Élément de collection au nom très long numéro ${index + 1}`, amount: 125 })) },
  { id: "legacy-avatar", at: at - 6000, kind: "avatar_unlock", amount: -90, items: [{ key: "hair:ancienne-coupe" }] }];
let scenario = "normal", requests = [], closes = 0;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.href);
  if (!url.pathname.startsWith("/api/")) return originalFetch(input, options);
  if (url.pathname !== "/api/gobblars/history") throw new Error(`Unexpected fixture request: ${url.pathname}`);
  requests.push({ before: url.searchParams.get("before"), snapshot: url.searchParams.get("snapshot"), credentials: options.credentials });
  const requestScenario = scenario;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, requestScenario === "loading" ? 12000 : 30);
    options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
  const entries = requestScenario === "empty" ? [] : url.searchParams.has("before") ? olderPage : firstPage;
  return new Response(JSON.stringify({ ok: requestScenario !== "error", accountId, entries,
    snapshot: "fixture-snapshot", nextBefore: !url.searchParams.has("before") && requestScenario !== "empty" ? "fixture-before" : null }),
  { status: requestScenario === "error" ? 503 : 200, headers: { "Content-Type": "application/json" } });
};
const rect = element => {
  if (!element) return null;
  const { x, y, right, bottom, width, height } = element.getBoundingClientRect();
  return { x, y, right, bottom, width, height };
};
function App() {
  const [open, setOpen] = React.useState(true);
  const [revision, setRevision] = React.useState(0);
  window.gobblarsHistoryFixture = {
    reset(next = "normal") {
      scenario = next; requests = []; closes = 0;
      flushSync(() => { setOpen(true); setRevision(value => value + 1); });
    },
    setScenario(next) { scenario = next; },
    snapshot() {
      const dialog = document.querySelector("dialog[open]");
      return { text: dialog?.innerText || "", panel: rect(dialog), title: dialog?.querySelector("h2")?.textContent,
        labelledBy: dialog?.getAttribute("aria-labelledby"), titleId: dialog?.querySelector("h2")?.id,
        busy: dialog?.querySelector("[aria-busy]")?.getAttribute("aria-busy"),
        amounts: Array.from(dialog?.querySelectorAll("li b") || []).map(el => ({ text: el.textContent, label: el.getAttribute("aria-label"), rect: rect(el) })),
        contentWidth: dialog?.scrollWidth, clientWidth: dialog?.clientWidth,
        documentWidth: document.documentElement.scrollWidth, requests: [...requests], closes,
        focus: document.activeElement?.getAttribute("aria-label"), buttons: Array.from(dialog?.querySelectorAll("button") || []).map(el => ({ text: el.textContent, disabled: el.disabled })) };
    },
  };
  return <><main style={{ padding: 24 }}><h1>Historique des gobblars</h1><p>Données de test en mémoire. Aucun compte ni solde réel.</p></main>
    {open && <GobblarsHistoryDialog key={revision} accountId={accountId} onClose={() => { closes++; setOpen(false); }} />}</>;
}
createRoot(document.getElementById("root")).render(<App />);
