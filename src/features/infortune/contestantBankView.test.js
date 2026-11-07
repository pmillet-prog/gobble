import test from "node:test";
import assert from "node:assert/strict";
import { contestantBankView } from "./contestantBankView.js";

test("an unknown contestant balance remains unknown while a real zero is displayed", () => {
  for (const economy of [null, {}, { members: {} }, { members: { player: { spin: "pending" } } }]) {
    assert.equal(contestantBankView(economy, "player").amount, "—");
  }
  assert.equal(contestantBankView({ members: { player: { bank: 0 } } }, "player").amount, "0 €");
});

test("an authoritative result changes the balance and its availability immediately", () => {
  const initial = contestantBankView({ members: { player: { bank: 1200, spin: "pending" } } }, "player");
  const completed = contestantBankView({ members: { player: { bank: 1800, spin: "done" } } }, "player");
  assert.equal(initial.status, "Lancer en attente");
  assert.equal(completed.status, "Lancer terminé");
  assert.equal(completed.amount, `${(1800).toLocaleString("fr-FR")} €`);
  assert.equal(contestantBankView({ members: { player: { bank: 1200, spin: "skipped" } } }, "player").status, "Lancer passé");
});

test("round four hides a missing or stale bank before and after a result or exchange", () => {
  for (const spin of ["pending", "done", "skipped"]) {
    for (const bank of [undefined, 123456]) {
      const view = contestantBankView({ hidden: true, members: { player: { bank, spin } } }, "player");
      assert.equal(view.hidden, true);
      assert.equal(view.amount, "Cagnotte masquée");
      assert.ok(!JSON.stringify(view).includes("123456"));
    }
  }
});

test("a settled trio can reveal its banks while another trio is still choosing", () => {
  const economy = { hidden: true, members: { player: { bank: 900, revealed: true }, other: { bank: 300 } } };
  assert.equal(contestantBankView(economy, "player").amount, "900 €");
  assert.equal(contestantBankView(economy, "other").hidden, true);
});
