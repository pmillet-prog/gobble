import test from "node:test";
import assert from "node:assert/strict";
import { presentGobblarsMovement } from "./gobblarsHistoryModel.js";

const at = Date.parse("2026-10-06T12:00:00Z");
const present = entry => presentGobblarsMovement({ at, ...entry });

test("quiz rewards name the game and the ten-thousand-point milestone", () => {
  const result = present({ kind: "target_quiz_milestone", amount: 50 });
  assert.equal(result.title, "Qui veut gagner des Gobblars · palier de 10 000 points");
  assert.equal(result.signedAmount, "+50");
  assert.equal(result.amountLabel, "50 gobblars reçus");
});

test("avatar purchases show a debit, readable item names and only recorded item prices", () => {
  const result = present({ kind: "avatar_unlock", amount: -2500, items: [
    { key: "headwear:fedora", label: "Fédora", amount: 2000 },
    { key: "brows:soft", label: "Doux" },
  ] });
  assert.equal(result.title, "Achat d’éléments d’avatar");
  assert.equal(result.isDebit, true);
  assert.match(result.signedAmount, /^−2\s500$/);
  assert.match(result.amountLabel, /^2\s500 gobblars dépensés$/);
  assert.match(result.items[0], /^Chapeau · Fédora : 2\s000 gobblars$/);
  assert.equal(result.items[1], "Sourcils · Doux");
});

test("old theme purchases resolve category and option names without requiring avatar assets", () => {
  const result = present({ kind: "theme_unlock_full", amount: -1000, items: [
    { key: "font:rounded", amount: 500 },
    { key: "tileColor:ocean", amount: 500 },
  ] });
  assert.equal(result.title, "Achat d’éléments de thème");
  assert.deepEqual(result.items, ["Police · Arrondie : 500 gobblars", "Couleur de tuile · Océan : 500 gobblars"]);
  assert.equal(present({ kind: "theme_unlock_single", amount: -500, items: [
    { key: "font:rounded", label: "Nom enregistré lors de l’achat" },
  ] }).items[0], "Police · Nom enregistré lors de l’achat");
});

test("avatar reset refunds explicitly return a positive amount", () => {
  const result = present({ kind: "avatar_refund", amount: 2500, items: [
    { key: "headwear:fedora", label: "Fédora", amount: 2000 },
  ] });
  assert.equal(result.title, "Avatar réinitialisé · remboursement");
  assert.equal(result.isDebit, false);
  assert.match(result.signedAmount, /^\+2\s500$/);
  assert.match(result.amountLabel, /^2\s500 gobblars restitués$/);
  assert.match(result.items[0], /Fédora/);
});

test("weekly winning team rewards identify the ISO week without showing internal codes", () => {
  const result = present({ kind: "weekly_duel_winner", amount: 300, weekId: "2026-W40" });
  assert.equal(result.title, "Prime · équipe gagnante du duel hebdomadaire");
  assert.equal(result.detail, "Semaine 40 de 2026");
  assert.equal(result.signedAmount, "+300");
  assert.equal(result.amountLabel, "300 gobblars reçus");
  assert.equal(present({ kind: "weekly_duel_winner", amount: 300 }).detail, "");
});

test("unknown debit reasons cannot be labelled as gains or receive a double sign", () => {
  const result = present({ kind: "legacy_purchase", amount: -75 });
  assert.equal(result.title, "Dépense de gobblars");
  assert.equal(result.signedAmount, "−75");
  assert.equal(result.amountLabel, "75 gobblars dépensés");
  assert.deepEqual(result.items, []);
  assert.equal(present({ kind: "manual", amount: -75 }).title, "Débit de gobblars");
  assert.equal(present({ kind: "manual", amount: 75 }).title, "Crédit de gobblars");
});
