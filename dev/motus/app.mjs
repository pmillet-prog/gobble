import { createMotusController } from "./controller.mjs";
import { createView } from "./view.mjs";
import { createMotusFeedback } from "./feedback.mjs";

const view = createView(document);
const feedback = createMotusFeedback({ onVictoryFrame: view.setVictoryFrame });
const listeners = new AbortController();
const listen = (element, event, handler) => element.addEventListener(event, handler, { signal: listeners.signal });
let controller;

listen(document, "pointerdown", () => feedback.unlock());
listen(document, "keydown", () => feedback.unlock());
listen(document.querySelector("#sound-enabled"), "change", event => feedback.setEnabled(event.target.checked));

try {
  const response = await fetch("./data/words.json");
  if (!response.ok) throw new Error(`Banque de mots indisponible (${response.status}).`);
  const bank = await response.json();
  if (bank.schemaVersion !== 1 || bank.wordLength !== 6 || !bank.accepted?.length || !bank.targets?.length) throw new Error("La banque de mots est invalide.");
  controller = createMotusController({
    accepted: new Set(bank.accepted), targets: bank.targets, onChange: view.render,
    onCue: detail => {
      feedback.cue(detail);
      document.dispatchEvent(new CustomEvent("motus:cue", { detail }));
    },
  });
  listen(view.input, "input", event => { if (!event.isComposing) controller.edit(view.input.value); });
  listen(view.input, "compositionend", () => controller.edit(view.input.value));
  listen(document.querySelector("#guess-form"), "submit", event => { event.preventDefault(); controller.edit(view.input.value); controller.submit(); });
  listen(document.querySelector("#new-round"), "click", () => controller.newRound());
  listen(view.keyboard, "click", event => {
    const key = event.target.closest("button[data-key]");
    if (!key || key.disabled) return;
    const state = controller.getState();
    if (key.dataset.key === "↵") controller.submit();
    else controller.edit(key.dataset.key === "⌫" ? state.draft.slice(0, -1) : state.draft + key.dataset.key);
  });
  // Physical keyboard also works after using the on-screen keyboard or a button.
  listen(document, "keydown", event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.target.closest("input, textarea, select, summary") || controller.getState().phase !== "playing") return;
    if (/^[a-zA-ZÀ-ÿ]$/.test(event.key)) { event.preventDefault(); controller.edit(controller.getState().draft + event.key); }
    else if (event.key === "Backspace") { event.preventDefault(); controller.edit(controller.getState().draft.slice(0, -1)); }
    else if (event.key === "Enter" && (event.target.closest("#keyboard") || event.target === document.body)) { event.preventDefault(); controller.submit(); }
  });
  listen(document.querySelector("#seed-form"), "submit", event => {
    event.preventDefault();
    const word = document.querySelector("#seed-word").value.trim();
    const valid = Boolean(word) && controller.newRound(word);
    document.querySelector("#seed-status").textContent = valid ? "Mot chargé." : "Ce mot ne fait pas partie des mots à trouver autorisés.";
  });
  listen(document.querySelector("#give-up"), "click", () => controller.giveUp());
  listen(document.querySelector("#fast"), "change", event => controller.setFast(event.target.checked));
  document.querySelector("#bank-info").textContent = `${bank.counts.targets.toLocaleString("fr")} mots à trouver · ${bank.counts.accepted.toLocaleString("fr")} propositions autorisées. Les formes non classées restent hors du tirage.`;
  controller.newRound();
} catch (error) {
  document.querySelector("#feedback").textContent = `Impossible de préparer le jeu. ${error.message} Rechargez la page après avoir généré les mots.`;
  document.querySelector("#feedback").dataset.error = "true";
}

window.addEventListener("pagehide", () => { controller?.dispose(); feedback.dispose(); listeners.abort(); }, { once: true });
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
